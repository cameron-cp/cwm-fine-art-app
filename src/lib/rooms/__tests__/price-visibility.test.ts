import { describe, expect, it } from "vitest";
import { resolveRoomPrice } from "../public";

// Price visibility is the dealer's per-room decision about what a collector sees.
// Getting 'hidden'/'on_request' wrong would leak a real price the dealer chose to
// withhold — so each mode is pinned to its exact rendered output.

describe("resolveRoomPrice", () => {
  const PRICE = "$48,000";

  it("'show' renders the actual formatted price", () => {
    expect(resolveRoomPrice("show", PRICE)).toBe(PRICE);
  });

  it("'on_request' NEVER renders the number — always the phrase", () => {
    // The load-bearing assertion: the real price must not appear.
    expect(resolveRoomPrice("on_request", PRICE)).toBe("Price on request");
    expect(resolveRoomPrice("on_request", PRICE)).not.toContain("48");
  });

  it("'hidden' renders nothing at all (null → no price node on the page)", () => {
    expect(resolveRoomPrice("hidden", PRICE)).toBeNull();
  });

  it("'show' with no price on the work renders nothing (null passes through)", () => {
    expect(resolveRoomPrice("show", null)).toBeNull();
  });
});
