"use client";

import {
  Button,
  Card,
  Flex,
  IconButton,
  SegmentedControl,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Th } from "@/components/ledger";
import { StatusTag } from "@/components/status-tag";
import { useMemo, useState } from "react";
import {
  AUCTION_FLAT_RATE,
  calculateFee,
  effectiveRate,
  type Engagement,
} from "@/lib/buyer-premium";

type Direction = "sale" | "purchase";
type Mode = "per_lot" | "aggregate";

type Row = {
  id: string;
  title: string;
  artist: string;
  value: string;
  direction: Direction;
};

const newRow = (): Row => ({
  id: crypto.randomUUID(),
  title: "",
  artist: "",
  value: "",
  direction: "sale",
});

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const pct = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 2,
});

function parseValue(raw: string): number {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function Calculator() {
  const [engagement, setEngagement] = useState<Engagement>("private_sale");
  const [mode, setMode] = useState<Mode>("per_lot");
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow(), newRow()]);

  const computed = useMemo(() => {
    const parsed = rows.map((r) => ({ ...r, valueNum: parseValue(r.value) }));

    const sales = parsed.filter((r) => r.direction === "sale");
    const purchases = parsed.filter((r) => r.direction === "purchase");
    const totalSaleValue = sales.reduce((s, r) => s + r.valueNum, 0);
    const totalPurchaseValue = purchases.reduce((s, r) => s + r.valueNum, 0);

    // Per-lot fees for every row (used by the row display and the per-lot totals).
    const perLotFees = parsed.map((r) => calculateFee(engagement, r.valueNum));
    const perLotCollected = sales.reduce(
      (s, r) => s + calculateFee(engagement, r.valueNum),
      0,
    );
    const perLotPaid = purchases.reduce(
      (s, r) => s + calculateFee(engagement, r.valueNum),
      0,
    );

    // Aggregate fees: sum each side and run through the fee curve once.
    // For Auction (flat), aggregate equals per-lot — kept explicit for clarity.
    const aggregateCollected = calculateFee(engagement, totalSaleValue);
    const aggregatePaid = calculateFee(engagement, totalPurchaseValue);

    const useAggregate = engagement === "private_sale" && mode === "aggregate";
    const totalCollected = useAggregate ? aggregateCollected : perLotCollected;
    const totalPaid = useAggregate ? aggregatePaid : perLotPaid;
    const net = totalCollected - totalPaid;

    return {
      parsed,
      perLotFees,
      totalSaleValue,
      totalPurchaseValue,
      totalCollected,
      totalPaid,
      net,
      perLotCollected,
      perLotPaid,
      aggregateCollected,
      aggregatePaid,
    };
  }, [rows, engagement, mode]);

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

  const showPerRowFee =
    engagement === "auction" || mode === "per_lot";
  const aggregateMeaningful = engagement === "private_sale";

  return (
    <Flex direction="column" gap="5">
      <Flex align="end" justify="between" gap="5" wrap="wrap">
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            Engagement type
          </Text>
          <SegmentedControl.Root
            value={engagement}
            onValueChange={(v) => setEngagement(v as Engagement)}
            size="2"
          >
            <SegmentedControl.Item value="private_sale">Private sale</SegmentedControl.Item>
            <SegmentedControl.Item value="auction">Auction</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Text size="1" color="gray">
            {engagement === "private_sale"
              ? "Tiered: 20% up to $250K, 10% to $2.5M, 7.5% to $5M, 5% above."
              : `Flat ${pct.format(AUCTION_FLAT_RATE)} on every lot.`}
          </Text>
        </Flex>

        <Flex direction="column" gap="1">
          <Text size="2" weight="medium" color={aggregateMeaningful ? undefined : "gray"}>
            Calculation mode
          </Text>
          <SegmentedControl.Root
            value={mode}
            onValueChange={(v) => setMode(v as Mode)}
            size="2"
            disabled={!aggregateMeaningful}
          >
            <SegmentedControl.Item value="per_lot">Per lot</SegmentedControl.Item>
            <SegmentedControl.Item value="aggregate">Aggregate</SegmentedControl.Item>
          </SegmentedControl.Root>
          <Text size="1" color="gray">
            {!aggregateMeaningful
              ? "Auction is flat — aggregate and per-lot are equivalent."
              : mode === "per_lot"
                ? "Each work runs through the tiers independently."
                : "Sales and purchases each summed before tiered calc."}
          </Text>
        </Flex>

        <Flex gap="2">
          <Button variant="soft" color="gray" onClick={reset}>
            Reset
          </Button>
          <Button onClick={addRow}>Add artwork</Button>
        </Flex>
      </Flex>

      <Table.Root variant="ghost">
        <Table.Header>
          <Table.Row>
            <Th width="140px">Direction</Th>
            <Th>Title</Th>
            <Th>Artist</Th>
            <Th width="200px">Value (USD)</Th>
            <Th width="180px" align="right">
              Fee
            </Th>
            <Th width="48px" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, i) => {
            const valueNum = computed.parsed[i].valueNum;
            const rowFee = computed.perLotFees[i];
            const isSale = row.direction === "sale";
            return (
              <Table.Row key={row.id}>
                <Table.Cell>
                  <SegmentedControl.Root
                    size="1"
                    value={row.direction}
                    onValueChange={(v) => updateRow(row.id, { direction: v as Direction })}
                  >
                    <SegmentedControl.Item value="sale">Sale</SegmentedControl.Item>
                    <SegmentedControl.Item value="purchase">Buy</SegmentedControl.Item>
                  </SegmentedControl.Root>
                </Table.Cell>
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
                    value={row.value}
                    onChange={(e) => updateRow(row.id, { value: e.target.value })}
                  >
                    <TextField.Slot>$</TextField.Slot>
                  </TextField.Root>
                </Table.Cell>
                <Table.Cell align="right">
                  {valueNum > 0 && showPerRowFee ? (
                    <Flex direction="column" align="end">
                      <Text>
                        {isSale ? "+" : "−"}
                        {usd.format(rowFee)}
                      </Text>
                      <StatusTag tone={isSale ? "positive" : "warning"}>
                        {isSale ? "collect" : "pay"}
                      </StatusTag>
                    </Flex>
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
                    aria-label="Remove row"
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
            label="Total sale value"
            value={usd.format(computed.totalSaleValue)}
            muted
          />
          <SummaryRow
            label="Total purchase value"
            value={usd.format(computed.totalPurchaseValue)}
            muted
          />
          <SummaryRow
            label="Fees collected (sales)"
            value={`+${usd.format(computed.totalCollected)}`}
            tone="positive"
          />
          <SummaryRow
            label="Fees paid (purchases)"
            value={`−${usd.format(computed.totalPaid)}`}
            tone="negative"
          />
          <SummaryRow
            label="Net fees"
            value={`${computed.net >= 0 ? "+" : "−"}${usd.format(Math.abs(computed.net))}`}
            tone={computed.net >= 0 ? "positive" : "negative"}
            emphasis
          />
          {computed.totalSaleValue > 0 && (
            <SummaryRow
              label="Effective rate (sales)"
              value={pct.format(
                effectiveRate(computed.totalSaleValue, computed.totalCollected),
              )}
              muted
            />
          )}

          {aggregateMeaningful && (computed.totalSaleValue > 0 || computed.totalPurchaseValue > 0) && (
            <Flex direction="column" gap="1" mt="2">
              <Text size="1" color="gray">
                Mode comparison
              </Text>
              <SummaryRow
                label="Per-lot net"
                value={usd.format(computed.perLotCollected - computed.perLotPaid)}
                muted
              />
              <SummaryRow
                label="Aggregate net"
                value={usd.format(computed.aggregateCollected - computed.aggregatePaid)}
                muted
              />
            </Flex>
          )}
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
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  muted?: boolean;
  tone?: "positive" | "negative";
}) {
  const color = muted ? "gray" : tone === "positive" ? "green" : tone === "negative" ? "red" : undefined;
  return (
    <Flex justify="between" align="baseline">
      <Text size={emphasis ? "3" : "2"} color={muted ? "gray" : undefined}>
        {label}
      </Text>
      <Text
        size={emphasis ? "5" : "3"}
        weight={emphasis ? "bold" : "medium"}
        color={color}
      >
        {value}
      </Text>
    </Flex>
  );
}
