"use client";

import {
  Button,
  Card,
  Flex,
  IconButton,
  SegmentedControl,
  Select,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Th } from "@/components/ledger";
import { useState } from "react";
import {
  HOUSES,
  type AuctionHouseId,
  calculateTieredFee,
  formatCurrency,
  formatTiersSummary,
} from "@/lib/auction-bp";

type Mode = "per_lot" | "aggregate";

type Row = {
  id: string;
  title: string;
  artist: string;
  hammer: string;
};

const newRow = (): Row => ({
  id: crypto.randomUUID(),
  title: "",
  artist: "",
  hammer: "",
});

function parseValue(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const pct = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 2 });

export function AuctionCalculator() {
  const [houseId, setHouseId] = useState<AuctionHouseId>("christies");
  const house = HOUSES.find((h) => h.id === houseId)!;

  const [locationId, setLocationId] = useState<string>(house.locations[0].id);
  const location = house.locations.find((l) => l.id === locationId) ?? house.locations[0];

  const [trackId, setTrackId] = useState<string>(location.tracks[0].id);
  const track = location.tracks.find((t) => t.id === trackId) ?? location.tracks[0];

  const [mode, setMode] = useState<Mode>("per_lot");
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow(), newRow()]);

  function changeHouse(nextId: AuctionHouseId) {
    const next = HOUSES.find((h) => h.id === nextId)!;
    setHouseId(nextId);
    setLocationId(next.locations[0].id);
    setTrackId(next.locations[0].tracks[0].id);
  }

  function changeLocation(nextLocId: string) {
    const nextLoc = house.locations.find((l) => l.id === nextLocId) ?? house.locations[0];
    setLocationId(nextLoc.id);
    setTrackId(nextLoc.tracks[0].id);
  }

  // No manual useMemo: React Compiler memoizes this, and the calc is trivial
  // (a few maps over a handful of rows). Manual memoization here couldn't be
  // preserved by the compiler (react-hooks/preserve-manual-memoization).
  const parsedRows = rows.map((r) => ({ ...r, hammerNum: parseValue(r.hammer) }));
  const totalHammer = parsedRows.reduce((s, r) => s + r.hammerNum, 0);
  const perLotFees = parsedRows.map((r) => calculateTieredFee(r.hammerNum, track.tiers));
  const perLotTotal = perLotFees.reduce((s, p) => s + p, 0);
  const aggregateTotal = calculateTieredFee(totalHammer, track.tiers);
  const totalBp = mode === "per_lot" ? perLotTotal : aggregateTotal;
  const computed = {
    parsed: parsedRows,
    perLotFees,
    totalHammer,
    totalBp,
    perLotTotal,
    aggregateTotal,
    totalPayable: totalHammer + totalBp,
  };

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, newRow()]);
  }
  function removeRow(id: string) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((r) => r.id !== id)));
  }
  function reset() {
    setRows([newRow(), newRow(), newRow()]);
  }

  const showTrackToggle = location.tracks.length > 1;

  return (
    <Flex direction="column" gap="5">
      <Flex align="start" justify="between" gap="5" wrap="wrap">
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            Auction house
          </Text>
          <SegmentedControl.Root
            value={houseId}
            onValueChange={(v) => changeHouse(v as AuctionHouseId)}
            size="2"
          >
            {HOUSES.map((h) => (
              <SegmentedControl.Item key={h.id} value={h.id}>
                {h.label}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl.Root>
          {house.effectiveDate && (
            <Text size="1" color="gray">
              Rate card effective {house.effectiveDate}
            </Text>
          )}
        </Flex>

        <Flex direction="column" gap="1" minWidth="220px">
          <Text size="2" weight="medium">
            Sale location
          </Text>
          <Select.Root value={locationId} onValueChange={changeLocation} size="2">
            <Select.Trigger />
            <Select.Content>
              {house.locations.map((l) => (
                <Select.Item key={l.id} value={l.id}>
                  {l.label} · {l.currency}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
          <Text size="1" color="gray">
            {formatTiersSummary(track.tiers, location.currency)}
          </Text>
        </Flex>

        {showTrackToggle && (
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Bidder type
            </Text>
            <SegmentedControl.Root
              value={trackId}
              onValueChange={setTrackId}
              size="2"
            >
              {location.tracks.map((t) => (
                <SegmentedControl.Item key={t.id} value={t.id}>
                  {t.label}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl.Root>
            <Text size="1" color="gray">
              Priority Bidding requires qualification at Phillips.
            </Text>
          </Flex>
        )}

        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            Calculation mode
          </Text>
          <SegmentedControl.Root value={mode} onValueChange={(v) => setMode(v as Mode)} size="2">
            <SegmentedControl.Item value="per_lot">Per lot</SegmentedControl.Item>
            <SegmentedControl.Item value="aggregate">Aggregate</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Text size="1" color="gray">
            {mode === "per_lot"
              ? "How auction houses actually charge."
              : "Single tiered calc on the sum — what-if only."}
          </Text>
        </Flex>

        <Flex direction="column" gap="1">
          {/* Spacer matching the sibling column labels so the buttons align with the controls, not the labels. */}
          <Text size="2" weight="medium" aria-hidden style={{ visibility: "hidden" }}>
            &nbsp;
          </Text>
          <Flex gap="2">
            <Button variant="soft" color="gray" onClick={reset}>
              Reset
            </Button>
            <Button onClick={addRow}>Add lot</Button>
          </Flex>
        </Flex>
      </Flex>

      <Table.Root variant="ghost">
        <Table.Header>
          <Table.Row>
            <Th>Title</Th>
            <Th>Artist</Th>
            <Th width="220px">Hammer ({location.currency})</Th>
            <Th width="180px" align="right">
              Buyer&apos;s premium
            </Th>
            <Th width="180px" align="right">
              Total payable
            </Th>
            <Th width="48px" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, i) => {
            const hammer = computed.parsed[i].hammerNum;
            const fee = computed.perLotFees[i];
            const showFee = mode === "per_lot";
            return (
              <Table.Row key={row.id}>
                <Table.Cell>
                  <TextField.Root
                    placeholder="Untitled #3"
                    value={row.title}
                    onChange={(e) => updateRow(row.id, { title: e.target.value })}
                  />
                </Table.Cell>
                <Table.Cell>
                  <TextField.Root
                    placeholder="Agnes Martin"
                    value={row.artist}
                    onChange={(e) => updateRow(row.id, { artist: e.target.value })}
                  />
                </Table.Cell>
                <Table.Cell>
                  <TextField.Root
                    placeholder="0"
                    inputMode="decimal"
                    value={row.hammer}
                    onChange={(e) => updateRow(row.id, { hammer: e.target.value })}
                  />
                </Table.Cell>
                <Table.Cell align="right">
                  {hammer > 0 && showFee ? (
                    <Text>{formatCurrency(fee, location.currency)}</Text>
                  ) : (
                    <Text color="gray">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell align="right">
                  {hammer > 0 && showFee ? (
                    <Text weight="medium">{formatCurrency(hammer + fee, location.currency)}</Text>
                  ) : (
                    <Text color="gray">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <IconButton
                    variant="ghost"
                    color="gray"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length === 1}
                    aria-label="Remove lot"
                  >
                    ✕
                  </IconButton>
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>

      <Card>
        <Flex direction="column" gap="3" p="2">
          <SummaryRow
            label="Total hammer"
            value={formatCurrency(computed.totalHammer, location.currency)}
            muted
          />
          <SummaryRow
            label={`Total buyer's premium (${mode === "per_lot" ? "per lot" : "aggregate"})`}
            value={formatCurrency(computed.totalBp, location.currency)}
          />
          <SummaryRow
            label="Total payable by buyer"
            value={formatCurrency(computed.totalPayable, location.currency)}
            emphasis
          />
          {computed.totalHammer > 0 && (
            <SummaryRow
              label="Effective premium rate"
              value={pct.format(computed.totalBp / computed.totalHammer)}
              muted
            />
          )}
          {computed.totalHammer > 0 && (
            <Flex direction="column" gap="1" mt="2">
              <Text size="1" color="gray">
                Mode comparison
              </Text>
              <SummaryRow
                label="If billed per lot"
                value={formatCurrency(computed.perLotTotal, location.currency)}
                muted
              />
              <SummaryRow
                label="If billed in aggregate"
                value={formatCurrency(computed.aggregateTotal, location.currency)}
                muted
              />
            </Flex>
          )}
          <Text size="1" color="gray" mt="2">
            Excludes local taxes, VAT, artist&apos;s resale right, and any overhead premium that may apply.
          </Text>
        </Flex>
      </Card>
    </Flex>
  );
}

function SummaryRow({
  label,
  value,
  emphasis,
  muted,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
}) {
  return (
    <Flex justify="between" align="baseline">
      <Text size={emphasis ? "3" : "2"} color={muted ? "gray" : undefined}>
        {label}
      </Text>
      <Text
        size={emphasis ? "5" : "3"}
        weight={emphasis ? "bold" : "medium"}
        color={muted ? "gray" : undefined}
      >
        {value}
      </Text>
    </Flex>
  );
}
