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
                <UserButton />
              </Flex>
              <AppNav />
            </Flex>
          </Container>
        </header>
      </Box>
      <Box asChild flexGrow="1">
        <main>{children}</main>
      </Box>
    </Flex>
  );
}
