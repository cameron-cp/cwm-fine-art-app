import { Badge, Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import {
  PARTY_KIND_LABELS,
  PARTY_ROLE_LABELS,
  type Party,
  type PartyKind,
  type PartyRole,
} from "@/lib/schemas/party";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function ContactsPage() {
  const supabase = getSupabaseServer();
  const [{ data: parties }, { data: roleRows }] = await Promise.all([
    supabase
      .from("parties")
      .select("id, kind, display_name, email")
      .order("display_name"),
    supabase.from("party_roles").select("party_id, role"),
  ]);

  const rolesByParty = new Map<string, PartyRole[]>();
  for (const r of (roleRows ?? []) as { party_id: string; role: PartyRole }[]) {
    const list = rolesByParty.get(r.party_id) ?? [];
    list.push(r.role);
    rolesByParty.set(r.party_id, list);
  }

  const rows = (parties ?? []) as Pick<
    Party,
    "id" | "kind" | "display_name" | "email"
  >[];

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="center" mb="5">
        <Heading size="7">Contacts</Heading>
        <Button asChild>
          <Link href="/contacts/new">New contact</Link>
        </Button>
      </Flex>

      {rows.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="3"
          py="9"
          className="border border-dashed border-[var(--gray-a6)] rounded-3"
        >
          <Text color="gray">No contacts yet.</Text>
          <Button asChild variant="soft">
            <Link href="/contacts/new">Add your first contact</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="surface">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Type</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Roles</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Email</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((p) => (
              <Table.Row key={p.id}>
                <Table.Cell>
                  <Link href={`/contacts/${p.id}`} className="text-[var(--accent-11)] hover:underline">
                    {p.display_name}
                  </Link>
                </Table.Cell>
                <Table.Cell>{PARTY_KIND_LABELS[p.kind as PartyKind]}</Table.Cell>
                <Table.Cell>
                  <Flex gap="1" wrap="wrap">
                    {(rolesByParty.get(p.id) ?? []).map((role) => (
                      <Badge key={role} variant="soft">
                        {PARTY_ROLE_LABELS[role]}
                      </Badge>
                    ))}
                  </Flex>
                </Table.Cell>
                <Table.Cell>{p.email ?? "—"}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}
