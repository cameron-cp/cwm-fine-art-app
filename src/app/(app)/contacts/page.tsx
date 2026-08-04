import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { Th } from "@/components/ledger";
import { ClearFilters, FilterSelect, SearchInput } from "@/components/list-controls";
import { firstParam, sanitizeSearch } from "@/lib/search";
import {
  PARTY_KIND_LABELS,
  PARTY_ROLE_LABELS,
  partyKind,
  partyKinds,
  partyRole,
  partyRoles,
  type Party,
  type PartyKind,
  type PartyRole,
} from "@/lib/schemas/party";
import { getSupabaseServer } from "@/lib/supabase/server";

// Unidentified holders (0022) are shown here by DEFAULT, unlike in the invoice /
// room / retainer pickers which hard-exclude them. They're records she's actively
// working, and hiding them by default would make the flag feel like a delete — she'd
// have to know a filter existed to find them again. The tag on the row carries the
// warning instead, and this filter isolates or excludes them on demand.
const IDENTIFICATION_OPTIONS = [
  { value: "named", label: "Named only" },
  { value: "unidentified", label: "Unidentified only" },
] as const;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; role?: string; ident?: string }>;
}) {
  const sp = await searchParams;
  const q = sanitizeSearch(sp.q);
  const kind = partyKind.safeParse(firstParam(sp.kind)).success ? firstParam(sp.kind) : "";
  const role = partyRole.safeParse(firstParam(sp.role)).success ? firstParam(sp.role) : "";
  const identParam = firstParam(sp.ident);
  const ident = IDENTIFICATION_OPTIONS.some((o) => o.value === identParam) ? identParam : "";
  const hasFilters = !!(sp.q?.trim() || kind || role || ident);

  const supabase = getSupabaseServer();

  // Role is a one-to-many join; resolve matching party ids first when filtering.
  let roleIdFilter: string[] | null = null;
  if (role) {
    const { data: withRole } = await supabase
      .from("party_roles")
      .select("party_id")
      .eq("role", role);
    roleIdFilter = (withRole ?? []).map((r) => r.party_id as string);
  }

  let query = supabase
    .from("parties")
    .select("id, kind, display_name, email, is_unidentified")
    .order("display_name");

  if (q) query = query.or(`display_name.ilike.%${q}%,email.ilike.%${q}%`);
  if (kind) query = query.eq("kind", kind);
  if (ident) query = query.eq("is_unidentified", ident === "unidentified");
  if (roleIdFilter)
    query = query.in(
      "id",
      roleIdFilter.length ? roleIdFilter : ["00000000-0000-0000-0000-000000000000"],
    );

  const { data: parties } = await query;

  const rows = (parties ?? []) as Pick<
    Party,
    "id" | "kind" | "display_name" | "email" | "is_unidentified"
  >[];

  // Roles for the displayed parties only.
  const partyIds = rows.map((p) => p.id);
  const { data: roleRows } = partyIds.length
    ? await supabase.from("party_roles").select("party_id, role").in("party_id", partyIds)
    : { data: [] };

  const rolesByParty = new Map<string, PartyRole[]>();
  for (const r of (roleRows ?? []) as { party_id: string; role: PartyRole }[]) {
    const list = rolesByParty.get(r.party_id) ?? [];
    list.push(r.role);
    rolesByParty.set(r.party_id, list);
  }

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="end" mb="5">
        <Heading size="8" weight="medium">
          Contacts
        </Heading>
        <Button asChild>
          <Link href="/contacts/new">New contact</Link>
        </Button>
      </Flex>

      <Flex align="end" gap="4" mb="4" wrap="wrap">
        <SearchInput placeholder="Search name or email…" />
        <FilterSelect
          paramKey="kind"
          label="Type"
          allLabel="All types"
          options={partyKinds.map((k) => ({ value: k, label: PARTY_KIND_LABELS[k as PartyKind] }))}
        />
        <FilterSelect
          paramKey="role"
          label="Role"
          allLabel="All roles"
          options={partyRoles.map((r) => ({ value: r, label: PARTY_ROLE_LABELS[r as PartyRole] }))}
        />
        <FilterSelect
          paramKey="ident"
          label="Identification"
          allLabel="All contacts"
          options={IDENTIFICATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        {hasFilters && <ClearFilters href="/contacts" />}
        <Text size="1" className="self-end num text-[var(--ink-3)]" ml="auto">
          {rows.length} {rows.length === 1 ? "contact" : "contacts"}
        </Text>
      </Flex>

      {rows.length === 0 ? (
        <EmptyState filtered={hasFilters} />
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
                  <Flex gap="2" align="center" wrap="wrap">
                    <Link
                      href={`/contacts/${p.id}`}
                      className="font-serif text-[16px] text-[var(--ink)] hover:underline"
                    >
                      {p.display_name}
                    </Link>
                    {/* Not a status — no sage/amber. Muted ink says "this name is a
                        placeholder" without competing with the work on screen. */}
                    {p.is_unidentified && (
                      <span
                        title="Known to exist but not named — excluded from invoices, viewing rooms, and retainers"
                        className="border border-dashed border-[var(--rule-2)] px-[7px] py-[2px] text-[10px] uppercase tracking-[0.12em] text-[var(--ink-3)]"
                      >
                        Unidentified
                      </span>
                    )}
                  </Flex>
                </Table.Cell>
                <Table.Cell>
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--ink-3)]">
                    {PARTY_KIND_LABELS[p.kind as PartyKind]}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <Flex gap="2" wrap="wrap">
                    {(rolesByParty.get(p.id) ?? []).map((r) => (
                      <span
                        key={r}
                        className="border border-[var(--rule-2)] px-[7px] py-[2px] text-[10px] uppercase tracking-[0.12em] text-[var(--ink-2)]"
                      >
                        {PARTY_ROLE_LABELS[r]}
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

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      py="9"
      className="border border-[var(--rule)]"
    >
      {filtered ? (
        <>
          <Text style={{ color: "var(--ink-3)" }}>No contacts match these filters.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/contacts">Clear filters</Link>
          </Button>
        </>
      ) : (
        <>
          <Text style={{ color: "var(--ink-3)" }}>No contacts yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/contacts/new">Add your first contact</Link>
          </Button>
        </>
      )}
    </Flex>
  );
}
