"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Exhibition-signage nav: letterspaced uppercase micro-caps, ink-muted by default,
// ink on hover, claret underline for the active section. See docs/design/design-system.md.
const LINKS: { href: string; label: string }[] = [
  { href: "/chat", label: "Ask" },
  { href: "/artists", label: "Artists" },
  { href: "/artworks", label: "Artworks" },
  { href: "/contacts", label: "Contacts" },
  { href: "/invoices", label: "Invoices" },
  { href: "/retainers", label: "Retainers" },
  { href: "/settings", label: "Settings" },
  { href: "/calculator", label: "Commission" },
  { href: "/buyer-premium", label: "Auction BP" },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "border-b pb-[2px] text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors",
              active
                ? "border-[var(--claret)] text-[var(--ink)]"
                : "border-transparent text-[var(--ink-3)] hover:text-[var(--ink)]",
            ].join(" ")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
