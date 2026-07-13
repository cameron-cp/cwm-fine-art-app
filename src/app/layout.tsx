import "@radix-ui/themes/styles.css";
import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { Theme } from "@radix-ui/themes";
import type { Metadata } from "next";
import { EB_Garamond, Hanken_Grotesk, IBM_Plex_Mono } from "next/font/google";

import { Providers } from "./providers";

// Design system (docs/design/design-system.md): three voices.
// Hanken Grotesk — interface + dense data (the workhorse UI face).
const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// IBM Plex Mono — prices, dimensions, dates, IDs (tabular, catalogue-raisonné voice).
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

// EB Garamond — headings, artist names, work titles. The bridge to the tearsheet:
// loaded at root so the tearsheet/invoice render routes reference --font-eb-garamond too.
const ebGaramond = EB_Garamond({
  variable: "--font-eb-garamond",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Art Inventory",
  description: "Private art inventory + tearsheet generator",
};

// Strips Clerk's default sign-in/sign-up chrome — no "Welcome back" subtitle,
// no "Don't have an account? Sign up" footer. Pair with disabling sign-ups
// in the Clerk Dashboard (Restrictions → Sign-up mode → Restricted) so the
// sign-up route can't be hit even by URL.
const clerkLocalization = {
  signIn: {
    start: {
      title: "Sign in",
      subtitle: " ",
      actionText: " ",
      actionLink: " ",
    },
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider localization={clerkLocalization}>
      <html
        lang="en"
        className={`${hankenGrotesk.variable} ${plexMono.variable} ${ebGaramond.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          {/* Design system: bronze base + claret --accent-9/10 override (globals.css),
              warm sand gray, square corners. See docs/design/design-system.md. */}
          <Theme accentColor="bronze" grayColor="sand" radius="none" scaling="100%">
            <Providers>{children}</Providers>
          </Theme>
        </body>
      </html>
    </ClerkProvider>
  );
}
