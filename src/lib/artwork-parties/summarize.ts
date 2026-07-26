import {
  ARTWORK_PARTY_ROLE_LABELS,
  TITLE_ROLE,
  type ArtworkPartyRole,
  type ArtworkPartyRow,
} from "@/lib/schemas/artwork-party";

// Pure read-side helpers for a contact's artwork links. The ordering and the
// one-line summary both live here (not in the component) so the rules are unit
// testable — mirrors lib/interests/summarize.ts.

/**
 * The single definition of "this contact owns this work right now": role is
 * exactly the title role AND the interval is still open. Every owner projection
 * in the app routes through this — an advisor edge must never widen into
 * ownership.
 */
export function isCurrentOwner(row: Pick<ArtworkPartyRow, "role" | "ended_on">): boolean {
  return row.role === TITLE_ROLE && row.ended_on === null;
}

export function isCurrent(row: Pick<ArtworkPartyRow, "ended_on">): boolean {
  return row.ended_on === null;
}

// Verb phrases for the summary sentence. The row tag uses the noun form
// (ARTWORK_PARTY_ROLE_LABELS); a sentence needs a predicate.
const ROLE_VERBS: Record<ArtworkPartyRole, string> = {
  owner: "owns",
  consignor: "consigned",
  advisor: "advises on",
  gallery: "gallery for",
  agent: "agent for",
  custodian: "holds",
  conservator: "conserving",
  lender: "lent",
  other: "linked to",
};

function works(n: number): string {
  return `${n} ${n === 1 ? "work" : "works"}`;
}

/**
 * Sort order for the contact's list: works they hold today, then everything else
 * they're currently attached to, then closed links (most recently ended first).
 * Within a band, alphabetical by artist then title — a collection reads by artist.
 */
export function sortArtworkParties(rows: ArtworkPartyRow[]): ArtworkPartyRow[] {
  function band(r: ArtworkPartyRow): number {
    if (isCurrentOwner(r)) return 0;
    if (isCurrent(r)) return 1;
    return 2;
  }
  return [...rows].sort((a, b) => {
    const d = band(a) - band(b);
    if (d !== 0) return d;
    // Closed links: most recently ended first, so the newest history is on top.
    if (band(a) === 2) {
      const e = (b.ended_on ?? "").localeCompare(a.ended_on ?? "");
      if (e !== 0) return e;
    }
    const artist = (a.artwork?.artist_name ?? "").localeCompare(
      b.artwork?.artist_name ?? "",
    );
    if (artist !== 0) return artist;
    return (a.artwork?.title ?? "").localeCompare(b.artwork?.title ?? "");
  });
}

/**
 * One-line reading of the contact's relationship to the collection, e.g.
 * "Owns 3 works; advises on 1; previously owned 2."
 *
 * Scope, deliberate: current links of every role, plus PAST OWNERSHIP (the one
 * piece of history a dealer asks about). Past non-owner links stay in the list
 * below but out of the sentence — otherwise a contact whose work went to the
 * conservator twice reads like a busy collection.
 */
export function summarizeArtworkParties(rows: ArtworkPartyRow[]): string {
  const clauses: string[] = [];

  const owned = rows.filter(isCurrentOwner).length;
  if (owned) clauses.push(`Owns ${works(owned)}`);

  // Group the current non-owner links by role, in the vocabulary's own order so
  // the sentence is stable across reloads.
  const byRole = new Map<ArtworkPartyRole, number>();
  for (const r of rows) {
    if (!isCurrent(r) || r.role === TITLE_ROLE) continue;
    byRole.set(r.role, (byRole.get(r.role) ?? 0) + 1);
  }
  for (const [role, n] of byRole) {
    clauses.push(`${ROLE_VERBS[role]} ${works(n)}`);
  }

  const formerlyOwned = rows.filter(
    (r) => r.role === TITLE_ROLE && r.ended_on !== null,
  ).length;
  if (formerlyOwned) clauses.push(`previously owned ${works(formerlyOwned)}`);

  if (!clauses.length) return "";

  // Capitalize whichever clause landed first (the sentence may not start with
  // "Owns" — a contact can be an advisor and own nothing).
  const [head, ...rest] = clauses;
  return `${head[0].toUpperCase()}${head.slice(1)}${rest.length ? `; ${rest.join("; ")}` : ""}.`;
}

/** "Advisor · 2019–2023" / "Owner · since 2019" / "Owner" — the row's byline. */
export function describeLink(row: ArtworkPartyRow): string {
  const parts = [ARTWORK_PARTY_ROLE_LABELS[row.role]];
  const from = row.started_on?.slice(0, 4);
  const to = row.ended_on?.slice(0, 4);
  if (from && to) parts.push(`${from}–${to}`);
  else if (from) parts.push(`since ${from}`);
  else if (to) parts.push(`until ${to}`);
  else if (row.ended_on === null) {
    // Open interval with no dates: say nothing rather than invent one.
  }
  if (row.confidence !== "confirmed") parts.push(row.confidence);
  return parts.join(" · ");
}
