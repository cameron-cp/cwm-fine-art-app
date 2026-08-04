import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveInterestValue } from "@/lib/interests/resolve";
import { sanitizeSearch } from "@/lib/search";
import {
  ARTWORK_PARTY_ROLE_LABELS,
  TITLE_ROLE,
  type ArtworkPartyRole,
} from "@/lib/schemas/artwork-party";
import {
  interestConfidences,
  interestDimensions,
  interestSchema,
  interestSentiments,
} from "@/lib/schemas/interest";
import { formatPriceCents } from "@/lib/supabase/storage";
import { search as vaultSearch } from "@/lib/vault/queries";

// Tool surface for the Registrar chat agent (docs/chat-agent.md).
//
// Every executor returns BOTH a model-facing `result` (JSON the model reasons
// over) and machine `refs` — the records it touched — so the UI can render a
// "records consulted" citation trail without parsing prose. All reads go
// through the caller's user-JWT Supabase client: the agent sees exactly what
// the signed-in dealer sees, nothing more.
//
// log_collector_interest is the ONE write. It funnels through the same
// interestSchema as the manual editor, so chat can never persist a shape the
// form couldn't.

export type RecordRef = {
  kind: "artwork" | "party" | "artist" | "note";
  id: string;
  label: string;
};

export type ToolExecution = {
  result: unknown;
  refs: RecordRef[];
  /** One-line human summary for the UI citation trail. */
  summary: string;
};

// Untyped PostgREST embeds come back as object-or-single-element-array
// depending on the relationship; tolerate both (artworks/page.tsx precedent).
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function many<T>(v: T | T[] | null | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

const CONFIDENCE_SUFFIX: Record<string, string> = {
  confirmed: "",
  likely: " (likely)",
  tentative: " (tentative)",
};

// ---------------------------------------------------------------------------
// Tool definitions (Anthropic JSON schemas, import-draft convention)
// ---------------------------------------------------------------------------

export const REGISTRAR_TOOLS = [
  {
    name: "search_artworks",
    description:
      "Search every artwork on file — the gallery's own inventory AND tracked works (works the dealer knows about but does not hold). Returns each work's wall-label fields plus its current owner(s) and physical location. Use record_kind to restrict to one population.",
    input_schema: {
      type: "object" as const,
      properties: {
        artist: {
          type: "string",
          description: "Artist name, full or partial, e.g. 'Joan Mitchell' or 'mitchell'.",
        },
        title: { type: "string", description: "Words from the work's title." },
        year_from: { type: "integer", description: "Earliest year, inclusive. For '1960s' use 1960." },
        year_to: { type: "integer", description: "Latest year, inclusive. For '1960s' use 1969." },
        medium: { type: "string", description: "Medium substring, e.g. 'oil' or 'paper'." },
        status: { type: "string", enum: ["available", "on_hold", "sold", "not_for_sale"] },
        record_kind: {
          type: "string",
          enum: ["inventory", "tracked"],
          description: "inventory = the gallery's own stock; tracked = known market works. Omit to search both.",
        },
        limit: { type: "integer", description: "Max rows, default 20." },
      },
    },
  },
  {
    name: "get_artwork",
    description:
      "Full record for one artwork by id: dimensions, edition, signature, catalogue raisonné, exhibition history, literature, provenance lines, notes, complete ownership history, other parties attached to the work (advisor, gallery, consignor, conservator and the like — these do NOT hold title), and current location.",
    input_schema: {
      type: "object" as const,
      properties: {
        artwork_id: { type: "string", description: "The artwork's uuid, from search_artworks." },
      },
      required: ["artwork_id"],
    },
  },
  {
    name: "search_parties",
    description:
      "Find people and organizations in the dealer's contacts by name or email. Returns id, name, kind, roles (collector, dealer, museum, …).",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Name or email fragment, e.g. 'John Smith'." },
        limit: { type: "integer", description: "Max rows, default 10." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_party",
    description:
      "Full profile for one contact by id: roles, recorded interests (what they seek/collect/avoid), relationships to other parties, works they currently own (currently_owns = title only), works they are otherwise attached to without holding title (other_work_links — advisor, gallery, consignor and the like), and the dealer's notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        party_id: { type: "string", description: "The party's uuid, from search_parties." },
      },
      required: ["party_id"],
    },
  },
  {
    name: "search_notes",
    description:
      "Search the dealer's private notes archive (her second brain: meeting notes, people, works, conversations). Use this to recall past discussions — e.g. who a work was shown to and how pricing was received. Returns note excerpts.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term: a person, a work, a topic." },
        limit: { type: "integer", description: "Max notes, default 6." },
      },
      required: ["query"],
    },
  },
  {
    name: "log_collector_interest",
    description:
      "Record a collector interest the dealer just stated (e.g. 'John Smith is looking for a 1960s Joan Mitchell' → one artist interest + one era interest). Only log facts the dealer states — never speculation. Report back exactly what was recorded. For a decade, use dimension 'era' with value like '1960s'.",
    input_schema: {
      type: "object" as const,
      properties: {
        party_id: { type: "string", description: "The collector's uuid, from search_parties." },
        dimension: { type: "string", enum: [...interestDimensions] },
        sentiment: {
          type: "string",
          enum: [...interestSentiments],
          description: "Default 'seeking'.",
        },
        confidence: {
          type: "string",
          enum: [...interestConfidences],
          description: "Default 'likely' for conversational mentions; 'confirmed' only when the dealer is definitive.",
        },
        artist_name: {
          type: "string",
          description: "Required when dimension='artist'. The artist's name; it is resolved against the artists table, never stored as free text.",
        },
        value: {
          type: "string",
          description: "Required for medium/era/movement/school/nationality/subject/format. ISO alpha-2 code for nationality.",
        },
        price_min_cents: { type: "integer", description: "For dimension='price_band', in cents." },
        price_max_cents: { type: "integer", description: "For dimension='price_band', in cents." },
        qualifier: { type: "string", description: "Free-text nuance, e.g. 'early period only'." },
      },
      required: ["party_id", "dimension"],
    },
  },
];

// ---------------------------------------------------------------------------
// Row shapes for the embedded selects. The deep embed strings defeat
// supabase-js's type-level parser (it falls back to GenericStringError), so —
// per the artworks/page.tsx precedent — results are cast through `unknown`
// onto these hand-written shapes.
// ---------------------------------------------------------------------------

type ArtistEmbed = { id: string; name: string };

type ArtworkPartyEmbed = {
  role: string;
  ended_on: string | null;
  started_on?: string | null;
  confidence: string;
  source?: string;
  notes?: string | null;
  party: { id: string; display_name: string } | { id: string; display_name: string }[] | null;
};

type LocationEmbed = {
  label: string | null;
  party: { display_name: string } | { display_name: string }[] | null;
};

type ArtworkSearchRow = {
  id: string;
  title: string;
  year: number | null;
  medium: string | null;
  edition: string | null;
  status: string;
  record_kind: string;
  price_cents: number | null;
  currency: string;
  artist: ArtistEmbed | ArtistEmbed[] | null;
  /** ALL party edges, every role — filter before calling any of them an owner. */
  parties: ArtworkPartyEmbed[] | null;
  location: LocationEmbed | LocationEmbed[] | null;
};

type ArtworkDetailRow = ArtworkSearchRow & {
  height_in: number | null;
  width_in: number | null;
  depth_in: number | null;
  signature_details: string | null;
  catalogue_raisonne: string | null;
  exhibited: string | null;
  literature: string | null;
  provenance_lines: string[] | null;
  condition: string | null;
  notes: string | null;
};

type PartySearchRow = {
  id: string;
  display_name: string;
  legal_name: string | null;
  kind: string;
  email: string | null;
  is_unidentified: boolean;
  roles: { role: string }[] | null;
};

type PartyDetailRow = PartySearchRow & {
  phone: string | null;
  notes: string | null;
};

type InterestQueryRow = {
  dimension: string;
  sentiment: string;
  source: string;
  confidence: string;
  value: string | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  qualifier: string | null;
  created_at: string;
  artist: ArtistEmbed | ArtistEmbed[] | null;
};

type PartyEmbed = { id: string; display_name: string };

type RelationshipQueryRow = {
  type: string;
  valid_from: string | null;
  valid_to: string | null;
  notes: string | null;
  from_party: PartyEmbed | PartyEmbed[] | null;
  to_party: PartyEmbed | PartyEmbed[] | null;
};

type OwnedArtworkEmbed = {
  id: string;
  title: string;
  year: number | null;
  artist: { name: string } | { name: string }[] | null;
};

type LinkedWorkQueryRow = {
  role: string;
  started_on: string | null;
  ended_on: string | null;
  confidence: string;
  artwork: OwnedArtworkEmbed | OwnedArtworkEmbed[] | null;
};

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

function ownerNames(
  links: ArtworkPartyEmbed[],
  recordKind: string,
): { names: string[]; refs: RecordRef[] } {
  // role === TITLE_ROLE is load-bearing: artwork_parties also holds advisor /
  // gallery / conservator edges, and none of those hold title.
  const current = links.filter((o) => o.role === TITLE_ROLE && o.ended_on === null);
  const refs: RecordRef[] = [];
  const names = current.flatMap((o) => {
    const p = one(o.party);
    if (!p) return [];
    refs.push({ kind: "party", id: p.id, label: p.display_name });
    return [`${p.display_name}${CONFIDENCE_SUFFIX[o.confidence] ?? ""}`];
  });
  if (!names.length && recordKind === "inventory") names.push("(gallery inventory)");
  if (!names.length && recordKind === "tracked") names.push("(owner not recorded)");
  return { names, refs };
}

function locationLabel(loc: LocationEmbed | null): string | null {
  if (!loc) return null;
  const p = one(loc.party);
  const label = loc.label ?? "Address";
  return p?.display_name ? `${p.display_name} — ${label}` : label;
}

function artworkRefLabel(artist: ArtistEmbed | null, title: string, year: number | null): string {
  return `${artist?.name ?? "Unknown"}, ${title}${year ? ` (${year})` : ""}`;
}

export const ARTWORK_SEARCH_SELECT =
  "id, title, year, medium, edition, status, record_kind, price_cents, currency, " +
  "artist:artists(id, name), " +
  "parties:artwork_parties(role, ended_on, confidence, party:parties(id, display_name)), " +
  "location:party_addresses!artworks_current_party_address_id_fkey(label, party:parties(display_name))";

async function searchArtworks(
  supabase: SupabaseClient,
  input: {
    artist?: string;
    title?: string;
    year_from?: number;
    year_to?: number;
    medium?: string;
    status?: string;
    record_kind?: string;
    limit?: number;
  },
): Promise<ToolExecution> {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

  let artistIds: string[] | null = null;
  if (input.artist) {
    const term = sanitizeSearch(input.artist);
    if (term) {
      const { data, error } = await supabase
        .from("artists")
        .select("id, name")
        .ilike("name", `%${term}%`)
        .limit(25);
      if (error) throw new Error(error.message);
      artistIds = (data ?? []).map((a) => a.id as string);
      if (!artistIds.length) {
        return {
          result: { works: [], note: `No artist on file matching "${input.artist}".` },
          refs: [],
          summary: `no artist matching “${input.artist}”`,
        };
      }
    }
  }

  let query = supabase
    .from("artworks")
    .select(ARTWORK_SEARCH_SELECT)
    .order("year", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (artistIds) query = query.in("artist_id", artistIds);
  if (input.title) {
    const t = sanitizeSearch(input.title);
    if (t) query = query.ilike("title", `%${t}%`);
  }
  if (input.medium) {
    const m = sanitizeSearch(input.medium);
    if (m) query = query.ilike("medium", `%${m}%`);
  }
  if (input.year_from != null) query = query.gte("year", input.year_from);
  if (input.year_to != null) query = query.lte("year", input.year_to);
  if (input.status) query = query.eq("status", input.status);
  if (input.record_kind) query = query.eq("record_kind", input.record_kind);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ArtworkSearchRow[];

  const refs: RecordRef[] = [];
  const works = rows.map((row) => {
    const artist = one(row.artist);
    const owners = ownerNames(many(row.parties), row.record_kind);
    refs.push({ kind: "artwork", id: row.id, label: artworkRefLabel(artist, row.title, row.year) });
    refs.push(...owners.refs);
    return {
      id: row.id,
      artist: artist?.name ?? null,
      title: row.title,
      year: row.year,
      medium: row.medium,
      edition: row.edition,
      status: row.status,
      record_kind: row.record_kind,
      price: row.price_cents != null ? formatPriceCents(row.price_cents, row.currency) : null,
      current_owners: owners.names,
      location: locationLabel(one(row.location)),
    };
  });

  return {
    result: { works, count: works.length },
    refs,
    summary: `${works.length} work${works.length === 1 ? "" : "s"}`,
  };
}

export const ARTWORK_DETAIL_SELECT =
  "id, title, year, medium, edition, status, record_kind, price_cents, currency, " +
  "height_in, width_in, depth_in, signature_details, catalogue_raisonne, exhibited, " +
  "literature, provenance_lines, condition, notes, " +
  "artist:artists(id, name), " +
  "parties:artwork_parties(role, started_on, ended_on, source, confidence, notes, party:parties(id, display_name)), " +
  "location:party_addresses!artworks_current_party_address_id_fkey(label, party:parties(display_name))";

/** Every OPEN link for one party, all roles — getParty splits title from the rest. */
export const PARTY_WORK_LINKS_SELECT =
  "role, started_on, ended_on, confidence, artwork:artworks(id, title, year, artist:artists(name))";

async function getArtwork(
  supabase: SupabaseClient,
  input: { artwork_id: string },
): Promise<ToolExecution> {
  const { data, error } = await supabase
    .from("artworks")
    .select(ARTWORK_DETAIL_SELECT)
    .eq("id", input.artwork_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { result: { error: "No artwork with that id." }, refs: [], summary: "not found" };
  }
  const row = data as unknown as ArtworkDetailRow;

  const artist = one(row.artist);
  const refs: RecordRef[] = [
    { kind: "artwork", id: row.id, label: artworkRefLabel(artist, row.title, row.year) },
  ];

  // Split title edges from everything else so the model can never read an
  // advisor or a conservator as an owner of the work.
  const allLinks = many(row.parties).map((o) => {
    const p = one(o.party);
    if (p) refs.push({ kind: "party", id: p.id, label: p.display_name });
    return {
      role: o.role,
      party: p?.display_name ?? "Unknown party",
      current: o.ended_on === null,
      from: o.started_on ?? null,
      to: o.ended_on,
      source: o.source,
      confidence: o.confidence,
      notes: o.notes ?? null,
    };
  });

  // Keys are spelled out rather than rest-spread so the model-facing payload is
  // legible here — `owner` must never appear on a non-title row.
  const ownership_history = allLinks
    .filter((l) => l.role === TITLE_ROLE)
    .map((l) => ({
      owner: l.party,
      current: l.current,
      from: l.from,
      to: l.to,
      source: l.source,
      confidence: l.confidence,
      notes: l.notes,
    }));

  const other_parties = allLinks
    .filter((l) => l.role !== TITLE_ROLE)
    .map((l) => ({
      party: l.party,
      role: ARTWORK_PARTY_ROLE_LABELS[l.role as ArtworkPartyRole] ?? l.role,
      current: l.current,
      from: l.from,
      to: l.to,
      source: l.source,
      confidence: l.confidence,
      notes: l.notes,
    }));

  return {
    result: {
      id: row.id,
      artist: artist?.name ?? null,
      title: row.title,
      year: row.year,
      medium: row.medium,
      edition: row.edition,
      status: row.status,
      record_kind: row.record_kind,
      price: row.price_cents != null ? formatPriceCents(row.price_cents, row.currency) : null,
      dimensions_in: {
        height: row.height_in,
        width: row.width_in,
        depth: row.depth_in,
      },
      signature: row.signature_details,
      catalogue_raisonne: row.catalogue_raisonne,
      exhibited: row.exhibited,
      literature: row.literature,
      provenance_lines: row.provenance_lines,
      condition: row.condition,
      dealer_notes: row.notes,
      ownership_history,
      other_parties,
      location: locationLabel(one(row.location)),
    },
    refs,
    summary: artworkRefLabel(artist, row.title, null),
  };
}

async function searchParties(
  supabase: SupabaseClient,
  input: { query: string; limit?: number },
): Promise<ToolExecution> {
  const term = sanitizeSearch(input.query);
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 25);
  if (!term) return { result: { parties: [] }, refs: [], summary: "empty query" };

  const { data, error } = await supabase
    .from("parties")
    .select(
      "id, display_name, legal_name, kind, email, is_unidentified, roles:party_roles(role)",
    )
    .or(`display_name.ilike.%${term}%,legal_name.ilike.%${term}%,email.ilike.%${term}%`)
    .order("display_name")
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as PartySearchRow[];

  const refs: RecordRef[] = [];
  const parties = rows.map((p) => {
    refs.push({ kind: "party", id: p.id, label: p.display_name });
    return {
      id: p.id,
      name: p.display_name,
      kind: p.kind,
      email: p.email,
      // The chat SHOULD surface these (answering "who holds this" is the point),
      // but the model must not treat the placeholder name as a contactable person
      // or suggest emailing/invoicing them. See migration 0022.
      unidentified: p.is_unidentified,
      roles: many(p.roles).map((r) => r.role),
    };
  });

  return {
    result: { parties, count: parties.length },
    refs,
    summary: `${parties.length} contact${parties.length === 1 ? "" : "s"}`,
  };
}

async function getParty(
  supabase: SupabaseClient,
  input: { party_id: string },
): Promise<ToolExecution> {
  const { data: partyData, error } = await supabase
    .from("parties")
    .select(
      "id, display_name, legal_name, kind, email, phone, notes, is_unidentified, roles:party_roles(role)",
    )
    .eq("id", input.party_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!partyData) {
    return { result: { error: "No contact with that id." }, refs: [], summary: "not found" };
  }
  const party = partyData as unknown as PartyDetailRow;

  const refs: RecordRef[] = [{ kind: "party", id: party.id, label: party.display_name }];

  const [interestsRes, relsRes, ownsRes] = await Promise.all([
    supabase
      .from("collector_interests")
      .select(
        "dimension, sentiment, source, confidence, value, price_min_cents, price_max_cents, qualifier, created_at, artist:artists(id, name)",
      )
      .eq("party_id", input.party_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("party_relationships")
      .select(
        "type, valid_from, valid_to, notes, from_party:parties!party_relationships_from_party_id_fkey(id, display_name), to_party:parties!party_relationships_to_party_id_fkey(id, display_name)",
      )
      .or(`from_party_id.eq.${input.party_id},to_party_id.eq.${input.party_id}`),
    // Every OPEN link, all roles — split below into title vs. everything else.
    supabase
      .from("artwork_parties")
      .select(PARTY_WORK_LINKS_SELECT)
      .eq("party_id", input.party_id)
      .is("ended_on", null),
  ]);
  for (const res of [interestsRes, relsRes, ownsRes]) {
    if (res.error) throw new Error(res.error.message);
  }
  const interestRows = (interestsRes.data ?? []) as unknown as InterestQueryRow[];
  const relRows = (relsRes.data ?? []) as unknown as RelationshipQueryRow[];
  const ownRows = (ownsRes.data ?? []) as unknown as LinkedWorkQueryRow[];

  const interests = interestRows.map((r) => {
    const artist = one(r.artist);
    if (artist) refs.push({ kind: "artist", id: artist.id, label: artist.name });
    const label = resolveInterestValue({
      dimension: r.dimension as never,
      artist_name: artist?.name ?? null,
      value: r.value,
      price_min_cents: r.price_min_cents,
      price_max_cents: r.price_max_cents,
    }).label;
    return {
      sentiment: r.sentiment,
      dimension: r.dimension,
      what: label,
      qualifier: r.qualifier,
      source: r.source,
      confidence: r.confidence,
      noted_on: r.created_at.slice(0, 10),
    };
  });

  const relationships = relRows.map((r) => {
    const from = one(r.from_party);
    const to = one(r.to_party);
    const outbound = from?.id === input.party_id;
    const counterpart = outbound ? to : from;
    if (counterpart) refs.push({ kind: "party", id: counterpart.id, label: counterpart.display_name });
    return {
      type: r.type,
      direction: outbound ? "outbound" : "inbound",
      counterpart: counterpart?.display_name ?? "Unknown",
      valid_from: r.valid_from,
      valid_to: r.valid_to,
      notes: r.notes,
    };
  });

  const linkedWorks = ownRows.flatMap((o) => {
    const a = one(o.artwork);
    if (!a) return [];
    refs.push({
      kind: "artwork",
      id: a.id,
      label: artworkRefLabel(one(a.artist) as ArtistEmbed | null, a.title, a.year),
    });
    return [
      {
        role: o.role,
        artist: one(a.artist)?.name ?? null,
        title: a.title,
        year: a.year,
        since: o.started_on,
        confidence: o.confidence,
      },
    ];
  });

  // currently_owns keeps meaning TITLE and nothing else; the other roles ship as
  // their own key so the model states them accurately instead of blurring them
  // into ownership.
  const owns = linkedWorks
    .filter((w) => w.role === TITLE_ROLE)
    .map((w) => ({
      artist: w.artist,
      title: w.title,
      year: w.year,
      since: w.since,
      confidence: w.confidence,
    }));

  const other_work_links = linkedWorks
    .filter((w) => w.role !== TITLE_ROLE)
    .map((w) => ({
      role: ARTWORK_PARTY_ROLE_LABELS[w.role as ArtworkPartyRole] ?? w.role,
      artist: w.artist,
      title: w.title,
      year: w.year,
      since: w.since,
      confidence: w.confidence,
    }));

  return {
    result: {
      id: party.id,
      name: party.display_name,
      legal_name: party.legal_name,
      kind: party.kind,
      email: party.email,
      phone: party.phone,
      unidentified: party.is_unidentified,
      roles: many(party.roles).map((r) => r.role),
      dealer_notes: party.notes,
      interests,
      relationships,
      currently_owns: owns,
      other_work_links,
    },
    refs,
    summary: party.display_name,
  };
}

async function searchNotes(
  supabase: SupabaseClient,
  input: { query: string; limit?: number },
): Promise<ToolExecution> {
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 12);
  const entities = await vaultSearch(supabase, input.query, limit);

  const refs: RecordRef[] = [];
  const notes = entities.map((e) => {
    refs.push({ kind: "note", id: e.entity_id, label: e.title ?? e.slug });
    return {
      title: e.title ?? e.slug,
      type: e.entity_type,
      tags: e.tags,
      excerpt: e.body_md.length > 700 ? `${e.body_md.slice(0, 700)}…` : e.body_md,
    };
  });

  return {
    result: { notes, count: notes.length },
    refs,
    summary: `${notes.length} note${notes.length === 1 ? "" : "s"}`,
  };
}

async function logCollectorInterest(
  supabase: SupabaseClient,
  input: {
    party_id: string;
    dimension: string;
    sentiment?: string;
    confidence?: string;
    artist_name?: string;
    value?: string;
    price_min_cents?: number;
    price_max_cents?: number;
    qualifier?: string;
  },
): Promise<ToolExecution> {
  const { data: party, error: partyErr } = await supabase
    .from("parties")
    .select("id, display_name")
    .eq("id", input.party_id)
    .maybeSingle();
  if (partyErr) throw new Error(partyErr.message);
  if (!party) {
    return { result: { ok: false, error: "No contact with that id." }, refs: [], summary: "contact not found" };
  }

  // Resolve the artist name to a row — never store an artist as free text.
  let artistId: string | null = null;
  let artistRef: RecordRef | null = null;
  if (input.dimension === "artist") {
    if (!input.artist_name) {
      return {
        result: { ok: false, error: "artist_name is required for an artist interest." },
        refs: [],
        summary: "missing artist name",
      };
    }
    const { data: exact, error: rpcErr } = await supabase.rpc("match_artist_by_name", {
      p_name: input.artist_name,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    let candidates = (exact ?? []) as { id: string; name: string }[];
    if (!candidates.length) {
      const term = sanitizeSearch(input.artist_name);
      const { data: fuzzy, error: fuzzyErr } = await supabase
        .from("artists")
        .select("id, name")
        .ilike("name", `%${term}%`)
        .limit(5);
      if (fuzzyErr) throw new Error(fuzzyErr.message);
      candidates = (fuzzy ?? []) as { id: string; name: string }[];
    }
    if (!candidates.length) {
      return {
        result: {
          ok: false,
          error: `No artist on file matching "${input.artist_name}". Ask the dealer whether to add the artist first — do not log this interest as free text.`,
        },
        refs: [],
        summary: `no artist “${input.artist_name}”`,
      };
    }
    if (candidates.length > 1) {
      return {
        result: {
          ok: false,
          error: `Ambiguous artist "${input.artist_name}".`,
          candidates: candidates.map((c) => c.name),
        },
        refs: [],
        summary: `ambiguous artist “${input.artist_name}”`,
      };
    }
    artistId = candidates[0].id;
    artistRef = { kind: "artist", id: candidates[0].id, label: candidates[0].name };
  }

  const parsed = interestSchema.safeParse({
    dimension: input.dimension,
    sentiment: input.sentiment ?? "seeking",
    source: "inferred_from_conversation",
    confidence: input.confidence ?? "likely",
    artist_id: artistId ?? undefined,
    value: input.value ?? undefined,
    price_min_cents: input.price_min_cents ?? undefined,
    price_max_cents: input.price_max_cents ?? undefined,
    qualifier: input.qualifier ?? undefined,
  });
  if (!parsed.success) {
    return {
      result: {
        ok: false,
        error: "Invalid interest shape.",
        issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      refs: [],
      summary: "invalid interest",
    };
  }

  const { error: insertErr } = await supabase
    .from("collector_interests")
    .insert({ party_id: party.id, ...parsed.data });

  const label = resolveInterestValue({
    dimension: parsed.data.dimension,
    artist_name: artistRef?.label ?? null,
    value: parsed.data.value ?? null,
    price_min_cents: parsed.data.price_min_cents ?? null,
    price_max_cents: parsed.data.price_max_cents ?? null,
  }).label;
  const description = `${party.display_name} — ${parsed.data.sentiment}: ${label}`;
  const refs: RecordRef[] = [
    { kind: "party", id: party.id as string, label: party.display_name as string },
    ...(artistRef ? [artistRef] : []),
  ];

  if (insertErr) {
    // 23505 = the exact same signal is already on file; treat as a no-op, not a failure.
    if (insertErr.code === "23505") {
      return {
        result: { ok: true, already_recorded: true, description },
        refs,
        summary: `already on file — ${description}`,
      };
    }
    throw new Error(insertErr.message);
  }

  return {
    result: { ok: true, recorded: description },
    refs,
    summary: description,
  };
}

// ---------------------------------------------------------------------------

export async function executeRegistrarTool(
  supabase: SupabaseClient,
  name: string,
  input: unknown,
): Promise<ToolExecution> {
  // Inputs come from the model constrained by the tool schemas above; each
  // executor re-validates what matters (uuids hit the DB, interests hit Zod).
  const args = (input ?? {}) as never;
  switch (name) {
    case "search_artworks":
      return searchArtworks(supabase, args);
    case "get_artwork":
      return getArtwork(supabase, args);
    case "search_parties":
      return searchParties(supabase, args);
    case "get_party":
      return getParty(supabase, args);
    case "search_notes":
      return searchNotes(supabase, args);
    case "log_collector_interest":
      return logCollectorInterest(supabase, args);
    default:
      return { result: { error: `Unknown tool: ${name}` }, refs: [], summary: "unknown tool" };
  }
}
