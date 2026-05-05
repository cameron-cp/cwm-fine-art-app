export type Currency = "USD" | "GBP" | "EUR" | "HKD" | "SGD" | "CHF" | "CNY";

export type Tier = { upTo: number; rate: number };

export type RateTrack = {
  id: string;
  label: string;
  tiers: readonly Tier[];
};

export type AuctionLocation = {
  id: string;
  label: string;
  currency: Currency;
  tracks: readonly RateTrack[];
};

export type AuctionHouseId = "christies" | "sothebys" | "phillips";

export type AuctionHouse = {
  id: AuctionHouseId;
  label: string;
  effectiveDate?: string;
  locations: readonly AuctionLocation[];
};

const standard = (label: string, tiers: readonly Tier[]): RateTrack => ({
  id: "standard",
  label,
  tiers,
});

// Christie's: 27% / 22% / 15% across all locations; thresholds vary by currency.
const christiesTiers = (cap1: number, cap2: number): readonly Tier[] => [
  { upTo: cap1, rate: 0.27 },
  { upTo: cap2, rate: 0.22 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.15 },
];

// Sotheby's: 28% / 22% / 15%.
const sothebysTiers = (cap1: number, cap2: number): readonly Tier[] => [
  { upTo: cap1, rate: 0.28 },
  { upTo: cap2, rate: 0.22 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.15 },
];

// Phillips standard: 29% / 22% / 15%; Priority Bidding: 25% / 20% / 14%.
const phillipsStandardTiers = (cap1: number, cap2: number): readonly Tier[] => [
  { upTo: cap1, rate: 0.29 },
  { upTo: cap2, rate: 0.22 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.15 },
];
const phillipsPriorityTiers = (cap1: number, cap2: number): readonly Tier[] => [
  { upTo: cap1, rate: 0.25 },
  { upTo: cap2, rate: 0.2 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.14 },
];

export const HOUSES: readonly AuctionHouse[] = [
  {
    id: "christies",
    label: "Christie's",
    locations: [
      {
        id: "new-york",
        label: "New York",
        currency: "USD",
        tracks: [standard("Standard", christiesTiers(1_500_000, 8_000_000))],
      },
      {
        id: "london",
        label: "London",
        currency: "GBP",
        tracks: [standard("Standard", christiesTiers(1_000_000, 6_000_000))],
      },
      {
        id: "paris",
        label: "Paris",
        currency: "EUR",
        tracks: [standard("Standard", christiesTiers(1_200_000, 7_000_000))],
      },
      {
        id: "hong-kong",
        label: "Hong Kong",
        currency: "HKD",
        tracks: [standard("Standard", christiesTiers(10_000_000, 60_000_000))],
      },
      {
        id: "geneva",
        label: "Geneva",
        currency: "CHF",
        tracks: [standard("Standard", christiesTiers(1_200_000, 6_500_000))],
      },
      {
        id: "shanghai",
        label: "Shanghai",
        currency: "CNY",
        tracks: [standard("Standard", christiesTiers(8_500_000, 50_000_000))],
      },
      {
        id: "dubai",
        label: "Dubai",
        currency: "USD",
        tracks: [standard("Standard", christiesTiers(1_500_000, 8_000_000))],
      },
    ],
  },
  {
    id: "sothebys",
    label: "Sotheby's",
    locations: [
      {
        id: "new-york",
        label: "New York / UAE / Saudi Arabia",
        currency: "USD",
        tracks: [standard("Standard", sothebysTiers(2_000_000, 8_000_000))],
      },
      {
        id: "london",
        label: "London",
        currency: "GBP",
        tracks: [standard("Standard", sothebysTiers(1_500_000, 6_000_000))],
      },
      {
        id: "paris",
        label: "Paris / Cologne / Milan",
        currency: "EUR",
        tracks: [standard("Standard", sothebysTiers(1_750_000, 7_000_000))],
      },
      {
        id: "hong-kong",
        label: "Hong Kong",
        currency: "HKD",
        tracks: [standard("Standard", sothebysTiers(15_000_000, 60_000_000))],
      },
      {
        id: "singapore",
        label: "Singapore",
        currency: "SGD",
        tracks: [standard("Standard", sothebysTiers(2_600_000, 10_000_000))],
      },
      {
        id: "switzerland",
        label: "Switzerland",
        currency: "CHF",
        tracks: [standard("Standard", sothebysTiers(1_600_000, 7_000_000))],
      },
    ],
  },
  {
    id: "phillips",
    label: "Phillips",
    effectiveDate: "12 April 2026",
    locations: [
      {
        id: "new-york",
        label: "New York",
        currency: "USD",
        tracks: [
          { id: "standard", label: "Standard", tiers: phillipsStandardTiers(2_000_000, 8_000_000) },
          { id: "priority", label: "Priority Bidding", tiers: phillipsPriorityTiers(2_000_000, 8_000_000) },
        ],
      },
      {
        id: "london",
        label: "London",
        currency: "GBP",
        tracks: [
          { id: "standard", label: "Standard", tiers: phillipsStandardTiers(1_500_000, 6_000_000) },
          { id: "priority", label: "Priority Bidding", tiers: phillipsPriorityTiers(1_500_000, 6_000_000) },
        ],
      },
      {
        id: "paris",
        label: "Paris",
        currency: "EUR",
        tracks: [
          { id: "standard", label: "Standard", tiers: phillipsStandardTiers(1_750_000, 7_000_000) },
          { id: "priority", label: "Priority Bidding", tiers: phillipsPriorityTiers(1_750_000, 7_000_000) },
        ],
      },
      {
        id: "geneva",
        label: "Geneva (Jewels)",
        currency: "CHF",
        tracks: [
          { id: "standard", label: "Standard", tiers: phillipsStandardTiers(1_600_000, 7_000_000) },
          { id: "priority", label: "Priority Bidding", tiers: phillipsPriorityTiers(1_600_000, 7_000_000) },
        ],
      },
      {
        id: "hong-kong",
        label: "Hong Kong",
        currency: "HKD",
        tracks: [
          { id: "standard", label: "Standard", tiers: phillipsStandardTiers(15_000_000, 60_000_000) },
          { id: "priority", label: "Priority Bidding", tiers: phillipsPriorityTiers(15_000_000, 60_000_000) },
        ],
      },
    ],
  },
];

export function calculateTieredFee(value: number, tiers: readonly Tier[]): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  let total = 0;
  let prevCap = 0;
  for (const tier of tiers) {
    const top = Math.min(value, tier.upTo);
    if (top <= prevCap) break;
    total += (top - prevCap) * tier.rate;
    prevCap = tier.upTo;
    if (value <= tier.upTo) break;
  }
  return total;
}

export function formatTiersSummary(tiers: readonly Tier[], currency: Currency): string {
  const parts: string[] = [];
  let prev = 0;
  for (const t of tiers) {
    const ratePct = `${(t.rate * 100).toFixed(t.rate * 100 === Math.floor(t.rate * 100) ? 0 : 1)}%`;
    if (t.upTo === Number.POSITIVE_INFINITY) {
      parts.push(`${ratePct} above ${formatCurrency(prev, currency)}`);
    } else if (prev === 0) {
      parts.push(`${ratePct} up to ${formatCurrency(t.upTo, currency)}`);
    } else {
      parts.push(`${ratePct} to ${formatCurrency(t.upTo, currency)}`);
    }
    prev = t.upTo;
  }
  return parts.join(" · ");
}

export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
