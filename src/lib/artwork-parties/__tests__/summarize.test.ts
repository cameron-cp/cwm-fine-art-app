import { describe, expect, it } from "vitest";
import {
  describeLink,
  isCurrentOwner,
  sortArtworkParties,
  summarizeArtworkParties,
} from "../summarize";
import type { ArtworkPartyRow, LinkedArtwork } from "@/lib/schemas/artwork-party";

// Build an ArtworkPartyRow with sane defaults; override per case. The `artwork`
// override is partial and merges into the default work, so a case that only
// cares about the artist name says only that.
type RowOverrides = Partial<Omit<ArtworkPartyRow, "artwork">> & {
  artwork?: Partial<LinkedArtwork>;
};

function row(overrides: RowOverrides = {}): ArtworkPartyRow {
  const { artwork, ...rest } = overrides;
  return {
    id: crypto.randomUUID(),
    artwork_id: crypto.randomUUID(),
    party_id: "p",
    role: "owner",
    source: "stated",
    confidence: "confirmed",
    started_on: null,
    ended_on: null,
    notes: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    artwork: {
      id: crypto.randomUUID(),
      title: "Untitled",
      year: 1962,
      medium: "Oil on canvas",
      edition: null,
      status: "available",
      record_kind: "tracked",
      price_cents: null,
      currency: "USD",
      primary_image_path: null,
      artist_name: "Joan Mitchell",
      ...artwork,
    },
    ...rest,
  };
}

describe("isCurrentOwner — the title rule", () => {
  // THE load-bearing invariant of this feature. artwork_parties holds advisor,
  // gallery, and conservator edges alongside title; if any of them widened into
  // ownership, the dealer would tell a collector they own a work they don't.
  it("counts an open owner row and nothing else", () => {
    expect(isCurrentOwner(row({ role: "owner", ended_on: null }))).toBe(true);
    for (const role of ["advisor", "gallery", "consignor", "custodian", "lender"] as const) {
      expect(isCurrentOwner(row({ role, ended_on: null }))).toBe(false);
    }
  });

  it("does not count an owner row whose interval has closed", () => {
    // A past owner is history, not a holding.
    expect(isCurrentOwner(row({ role: "owner", ended_on: "2009-04-01" }))).toBe(false);
  });
});

describe("summarizeArtworkParties", () => {
  it("returns empty string for no rows (component renders nothing)", () => {
    expect(summarizeArtworkParties([])).toBe("");
  });

  it("never reports a non-owner link as ownership", () => {
    // Falsifies any implementation that counts rows without checking role.
    const s = summarizeArtworkParties([
      row({ role: "advisor" }),
      row({ role: "gallery" }),
    ]);
    expect(s).not.toMatch(/[Oo]wns/);
    expect(s).toBe("Advises on 1 work; gallery for 1 work.");
  });

  it("separates current ownership from past ownership", () => {
    const s = summarizeArtworkParties([
      row({ role: "owner" }),
      row({ role: "owner" }),
      row({ role: "owner", started_on: "2001-01-01", ended_on: "2009-04-01" }),
    ]);
    expect(s).toBe("Owns 2 works; previously owned 1 work.");
  });

  it("capitalizes the first clause even when the contact owns nothing", () => {
    // A contact can be an advisor and hold no title at all — the sentence must
    // still read as a sentence.
    expect(summarizeArtworkParties([row({ role: "conservator" })])).toBe(
      "Conserving 1 work.",
    );
  });

  it("pluralizes on the count, not the row list", () => {
    expect(summarizeArtworkParties([row()])).toBe("Owns 1 work.");
    expect(summarizeArtworkParties([row(), row()])).toBe("Owns 2 works.");
  });
});

describe("sortArtworkParties", () => {
  it("puts current holdings first, then other current links, then closed ones", () => {
    // The dealer opens a contact to see what they hold; history goes last.
    const past = row({ role: "owner", ended_on: "2009-04-01" });
    const advisor = row({ role: "advisor" });
    const owned = row({ role: "owner" });
    const order = sortArtworkParties([past, advisor, owned]).map((r) => r.id);
    expect(order).toEqual([owned.id, advisor.id, past.id]);
  });

  it("orders closed links most-recently-ended first", () => {
    const older = row({ role: "owner", ended_on: "2001-01-01" });
    const newer = row({ role: "owner", ended_on: "2019-01-01" });
    expect(sortArtworkParties([older, newer]).map((r) => r.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it("sorts by artist then title within a band", () => {
    const b = row({ artwork: { artist_name: "Agnes Martin", title: "Untitled #2" } });
    const a = row({ artwork: { artist_name: "Agnes Martin", title: "Untitled #1" } });
    const z = row({ artwork: { artist_name: "Zao Wou-Ki", title: "Aaa" } });
    expect(sortArtworkParties([z, b, a]).map((r) => r.id)).toEqual([a.id, b.id, z.id]);
  });

  it("does not mutate its input", () => {
    const rows = [row({ role: "advisor" }), row({ role: "owner" })];
    const before = rows.map((r) => r.id);
    sortArtworkParties(rows);
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

describe("describeLink", () => {
  it("renders an open interval with a start as 'since'", () => {
    expect(describeLink(row({ started_on: "2019-06-01" }))).toBe("Owner · since 2019");
  });

  it("renders a closed interval as a year range", () => {
    expect(
      describeLink(row({ role: "advisor", started_on: "2019-06-01", ended_on: "2023-02-01" })),
    ).toBe("Advisor · 2019–2023");
  });

  it("says only the role when no dates are known", () => {
    // Dates are often unknown ("the Hendersons have had it for years") — the
    // byline must not invent one.
    expect(describeLink(row())).toBe("Owner");
  });

  it("surfaces a soft confidence so an unverified claim never reads as fact", () => {
    expect(describeLink(row({ confidence: "tentative" }))).toBe("Owner · tentative");
    expect(describeLink(row({ confidence: "confirmed" }))).toBe("Owner");
  });
});
