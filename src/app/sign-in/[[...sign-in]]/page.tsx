import { SignIn } from "@clerk/nextjs";
import { Flex } from "@radix-ui/themes";
import Link from "next/link";

export default function Page() {
  return (
    <Flex align="center" justify="center" direction="column" gap="7" className="min-h-screen" p="6">
      <SignIn />
      {/* Google's OAuth consent screen links the privacy policy; the sign-in page
          should reach it too. See docs/legal/2026-09-04-outside-counsel-review.md. */}
      <Flex align="baseline" gap="5">
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
    </Flex>
  );
}
