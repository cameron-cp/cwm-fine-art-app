import { UserButton } from "@clerk/nextjs";
import { Box, Container, Flex } from "@radix-ui/themes";
import Link from "next/link";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Flex direction="column" className="min-h-screen">
      <Box asChild className="border-b border-[var(--gray-a5)]">
        <header>
          <Container size="4" py="3">
            <Flex align="center" justify="between" gap="6">
              <Flex align="center" gap="6">
                <Flex gap="4" asChild>
                  <nav>
                    <Link href="/artists" className="text-[var(--gray-11)] hover:text-[var(--gray-12)]">
                      Artists
                    </Link>
                    <Link href="/artworks" className="text-[var(--gray-11)] hover:text-[var(--gray-12)]">
                      Artworks
                    </Link>
                    <Link href="/contacts" className="text-[var(--gray-11)] hover:text-[var(--gray-12)]">
                      Contacts
                    </Link>
                    <Link href="/invoices" className="text-[var(--gray-11)] hover:text-[var(--gray-12)]">
                      Invoices
                    </Link>
                    <Link href="/retainers" className="text-[var(--gray-11)] hover:text-[var(--gray-12)]">
                      Retainers
                    </Link>
                    <Link href="/settings" className="text-[var(--gray-11)] hover:text-[var(--gray-12)]">
                      Settings
                    </Link>
                    <Link href="/calculator" className="text-[var(--gray-11)] hover:text-[var(--gray-12)]">
                      Commission
                    </Link>
                    <Link href="/buyer-premium" className="text-[var(--gray-11)] hover:text-[var(--gray-12)]">
                      Auction BP
                    </Link>
                  </nav>
                </Flex>
              </Flex>
              <UserButton />
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
