import { Table } from "@radix-ui/themes";
import type { ReactNode } from "react";

// Shared "ledger" table treatment — the on-system list surface.
// See docs/design/design-system.md ("Tables").

// Column-header micro-caps. Applied on a <span> so Tailwind utilities win over
// Radix Themes' unlayered cell styles (unlayered CSS beats @layer utilities).
export const LEDGER_HEAD =
  "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]";

/** A ledger column header. Wraps its label in the micro-cap treatment. */
export function Th({
  children,
  align,
  width,
}: {
  children?: ReactNode;
  align?: "left" | "center" | "right";
  width?: string;
}) {
  return (
    <Table.ColumnHeaderCell align={align} width={width}>
      {children ? <span className={LEDGER_HEAD}>{children}</span> : null}
    </Table.ColumnHeaderCell>
  );
}
