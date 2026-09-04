import { UserButton } from "@clerk/nextjs";
import { Box, Container, Flex } from "@radix-ui/themes";
import Link from "next/link";
import { AppNav } from "./app-nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Flex direction="column" className="min-h-screen">
      <Box asChild className="border-b border-[var(--rule)]">
        <header>
          <Container size="4" py="4">
            <Flex direction="column" gap="4">
              <Flex align="center" justify="between" gap="6">
                <Link
                  href="/artworks"
                  className="font-serif text-[19px] tracking-[0.01em] text-[var(--ink)]"
                >
                  Chloe Waddington <span className="font-semibold">Fine Art</span>
                </Link>
                <Flex align="center" gap="5">
                  <Link
                    href="/chat"
                    className="border-b border-transparent pb-[2px] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink)] transition-colors hover:text-[var(--ink)]"
                  >
                    Ask
                  </Link>
                  <Link
                    href="/settings"
                    className="border-b border-transparent pb-[2px] text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
                  >
                    Settings
                  </Link>
                  <UserButton />
                </Flex>
              </Flex>
              <AppNav />
            </Flex>
          </Container>
        </header>
      </Box>
      <Box asChild flexGrow="1">
        <main>{children}</main>
      </Box>
      {/* The legal pages must be reachable from the product, not just by URL —
          see docs/legal/2026-09-04-outside-counsel-review.md, headline item 1. */}
      <Box asChild className="border-t border-[var(--rule)]">
        <footer>
          <Container size="4" py="5">
            <Flex align="baseline" gap="5" justify="end">
              <Link
                href="/privacy"
                className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
              >
                Terms
              </Link>
            </Flex>
          </Container>
        </footer>
      </Box>
    </Flex>
  );
}
