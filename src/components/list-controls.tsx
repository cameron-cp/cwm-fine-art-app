"use client";

import { Flex, Select, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useState } from "react";

// Shared list-surface controls for the "ledger" pages (artists / artworks /
// contacts). Search + filters live in the URL via nuqs so a filtered view is
// shareable and survives back/forward. All controls use `shallow: false` so the
// server component re-runs its Supabase query on change.
//
// Design system: square inputs, --paper fill / --rule-2 border, claret focus
// (inherited from globals.css). Filter labels are letterspaced uppercase caps.

const LABEL =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]";

/**
 * Debounced, URL-backed search box. Types locally for responsiveness, writes to
 * `?<paramKey>=` after a short pause so we don't navigate on every keystroke.
 * Empty string removes the param entirely.
 */
export function SearchInput({
  paramKey = "q",
  placeholder = "Search…",
}: {
  paramKey?: string;
  placeholder?: string;
}) {
  const [q, setQ] = useQueryState(
    paramKey,
    parseAsString.withDefault("").withOptions({ shallow: false }),
  );
  const [local, setLocal] = useState(q);

  // Pull URL → local when the param changes underneath us (e.g. "Clear filters"
  // or back-button) using the render-time "adjust state on change" pattern —
  // avoids a setState-in-effect. Converges because setQ only writes `local`.
  const [prevQ, setPrevQ] = useState(q);
  if (q !== prevQ) {
    setPrevQ(q);
    setLocal(q);
  }

  // Push local → URL, debounced. Writing to the URL (an external system) is the
  // legitimate use of an effect here. Skips the no-op write on mount / echo.
  useEffect(() => {
    if (local === q) return;
    const t = setTimeout(() => setQ(local || null), 250);
    return () => clearTimeout(t);
  }, [local, q, setQ]);

  return (
    <TextField.Root
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="min-w-[15rem]"
    >
      <TextField.Slot>
        <SearchGlyph />
      </TextField.Slot>
    </TextField.Root>
  );
}

/**
 * A single-select URL filter. `all` is the sentinel that clears the param.
 * Renders a labelled Radix Select on-system.
 */
export function FilterSelect({
  paramKey,
  label,
  options,
  allLabel = "All",
  placeholder,
}: {
  paramKey: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useQueryState(
    paramKey,
    parseAsString.withDefault("").withOptions({ shallow: false }),
  );

  return (
    <Flex direction="column" gap="1">
      <span className={LABEL}>{label}</span>
      <Select.Root
        value={value || "__all__"}
        onValueChange={(v) => setValue(v === "__all__" ? null : v)}
      >
        <Select.Trigger placeholder={placeholder} variant="surface" color="gray" />
        <Select.Content>
          <Select.Item value="__all__">{allLabel}</Select.Item>
          {options.map((o) => (
            <Select.Item key={o.value} value={o.value}>
              {o.label}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    </Flex>
  );
}

/**
 * "Clear" link — a plain <Link> to the bare pathname, so it resets every URL
 * param at once. Only render when something is active (caller decides).
 */
export function ClearFilters({ href }: { href: string }) {
  // Muted, not claret — the single accent per view is reserved for the primary
  // "New …" action. Clear is a secondary control (design system: one accent).
  return (
    <Link
      href={href}
      className="self-end text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)] underline decoration-[var(--rule-2)] underline-offset-4 hover:text-[var(--ink)] hover:decoration-[var(--ink)]"
    >
      Clear
    </Link>
  );
}

function SearchGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M10 6.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm-.86 3.28a5 5 0 1 1 .64-.64l2.79 2.79a.45.45 0 0 1-.64.64l-2.79-2.79Z"
        fill="currentColor"
      />
    </svg>
  );
}
