// Mirror of chloe-second-brain/tools/_vault_lib.py's reciprocity vocabulary.
// Kept in lock-step via the parity test in __tests__/reciprocity.test.ts.
// See docs/decisions/0001-mirror-vault-vocabulary-in-ts.md.

export const RECIPROCAL_RELATIONS: ReadonlyArray<readonly [string, string]> = [
  ["advised_by", "advises"],
  ["parent_entity", "child_entity"],
  ["collects_artists", "major_collectors"],
  ["holds_objects", "current_holder"],
  ["works_in_collection", "current_holder"],
  ["reserved_objects", "reserved_for"],
  ["wishlist_artists", "wishlist_matches"],
  ["represented_by", "artists_represented"],
  ["formerly_represented_by", "formerly_represented"],
  ["patrons", "patron_of"],
  ["met_at", "clients_met_at"],
  ["artist", "active_objects"],
  ["conserved_by", "worked_on"],
  ["shown_at", "works_shown"],
  ["commissioned", "commissioned_by"],
  ["studio_visited", "visited_by"],
];

export const SYMMETRIC_RELATIONS: ReadonlySet<string> = new Set([
  "spouse",
  "partner",
  "co_collects_with",
]);

// Some forward keys map to different inverses depending on the target's section.
// Matches SECTION_ROUTED_INVERSES in _vault_lib.py.
export const SECTION_ROUTED_INVERSES: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  current_holder: {
    clients: "holds_objects",
    galleries: "holds_objects",
    institutions: "works_in_collection",
  },
};

// Default inverse map. Mirrors _INVERSE in _vault_lib.py: first definition wins
// (so 'current_holder' defaults to 'holds_objects' from the holds_objects pair;
// section routing overrides per-target).
const _INVERSE: Record<string, string> = {};
for (const [a, b] of RECIPROCAL_RELATIONS) {
  if (!(a in _INVERSE)) _INVERSE[a] = b;
  if (!(b in _INVERSE)) _INVERSE[b] = a;
}
for (const k of SYMMETRIC_RELATIONS) {
  _INVERSE[k] = k;
}

export function inverseOf(
  relationKey: string,
  targetEntityId?: string | null,
): string | null {
  if (targetEntityId) {
    const idx = targetEntityId.indexOf("/");
    const section = idx >= 0 ? targetEntityId.slice(0, idx) : "";
    const routed = SECTION_ROUTED_INVERSES[relationKey]?.[section];
    if (routed) return routed;
  }
  return _INVERSE[relationKey] ?? null;
}

export function isReciprocalKey(relationKey: string): boolean {
  return relationKey in _INVERSE;
}
