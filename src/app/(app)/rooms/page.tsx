import { Button, Container, Flex, Heading, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { StatusTag } from "@/components/status-tag";
import { PRICE_VISIBILITY_LABELS, type RoomStatus } from "@/lib/schemas/viewing-room";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const HEAD = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]";

const STATUS_META: Record<RoomStatus, { tone: "positive" | "warning" | "muted"; label: string }> = {
  draft: { tone: "muted", label: "Draft" },
  published: { tone: "positive", label: "Published" },
  closed: { tone: "warning", label: "Closed" },
};

type RoomListRow = {
  id: string;
  title: string;
  status: RoomStatus;
  price_visibility: keyof typeof PRICE_VISIBILITY_LABELS;
  created_at: string;
  works: { count: number }[];
  recipients: { count: number }[];
};

export default async function RoomsPage() {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("viewing_rooms")
    .select(
      "id, title, status, price_visibility, created_at, works:viewing_room_works(count), recipients:viewing_room_recipients(count)",
    )
    .order("created_at", { ascending: false });

  const rooms = (data ?? []) as unknown as RoomListRow[];

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="end" mb="5">
        <Heading size="8" weight="medium">
          Viewing rooms
        </Heading>
        <Button asChild>
          <Link href="/rooms/new">New room</Link>
        </Button>
      </Flex>

      {error && (
        <Text color="red" size="2">
          {error.message}
        </Text>
      )}

      {rooms.length === 0 ? (
        <Flex
          direction="column"
          align="center"
          justify="center"
          gap="3"
          py="9"
          className="border border-[var(--rule)]"
        >
          <Text style={{ color: "var(--ink-3)" }}>No viewing rooms yet.</Text>
          <Button asChild variant="outline" color="gray">
            <Link href="/rooms/new">Create your first room</Link>
          </Button>
        </Flex>
      ) : (
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Room</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Status</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>
                <span className={HEAD}>Prices</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                <span className={HEAD}>Works</span>
              </Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">
                <span className={HEAD}>Recipients</span>
              </Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rooms.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <Table.Row key={r.id} align="center">
                  <Table.Cell>
                    <Link href={`/rooms/${r.id}`} className="group block">
                      <span className="font-serif text-[16px] font-semibold text-[var(--ink)] group-hover:underline">
                        {r.title}
                      </span>
                    </Link>
                  </Table.Cell>
                  <Table.Cell>
                    <StatusTag tone={meta.tone}>{meta.label}</StatusTag>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="2" style={{ color: "var(--ink-2)" }}>
                      {PRICE_VISIBILITY_LABELS[r.price_visibility]}
                    </Text>
                  </Table.Cell>
                  <Table.Cell align="right">
                    <span className="num text-[14px] text-[var(--ink)]">
                      {r.works?.[0]?.count ?? 0}
                    </span>
                  </Table.Cell>
                  <Table.Cell align="right">
                    <span className="num text-[14px] text-[var(--ink)]">
                      {r.recipients?.[0]?.count ?? 0}
                    </span>
                  </Table.Cell>
                </Table.Row>
              );
            })}
          </Table.Body>
        </Table.Root>
      )}
    </Container>
  );
}
