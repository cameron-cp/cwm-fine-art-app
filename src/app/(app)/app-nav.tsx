"use client";

import { DropdownMenu } from "@radix-ui/themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Exhibition-signage nav: letterspaced uppercase micro-caps, ink-muted by default,
// ink on hover, claret underline for the active section. See docs/design/design-system.md.
//
// The nav is deliberately split by *kind*, not flattened into one row:
//   - PRIMARY  — the destinations she browses daily (inventory + the ledger).
//   - TOOLS    — occasional calculators, tucked into a popover so they don't
//                compete with destinations for the eye.
// Account-level items (Ask, Settings) live in the header top row, not here.
const PRIMARY: { href: string; label: string }[] = [
  { href: "/artworks", label: "Artworks" },
  { href: "/artists", label: "Artists" },
  { href: "/rooms", label: "Rooms" },
  { href: "/contacts", label: "Contacts" },
  { href: "/invoices", label: "Invoices" },
  { href: "/retainers", label: "Retainers" },
];

const TOOLS: { href: string; label: string }[] = [
  { href: "/calculator", label: "Commission" },
  { href: "/buyer-premium", label: "Auction BP" },
];

const linkClass = (active: boolean) =>
  [
    "border-b pb-[2px] text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
    active
      ? "border-[var(--claret)] text-[var(--ink)]"
      : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink)]",
  ].join(" ");

export function AppNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const toolsActive = TOOLS.some(({ href }) => isActive(href));

  return (
    <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {PRIMARY.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={isActive(href) ? "page" : undefined}
          className={linkClass(isActive(href))}
        >
          {label}
        </Link>
      ))}

      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <button type="button" className={linkClass(toolsActive)}>
            Tools <span aria-hidden className="text-[9px]">▾</span>
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content variant="soft" color="gray">
          {TOOLS.map(({ href, label }) => (
            <DropdownMenu.Item key={href} asChild>
              <Link
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className="text-[11px] font-semibold uppercase tracking-[0.14em]"
              >
                {label}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </nav>
  );
}
