import { GALLERY_NAME } from "@/lib/brand";
import { formatLegalDate, LEGAL_LAST_UPDATED } from "./last-updated";

/**
 * Masthead shared by /privacy and /terms. The date comes from the
 * LEGAL_LAST_UPDATED constant, never from the build — see last-updated.ts.
 */
export function LegalHeader({ title, standfirst }: { title: string; standfirst: string }) {
  return (
    <header className="lg-header">
      <div className="lg-eyebrow">{GALLERY_NAME}</div>
      <h1 className="lg-title">{title}</h1>
      <p className="lg-standfirst">{standfirst}</p>
      <p className="lg-updated">
        Last updated <span className="num">{formatLegalDate(LEGAL_LAST_UPDATED)}</span>
      </p>
    </header>
  );
}
