import { Container, Flex, Heading, Link, Text } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { ContactForm } from "../contact-form";
import { ContactRelationships } from "../contact-relationships";
import { ContactPaymentMethods } from "@/components/contact-payment-methods";
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

  const [{ data: roleRows }, { data: addressRows }, { data: rels }, { data: partyRows }] =
    await Promise.all([
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
    ]);

  const roles = (roleRows ?? []).map((r) => r.role as PartyRole);
  const partyAddresses = (addressRows ?? []) as PartyAddressRow[];
  const relationships = (rels ?? []) as unknown as PartyRelationshipWithParties[];
  const parties = (partyRows ?? []) as { id: string; display_name: string }[];
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
    </Container>
  );
}
