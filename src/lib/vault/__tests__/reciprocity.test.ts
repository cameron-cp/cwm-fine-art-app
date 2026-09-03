import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  RECIPROCAL_RELATIONS,
  SYMMETRIC_RELATIONS,
  SECTION_ROUTED_INVERSES,
  inverseOf,
} from "../reciprocity";

const VAULT_LIB_DIR = path.join(
  process.env.HOME ?? "/Users/cameronwmaloney",
  "chloe-second-brain",
  "tools",
);

function pythonInverseOf(relation: string, target?: string | null): string | null {
  // Shells out to python3 to compute the canonical answer from _vault_lib.py.
  // Skipped when python3 isn't available (CI).
  const code = target
    ? `from _vault_lib import inverse_of\nimport sys\nv = inverse_of(${JSON.stringify(relation)}, ${JSON.stringify(target)})\nsys.stdout.write("" if v is None else v)`
    : `from _vault_lib import inverse_of\nimport sys\nv = inverse_of(${JSON.stringify(relation)})\nsys.stdout.write("" if v is None else v)`;
  const out = execFileSync("python3", ["-c", code], {
    cwd: VAULT_LIB_DIR,
    encoding: "utf8",
  });
  return out === "" ? null : out;
}

// These parity tests need TWO things: a python3 binary AND the vault's
// _vault_lib.py, which lives outside this repo (~/chloe-second-brain/tools) and
// exists on Cameron's machine only.
//
// Checking for python3 alone was not enough, and the way it failed is worth
// recording: execFileSync reports a MISSING cwd as "spawnSync python3 ENOENT",
// which reads exactly like a missing interpreter. So on a CI runner — which has
// python3 but no vault — the guard passed, the tests ran, and eight of them blew
// up on what looked like an absent Python. Verify the import, not the binary.
function vaultLibAvailable(): boolean {
  try {
    execFileSync("python3", ["-c", "import _vault_lib"], {
      cwd: VAULT_LIB_DIR,
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

describe("reciprocity vocabulary mirror", () => {
  it("RECIPROCAL_RELATIONS pair count matches Python", () => {
    expect(RECIPROCAL_RELATIONS).toHaveLength(16);
  });

  it("SYMMETRIC_RELATIONS members match Python", () => {
    expect([...SYMMETRIC_RELATIONS].sort()).toEqual([
      "co_collects_with",
      "partner",
      "spouse",
    ]);
  });

  it("SECTION_ROUTED_INVERSES routes current_holder by target section", () => {
    expect(SECTION_ROUTED_INVERSES.current_holder).toEqual({
      clients: "holds_objects",
      galleries: "holds_objects",
      institutions: "works_in_collection",
    });
  });
});

describe("inverseOf", () => {
  it("symmetric relations are their own inverse", () => {
    expect(inverseOf("spouse")).toBe("spouse");
    expect(inverseOf("partner")).toBe("partner");
    expect(inverseOf("co_collects_with")).toBe("co_collects_with");
  });

  it("paired relations map both directions", () => {
    expect(inverseOf("collects_artists")).toBe("major_collectors");
    expect(inverseOf("major_collectors")).toBe("collects_artists");
    expect(inverseOf("artist")).toBe("active_objects");
    expect(inverseOf("active_objects")).toBe("artist");
  });

  it("section-routed: current_holder → holds_objects on clients/galleries", () => {
    expect(inverseOf("current_holder", "clients/howard-rachofsky")).toBe("holds_objects");
    expect(inverseOf("current_holder", "galleries/timothy-taylor")).toBe("holds_objects");
  });

  it("section-routed: current_holder → works_in_collection on institutions", () => {
    expect(inverseOf("current_holder", "institutions/he-museum")).toBe("works_in_collection");
  });

  it("falls back to default inverse for unrouted forward keys", () => {
    expect(inverseOf("holds_objects", "objects/foo")).toBe("current_holder");
  });

  it("returns null for keys without a canonical inverse", () => {
    expect(inverseOf("introduced_by")).toBeNull();
    expect(inverseOf("prior_owners")).toBeNull();
  });
});

describe.runIf(vaultLibAvailable())("parity with _vault_lib.py", () => {
  // Eight hand-picked cases including all three section-routed targets, both
  // symmetric directions, and two narrative-only keys that should return null.
  const cases: Array<[string, string | null]> = [
    ["current_holder", "clients/howard-rachofsky"],
    ["current_holder", "galleries/timothy-taylor"],
    ["current_holder", "institutions/he-museum"],
    ["holds_objects", "objects/x"],
    ["spouse", null],
    ["co_collects_with", null],
    ["introduced_by", null],
    ["artist", "artists/joan-mitchell"],
  ];

  for (const [rel, tgt] of cases) {
    it(`inverseOf(${JSON.stringify(rel)}, ${JSON.stringify(tgt)}) matches Python`, () => {
      expect(inverseOf(rel, tgt)).toBe(pythonInverseOf(rel, tgt));
    });
  }
});
