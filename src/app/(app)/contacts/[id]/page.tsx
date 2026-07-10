import { Card, Container, Flex, Heading, Text } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { ContactForm } from "../contact-form";
import {
  PARTY_RELATIONSHIP_LABELS,
  type Party,
  type PartyAddressRow,
  type PartyRelationshipType,
  type PartyRole,
} from "@/lib/schemas/party";
import { getSupabaseServer } from "@/lib/supabase/server";

type RelRow = {
  id: string;
  type: PartyRelationshipType;
  from_party_id: string;
  to_party_id: string;
  valid_from: string | null;
  valid_to: string | null;
  from_party: { display_name: string } | null;
  to_party: { display_name: string } | null;
};

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

  const [{ data: roleRows }, { data: addressRows }, { data: rels }] = await Promise.all([
    supabase.from("party_roles").select("role").eq("party_id", id),
    supabase
      .from("party_addresses")
      .select("*")
      .eq("party_id", id)
      .order("position"),
    supabase
      .from("party_relationships")
      .select(
        "id, type, from_party_id, to_party_id, valid_from, valid_to, from_party:parties!party_relationships_from_party_id_fkey(display_name), to_party:parties!party_relationships_to_party_id_fkey(display_name)",
      )
      .or(`from_party_id.eq.${id},to_party_id.eq.${id}`),
  ]);

  const roles = (roleRows ?? []).map((r) => r.role as PartyRole);
  const partyAddresses = (addressRows ?? []) as PartyAddressRow[];
  const relationships = (rels ?? []) as unknown as RelRow[];

  return (
    <Container size="3" py="6">
      <Heading size="7" mb="1">
        {(party as Party).display_name}
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        Edit the contact below. Relationships are shown read-only.
      </Text>

      <ContactForm party={party as Party} roles={roles} addresses={partyAddresses} />

      <Heading size="4" mt="7" mb="2">
        Relationships
      </Heading>
      {relationships.length === 0 ? (
        <Text color="gray" size="2">
          No relationships recorded yet. (Relationship management is a fast-follow;
          the schema captures who works where, advises whom, or represents which
          artist.)
        </Text>
      ) : (
        <Flex direction="column" gap="2">
          {relationships.map((rel) => {
            const outbound = rel.from_party_id === id;
            const other = outbound ? rel.to_party : rel.from_party;
            const label = PARTY_RELATIONSHIP_LABELS[rel.type];
            const phrase = outbound
              ? `${label} ${other?.display_name ?? "—"}`
              : `${other?.display_name ?? "—"} — ${label} this contact`;
            const span =
              rel.valid_from || rel.valid_to
                ? ` (${rel.valid_from ?? "…"}–${rel.valid_to ?? "present"})`
                : "";
            return (
              <Card key={rel.id}>
                <Text size="2">
                  {phrase}
                  {span}
                </Text>
              </Card>
            );
          })}
        </Flex>
      )}
    </Container>
  );
}
