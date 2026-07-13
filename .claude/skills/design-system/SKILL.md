---
name: design-system
description: >
  Enforce the art-app visual design system on ALL UI work. Load this BEFORE
  building or editing any user-facing screen, page, component, form, table,
  layout, empty state, modal, or styling in this repo — anything touching
  src/app/(app), .tsx UI, Radix Themes components, Tailwind classes, or CSS.
  Triggers: "build/add/edit a page or component", "new screen/form/view",
  "style this", "make a card/table/button/badge", "lay out", "the UI", any
  Radix `<Theme>`/`<Button>`/`<Card>`/`<Table>` work, or any change to
  globals.css / layout.tsx / a *.tsx that renders markup. Do NOT use for the
  print render routes (tearsheet.css / invoice.css — those are their own
  typographic world), pure data/schema/API/RPC work with no markup, or docs.
---

# art-app design system — enforcement

This app has a **binding, permanent visual contract**: _the interface as
exhibition wall_. The UI recedes so the artwork is the only saturated thing on
screen; type does the work; the app and the tearsheet share one voice.

**The full spec is [`docs/design/design-system.md`](../../../docs/design/design-system.md). Read it before writing UI.** This skill is the operational guardrail — the doc is the source of truth. If a case isn't covered, extend the doc; never invent an off-system look.

## Before you write any UI

1. Open `docs/design/design-system.md` and skim the section you're touching
   (color / type / primitives / the wall label).
2. Reuse the tokens and patterns already in `globals.css` and existing on-system
   components. Do not hardcode hexes — use the CSS variables.
3. Match the existing file's idiom (Radix Themes primitives + Tailwind utility layer).

## Non-negotiables (fast reference)

**Color** — tokens live in `globals.css`; both themes defined.
- Ground `var(--paper)` / `--paper-2` / `--paper-3`; text `var(--ink)` / `--ink-2` / `--ink-3`.
- Accent **claret** `var(--claret)` — the ONE primary action / active state per view (~1% of the screen). It's already wired to Radix `--accent-9/10`, so `<Button>` (solid) is claret automatically. Don't add a second accent.
- Status = `var(--sage)` (available) / `var(--amber)` (on hold) / `--ink-3` (sold). Semantic only — never the accent.
- **No** indigo, purple gradients, or drop shadows. Divide with `var(--rule)` hairlines + whitespace.

**Type** — three voices, already loaded.
- Headings / artist names / work titles → **EB Garamond** (Radix `<Heading>` is already serif via `--heading-font-family`; for raw markup use `font-serif` / `var(--font-eb-garamond)`). Headings are ALWAYS serif.
- Interface / body / dense data → **Hanken Grotesk** (default).
- Prices / dimensions / dates / editions / IDs → **IBM Plex Mono**, tabular. Use the `.num` class (sets the mono face + `tabular-nums`).
- Uppercase labels get `letter-spacing: .14em`.

**Primitives**
- Square corners (Theme `radius="none"`). Do NOT add `rounded-*` to new elements.
- Buttons: solid claret = the single primary action; everything else `variant="outline"` or `variant="ghost"`.
- Status: a dot + uppercase word — never bright candy pills.
- Cards / frames: hairline borders + raised paper surface, no shadows. Artwork imagery gets a passe-partout mount (mat inside a hairline frame), not a shadow.
- Alerts / callouts: use the shared `<Alert tone="info|success|warning|error">` (`@/components/alert`) — NEVER raw Radix `Callout` with a `color` prop. Tones map to sage/amber/ink + functional `--danger` red; no green/blue/orange.

**The signature — museum wall label** (list, detail, and tearsheet, identical):
```
Artist name        EB Garamond 600
Nationality, life  mono, muted
Title, year        EB Garamond italic (year roman)
Medium · dims · ed grotesque, letterspaced UPPERCASE, muted
Price              mono, tabular (.num)
Status             semantic dot + UPPERCASE word
```

**Motion** — one restrained page-load reveal per view; respect
`prefers-reduced-motion`. No scattered micro-animations.

## Self-check before you finish (catch drift before it ships)

Reject your own diff if any is true:
- [ ] A hardcoded hex where a token exists, or a color off the palette.
- [ ] A second accent color on the same screen, or claret on a non-primary control.
- [ ] A heading set in the grotesque instead of the serif.
- [ ] Numbers (price/dims/dates) not in tabular mono / missing `.num`.
- [ ] `rounded-*`, a drop shadow, or a candy-pill badge on a new element.
- [ ] A raw Radix `Callout color=...` instead of `<Alert tone=...>`.
- [ ] Status color borrowing the accent instead of sage/amber.
- [ ] Centered-everything layout instead of asymmetry + wide margins.

If the design calls for something not covered here, **update
`docs/design/design-system.md` first**, then build to it — so the system stays
the single source of truth and we never unwind decisions later.
