import "@radix-ui/themes/styles.css";
import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { Theme } from "@radix-ui/themes";
import type { Metadata } from "next";
import { EB_Garamond, Noto_Sans, Noto_Sans_Mono } from "next/font/google";

import { Providers } from "./providers";

const notoSans = Noto_Sans({
  variable: "--font-noto-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const notoSansMono = Noto_Sans_Mono({
  variable: "--font-noto-sans-mono",
  subsets: ["latin"],
  display: "swap",
});

// Loaded at root so the tearsheet route can reference --font-eb-garamond.
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

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${notoSans.variable} ${notoSansMono.variable} ${ebGaramond.variable} h-full antialiased`}
        suppressHydrationWarning
      >
        <body className="min-h-full flex flex-col">
          <Theme accentColor="indigo" grayColor="mauve" radius="medium" scaling="100%">
            <Providers>{children}</Providers>
          </Theme>
        </body>
      </html>
    </ClerkProvider>
  );
}
