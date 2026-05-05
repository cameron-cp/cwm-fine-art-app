// Format dimensions as the dealer writes them on factsheets:
//   "48 x 60 in. (121.9 x 152.4 cm)"
//   "12 x 8 x 4 in. (30.5 x 20.3 x 10.2 cm)"
// Depth is omitted when not provided (flat works like paintings).

const IN_TO_CM = 2.54;

function trimNum(n: number, decimals = 1): string {
  if (Number.isInteger(n)) return String(n);
  // Drop trailing zeros: 121.90 → 121.9, 0.50 → 0.5.
  return n.toFixed(decimals).replace(/\.?0+$/, "");
}

export function formatDimensions(
  height: number | null | undefined,
  width: number | null | undefined,
  depth: number | null | undefined,
): string | null {
  if (!height || !width) return null;

  const inParts = [height, width];
  if (depth) inParts.push(depth);
  const inStr = inParts.map((n) => trimNum(n, 2)).join(" x ");

  const cmParts = inParts.map((n) => trimNum(n * IN_TO_CM, 1));
  const cmStr = cmParts.join(" x ");

  return `${inStr} in. (${cmStr} cm)`;
}
