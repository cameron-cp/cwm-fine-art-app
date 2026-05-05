// Private-sale commission tiers (marginal, applied per lot).
export const BUYER_PREMIUM_TIERS = [
  { upTo: 250_000, rate: 0.2 },
  { upTo: 2_500_000, rate: 0.1 },
  { upTo: 5_000_000, rate: 0.075 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.05 },
] as const;

export const AUCTION_FLAT_RATE = 0.1;

export type Engagement = "private_sale" | "auction";

export function calculateBuyerPremium(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  let premium = 0;
  let prevCap = 0;
  for (const tier of BUYER_PREMIUM_TIERS) {
    const top = Math.min(value, tier.upTo);
    if (top <= prevCap) break;
    premium += (top - prevCap) * tier.rate;
    prevCap = tier.upTo;
    if (value <= tier.upTo) break;
  }
  return premium;
}

export function calculateAuctionFee(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value * AUCTION_FLAT_RATE;
}

export function calculateFee(engagement: Engagement, value: number): number {
  return engagement === "private_sale"
    ? calculateBuyerPremium(value)
    : calculateAuctionFee(value);
}

export function effectiveRate(value: number, premium: number): number {
  if (value <= 0) return 0;
  return premium / value;
}
