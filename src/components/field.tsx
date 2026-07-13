import { Text } from "@radix-ui/themes";
import type { ReactNode } from "react";

// Shared form field — the on-system label treatment (letterspaced uppercase
// micro-caps) plus optional hint and error. See docs/design/design-system.md.
//
// Validation errors intentionally stay functional-red: an error is not brand
// expression, and red is the universal "you must fix this" signal — distinct
// from the claret accent, which is reserved for the primary action.
export function Field({
  label,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col gap-[6px]">
      <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
        {label}
        {required ? <span className="text-[var(--ink-3)]"> *</span> : null}
      </label>
      {hint && (
        <Text size="1" color="gray">
          {hint}
        </Text>
      )}
      {children}
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}
    </div>
  );
}
