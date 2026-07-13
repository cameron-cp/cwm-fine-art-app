import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { Th } from "@/components/ledger";
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
      <Flex justify="between" align="end" mb="6">
        <Heading size="8" weight="medium">
          Contacts
        </Heading>
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
          className="border border-[var(--rule)]"
        >
          <Text style={{ color: "var(--ink-3)" }}>No contacts yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/contacts/new">Add your first contact</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Roles</Th>
              <Th>Email</Th>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((p) => (
              <Table.Row key={p.id} align="center">
                <Table.Cell>
                  <Link
                    href={`/contacts/${p.id}`}
                    className="font-serif text-[16px] text-[var(--ink)] hover:underline"
                  >
                    {p.display_name}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    {PARTY_KIND_LABELS[p.kind as PartyKind]}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <Flex gap="2" wrap="wrap">
                    {(rolesByParty.get(p.id) ?? []).map((role) => (
                      <span
                        key={role}
                        className="border border-[var(--rule-2)] px-[7px] py-[2px] text-[10px] uppercase tracking-[0.12em] text-[var(--ink-2)]"
                      >
                        {PARTY_ROLE_LABELS[role]}
                      </span>
                    ))}
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-[13px] text-[var(--ink-2)]">{p.email ?? "—"}</span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}
