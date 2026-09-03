import Link from "next/link";

import { GALLERY_NAME } from "@/lib/brand";
import "./legal.css";

// The legal pages are the only public, indexable surface the app has. They sit
// outside (app), so they render without the advisor's navigation and without a
// Clerk session — see the "/privacy" + "/terms(.*)" entries in src/middleware.ts.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="lg-shell">
      {children}

      <footer className="lg-footer">
        <span className="lg-footer-name">{GALLERY_NAME}</span>
        <Link className="lg-link" href="/privacy">
          Privacy
        </Link>
        <Link className="lg-link" href="/terms">
          Terms
        </Link>
        <a className="lg-link" href="mailto:chloe@chloewaddington.com">
          Contact
        </a>
      </footer>
    </main>
  );
}
