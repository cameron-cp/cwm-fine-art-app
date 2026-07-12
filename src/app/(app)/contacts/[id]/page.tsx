import { Container, Flex, Heading, Link, Text } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { ContactForm } from "../contact-form";
import { ContactRelationships } from "../contact-relationships";
import { ContactPaymentMethods } from "@/components/contact-payment-methods";
import { InterestsEditor } from "@/components/interests-editor";
import { summarizeInterests } from "@/lib/interests/summarize";
import { type InterestRow } from "@/lib/schemas/interest";
import {
  type Party,
  type PartyAddressRow,
  type PartyRelationshipWithParties,
  type PartyRole,
} from "@/lib/schemas/party";
import { getSupabaseServer } from "@/lib/supabase/server";

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

      <ContactPaymentMethods
        id={id}
        hasCustomer={Boolean((party as Party).stripe_customer_id)}
      />

      <ContactRelationships
        contactId={id}
        contactName={(party as Party).display_name}
        relationships={relationships}
        parties={parties}
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
