import "./museum-wall-label.css";

// The museum wall label — the design system's one binding "signature" element,
// rendered identically wherever a work is presented. THIS component is the PRINT
// voice (tearsheet render + viewing-room PDF leave-behind), extracted from the
// tearsheet page so the room PDF reuses it instead of adding a third copy. The
// print routes are their own typographic world (serif body), so this renders the
// tearsheet's plain-serif label — NOT the web uppercase treatment. The on-screen
// room page has its own on-brand web label (docs/design/design-system.md).
//
// Presentational only: callers pass already-formatted strings (byline via
// formatNationalities + life years, dims via formatDimensions, price via
// formatPriceCents). price/status are optional — the tearsheet omits both, so
// passing nothing reproduces its exact prior output.

export type WallLabelStatus = {
  label: string;
  tone: "positive" | "warning" | "muted";
};

const STATUS_COLOR: Record<WallLabelStatus["tone"], string> = {
  positive: "var(--sage)",
  warning: "var(--amber)",
  muted: "var(--ink-3)",
};

export function MuseumWallLabel({
  artistName,
  byline,
  title,
  year,
  medium,
  signatureDetails,
  dimensions,
  catalogueRaisonne,
  price,
  status,
}: {
  artistName: string;
  byline?: string | null;
  title: string;
  year?: number | null;
  medium?: string | null;
  signatureDetails?: string | null;
  dimensions?: string | null;
  catalogueRaisonne?: string | null;
  price?: string | null;
  status?: WallLabelStatus | null;
}) {
  return (
    <div className="mwl">
      <div className="mwl-artist">{artistName}</div>
      {byline && <div className="mwl-byline">{byline}</div>}
      <div className="mwl-title">
        <em>{title}</em>
        {year ? <>, {year}</> : null}
      </div>
      {medium && <div className="mwl-line">{medium}</div>}
      {signatureDetails && <div className="mwl-line">{signatureDetails}</div>}
      {dimensions && <div className="mwl-line">{dimensions}</div>}
      {catalogueRaisonne && <p className="mwl-cr">{catalogueRaisonne}</p>}
      {price && <div className="mwl-price num">{price}</div>}
      {status && (
        <div className="mwl-status" style={{ color: STATUS_COLOR[status.tone] }}>
          <span className="mwl-status-dot" style={{ background: STATUS_COLOR[status.tone] }} />
          {status.label}
        </div>
      )}
    </div>
  );
}
