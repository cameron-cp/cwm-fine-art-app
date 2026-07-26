import { Container, Flex, Heading, Link, Text } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { ContactForm } from "../contact-form";
import { ContactRelationships } from "../contact-relationships";
import { ContactPaymentMethods } from "@/components/contact-payment-methods";
import {
  ArtworkLinksEditor,
  type ArtworkLinkView,
} from "@/components/artwork-links-editor";
import { InterestsEditor } from "@/components/interests-editor";
import {
  artworkOptionLabels,
  CONTACT_ARTWORK_LINKS_SELECT,
  flattenArtworkPartyRows,
  type RawArtworkPartyRow,
} from "@/lib/artwork-parties/queries";
import {
  sortArtworkParties,
  summarizeArtworkParties,
} from "@/lib/artwork-parties/summarize";
import { summarizeInterests } from "@/lib/interests/summarize";
import { type ArtworkPartyRow } from "@/lib/schemas/artwork-party";
import { type InterestRow } from "@/lib/schemas/interest";
import {
  type Party,
  type PartyAddressRow,
  type PartyRelationshipWithParties,
  type PartyRole,
} from "@/lib/schemas/party";
import { getSupabaseServer } from "@/lib/supabase/server";
import { signedArtworkUrls } from "@/lib/supabase/storage";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServer();

  const { data: party } = await supabase
    .from("parties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!party) notFound();

  const [
    { data: roleRows },
    { data: addressRows },
    { data: rels },
    { data: partyRows },
    { data: interestRows },
    { data: artistRows },
    { data: mediumRows },
    { data: linkRows },
    { data: artworkPickerRows },
  ] = await Promise.all([
      supabase.from("party_roles").select("role").eq("party_id", id),
      supabase
        .from("party_addresses")
        .select("*")
        .eq("party_id", id)
        .order("position"),
      supabase
        .from("party_relationships")
        .select(
          "id, type, from_party_id, to_party_id, valid_from, valid_to, notes, from_party:parties!party_relationships_from_party_id_fkey(display_name), to_party:parties!party_relationships_to_party_id_fkey(display_name)",
        )
        .or(`from_party_id.eq.${id},to_party_id.eq.${id}`),
      supabase
        .from("parties")
        .select("id, display_name")
        .neq("id", id)
        .order("display_name"),
      // Direct select + embedded join — the collector-profile read, matching every
      // other read on this page (no RPC).
      supabase
        .from("collector_interests")
        .select(
          "id, party_id, dimension, sentiment, source, confidence, artist_id, value, price_min_cents, price_max_cents, qualifier, created_at, updated_at, artist:artists(name)",
        )
        .eq("party_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("artists").select("id, name").order("name"),
      supabase.from("artworks").select("medium").not("medium", "is", null),
      // Every link, not just current ownership — the list shows advisor/gallery
      // roles and closed intervals too, ordered client-side by sortArtworkParties.
      supabase
        .from("artwork_parties")
        .select(CONTACT_ARTWORK_LINKS_SELECT)
        .eq("party_id", id),
      supabase
        .from("artworks")
        .select("id, title, year, artist:artists(name)")
        .order("created_at", { ascending: false }),
    ]);

  const roles = (roleRows ?? []).map((r) => r.role as PartyRole);
  const partyAddresses = (addressRows ?? []) as PartyAddressRow[];
  const relationships = (rels ?? []) as unknown as PartyRelationshipWithParties[];
  const parties = (partyRows ?? []) as { id: string; display_name: string }[];

  // Flatten the embedded artist join to a scalar artist_name.
  const interests: InterestRow[] = (
    (interestRows ?? []) as unknown as (Omit<InterestRow, "artist_name"> & {
      artist: { name: string } | null;
    })[]
  ).map(({ artist, ...row }) => ({ ...row, artist_name: artist?.name ?? null }));
  const summary = summarizeInterests(interests);
  const artistOptions = (artistRows ?? []) as { id: string; name: string }[];
  const mediumSuggestions = Array.from(
    new Set(
      ((mediumRows ?? []) as { medium: string | null }[])
        .map((r) => r.medium)
        .filter((m): m is string => Boolean(m && m.trim())),
    ),
  ).sort((a, b) => a.localeCompare(b));

  // Flatten the embedded artist join, then sign every thumbnail in one round trip.
  const artworkLinks: ArtworkPartyRow[] = flattenArtworkPartyRows(
    (linkRows ?? []) as unknown as RawArtworkPartyRow[],
  );

  const linkPaths = artworkLinks
    .map((l) => l.artwork?.primary_image_path)
    .filter((p): p is string => !!p);
  const signedLinkUrls = await signedArtworkUrls(supabase, linkPaths, 3600);

  const artworkLinkViews: ArtworkLinkView[] = sortArtworkParties(artworkLinks).map((l) => ({
    ...l,
    imageUrl: l.artwork?.primary_image_path
      ? (signedLinkUrls[l.artwork.primary_image_path] ?? null)
      : null,
  }));
  const artworkLinksSummary = summarizeArtworkParties(artworkLinks);
  const artworkOptions = artworkOptionLabels(
    (artworkPickerRows ?? []) as unknown as Parameters<typeof artworkOptionLabels>[0],
  );

  const { website_url, linkedin_url } = party as Party;

  return (
    <Container size="3" py="6">
      <Heading size="7" mb="1">
        {(party as Party).display_name}
      </Heading>
      <Text color="gray" size="2" mb={website_url || linkedin_url ? "2" : "5"} as="p">
        Edit the contact below.
      </Text>

      {(website_url || linkedin_url) && (
        <Flex gap="4" mb="5" align="center">
          {website_url && (
            <Link href={website_url} target="_blank" rel="noreferrer" size="2">
              Website ↗
            </Link>
          )}
          {linkedin_url && (
            <Link href={linkedin_url} target="_blank" rel="noreferrer" size="2">
              LinkedIn ↗
            </Link>
          )}
        </Flex>
      )}

      <ContactForm party={party as Party} roles={roles} addresses={partyAddresses} />

      {/* An unidentified holder (0022) has nobody to charge, and the DB CHECK bars
          it from holding a Stripe customer — so don't offer the panel at all. */}
      {!(party as Party).is_unidentified && (
        <ContactPaymentMethods
          id={id}
          hasCustomer={Boolean((party as Party).stripe_customer_id)}
        />
      )}

      <ContactRelationships
        contactId={id}
        contactName={(party as Party).display_name}
        relationships={relationships}
        parties={parties}
      />

      {/* What they hold comes before what they want. */}
      <ArtworkLinksEditor
        partyId={id}
        contactName={(party as Party).display_name}
        links={artworkLinkViews}
        summary={artworkLinksSummary}
        artworkOptions={artworkOptions}
      />

      <InterestsEditor
        partyId={id}
        interests={interests}
        summary={summary}
        artists={artistOptions}
        mediumSuggestions={mediumSuggestions}
      />
    </Container>
  );
}
