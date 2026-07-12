import { describe, expect, it } from "vitest";
import {
  buildRelationshipInput,
  directedRelationshipOptions,
  partyRelationshipSchema,
  partyRelationshipTypes,
  prefillDirectedOptionKey,
  relationshipPhrase,
} from "../party";

// Well-formed v4 UUIDs (version nibble 4, variant nibble 8/9) — z.string().uuid()
// validates version + variant bits, so all-1s/all-2s would (correctly) be rejected.
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb";

const base = {
  from_party_id: A,
  to_party_id: B,
  type: "advises" as const,
  valid_from: null,
  valid_to: null,
  notes: null,
};

describe("partyRelationshipSchema", () => {
  it("rejects a relationship whose two parties are the same", () => {
    // The picker excludes self, but a forged/buggy submit must not create a
    // self-loop — it would render as "X advises X" and pollute both graph sides.
    const r = partyRelationshipSchema.safeParse({ ...base, to_party_id: A });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe(
        "A contact can't have a relationship to itself",
      );
    }
  });

  it("accepts a valid directed edge and coerces a blank date to null", () => {
    const r = partyRelationshipSchema.safeParse({ ...base, valid_from: "" });
    expect(r.success && r.data.valid_from).toBeNull();
    expect(r.success && r.data.from_party_id).toBe(A);
  });

  it("rejects a malformed valid_from date", () => {
    // Postgres `date` would reject it anyway; catch it before the round-trip.
    expect(
      partyRelationshipSchema.safeParse({ ...base, valid_from: "07/12/2026" })
        .success,
    ).toBe(false);
  });
});

describe("directedRelationshipOptions", () => {
  it("yields exactly 12 options — 6 types × 2 directions", () => {
    expect(directedRelationshipOptions("Jane")).toHaveLength(
      partyRelationshipTypes.length * 2,
    );
  });

  it("maps advises:from to the from-side with a contact-as-subject label", () => {
    // If this inverts, every 'advises' edge added from a contact's page points
    // the wrong way — the single highest-risk bug in the feature.
    const opts = directedRelationshipOptions("Jane");
    const fromOpt = opts.find((o) => o.value === "advises:from");
    expect(fromOpt).toMatchObject({ type: "advises", contactIsFrom: true });
    expect(fromOpt?.label).toBe("Advises …");
    const toOpt = opts.find((o) => o.value === "advises:to");
    expect(toOpt).toMatchObject({ type: "advises", contactIsFrom: false });
    expect(toOpt?.label).toBe("… — Advises Jane");
  });
});

describe("add/edit mapping round-trips (real production functions)", () => {
  // Imports the SAME functions the component calls, so a direction-inverting bug
  // in either mapping fails this test — not a re-implementation that can't.
  it("build → prefill returns the original option for every one of the 12 options", () => {
    const contactId = A;
    const otherId = B;
    for (const opt of directedRelationshipOptions("Jane")) {
      const row = buildRelationshipInput(contactId, opt.value, otherId);
      expect(prefillDirectedOptionKey(row, contactId)).toBe(opt.value);
    }
  });

  it("puts the current contact on the correct side per direction", () => {
    const from = buildRelationshipInput(A, "represents:from", B);
    expect(from).toEqual({ from_party_id: A, to_party_id: B, type: "represents" });
    const to = buildRelationshipInput(A, "represents:to", B);
    expect(to).toEqual({ from_party_id: B, to_party_id: A, type: "represents" });
  });
});

describe("relationshipPhrase — one renderer for picker + rows", () => {
  it("reads consistently from both sides of the same edge", () => {
    // Outbound on the from-party's page, inbound on the to-party's page — the two
    // must describe the same edge, not contradict each other.
    expect(relationshipPhrase("advises", true, "Bob", "Jane")).toBe("Advises Bob");
    expect(relationshipPhrase("advises", false, "Jane", "Bob")).toBe(
      "Jane — Advises Bob",
    );
  });
});
