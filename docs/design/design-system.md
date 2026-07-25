# Interface Design System — v1

**Concept: the interface as exhibition wall.** A private tool should feel like the
back-of-house of the gallery whose collateral it produces. The screen recedes so the
artwork is the only saturated thing on it; typography does the work that decoration
usually pretends to. The app and the tearsheet share one voice.

Visual specimen (rendered, theme-aware): the published artifact "CWFA — Interface
Design System." Judge direction there; implement from here.

---

## The four moves

1. **Recede.** Near-monochrome UI. Chroma is rationed to ~1% of any screen — one
   primary action, one active tab — so the work carries the color.
2. **Set, don't style.** Hierarchy comes from type (serif vs. grotesque, size,
   letter-spacing, italic), not from boxes, shadows, and rounded pills.
3. **One voice, two rooms.** App and tearsheet share **EB Garamond**. What she edits
   on screen reads like what the collector receives on paper.
4. **Sharp & quiet.** Square corners, hairline rules, wide margins. Restraint is the
   luxury signal.

---

## Color — Plaster, Ink & Claret

A cool **plaster** ground (deliberately *not* the honeyed cream of every AI mock-up)
under a warm near-black. One accent — **claret** — appears only where a single
decision matters. Semantic status tones (sage/amber) never borrow the accent.

### Light

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#F3F2EE` | App ground — the gallery wall |
| `--paper-2` | `#ECEAE3` | Cards, table hover, frames |
| `--paper-3` | `#E4E1D8` | Deepest raised surface |
| `--ink` | `#1B1A17` | Primary text (warm, not pure black) |
| `--ink-2` | `#45423B` | Secondary text |
| `--ink-3` | `#6E6A60` | Labels, meta, muted |
| `--claret` | `#7A2E2E` | **Accent** — primary action & active state only |
| `--claret-hover` | `#6A2727` | Accent hover |
| `--on-claret` | `#FBF7F2` | Text on claret |
| `--sage` | `#5C6B5A` | Semantic: available / success |
| `--amber` | `#8A6A2A` | Semantic: on hold / warning |
| `--danger` | `#B42318` | Functional error red (alerts + validation only) — **not** the brand accent |
| `--rule` | `rgba(27,26,23,.14)` | Hairline division (no shadows) |
| `--rule-2` | `rgba(27,26,23,.30)` | Stronger rule / input border |

### Dark (gallery at night / archival)

| Token | Hex |
|---|---|
| `--paper` | `#1A1815` |
| `--paper-2` | `#221F1B` |
| `--paper-3` | `#2A2621` |
| `--ink` | `#ECE9E1` |
| `--ink-2` | `#BDB8AC` |
| `--ink-3` | `#8A867B` |
| `--claret` | `#B0574E` (brightened clay for contrast) |
| `--claret-hover` | `#C0655B` |
| `--on-claret` | `#1A1815` |
| `--sage` | `#93A38F` |
| `--amber` | `#C7A15A` |
| `--danger` | `#E5675E` |
| `--rule` | `rgba(236,233,225,.15)` |
| `--rule-2` | `rgba(236,233,225,.32)` |

> **Open decision — accent hue.** Claret `#7A2E2E` is the committed default. Her brand
> palette is still an open question (see CLAUDE.md). Alternatives that hold the same
> role: **bronze/ochre** `#7C5A2E`, **petrol** `#2E4A4A`. Whatever we pick, it stays a
> single restrained accent used at ~1% surface area.

---

## Typography — three voices

| Face | Load | Role |
|---|---|---|
| **EB Garamond** (serif) | already wired via `next/font/google` | Display, headings, artist names, work titles. The bridge to the tearsheet. |
| **Hanken Grotesk** (sans) | add via `next/font/google`; **replaces Noto Sans** | Interface, body, dense inventory data. Warm humanist grotesque — chosen deliberately over Inter/Noto/Space Grotesk. |
| **IBM Plex Mono** | add via `next/font/google`; replaces Noto Sans Mono | Prices, dimensions, dates, IDs. The catalogue-raisonné voice; tabular figures. |

Rules:
- Headings and object names → serif. Everything operational → grotesque. **Never** set a
  heading in the grotesque "to be safe."
- Numeric data (prices, dims, dates, editions, IDs) → mono with
  `font-variant-numeric: tabular-nums`.
- Uppercase labels get `letter-spacing: .14em`.
- Body text ~62ch max; headings `text-wrap: balance`.

Type scale (px): display `clamp(44,7vw,84)` · h2 `clamp(28,4vw,40)` · artist/name `22` ·
body `16` · label `11` (uppercase) · mono `14`.

---

## The signature — museum wall label

The one object treatment, rendered identically in the inventory list, the artwork
detail, and the printed tearsheet. It is what makes the tool read as a gallery instead
of a CRM. Anatomy, top to bottom:

```
Artist name        EB Garamond 600
Nationality, life  IBM Plex Mono, muted        (e.g. "American, b. Latvia, 1938")
Title, year        EB Garamond italic; year roman
Medium · dims · ed Hanken Grotesk, letterspaced UPPERCASE, muted
Price              IBM Plex Mono, tabular
Status             semantic dot + UPPERCASE word
```

Artwork imagery gets a **passe-partout mount** (a mat inside a hairline frame), never a
drop shadow — depth from a mat and a rule.

---

## Primitives

- **Buttons** — square (radius 0), grotesque 600, `.02em` tracking. `primary` = solid
  claret, **one per view** (the tearsheet button is the canonical primary). Everything
  else `outline` (hairline border) or `ghost`. Focus ring = 2px claret, 2px offset.
- **Inputs** — square, `--paper` fill, `--rule-2` border; focus → claret border + 1px
  claret ring. Uppercase letterspaced label above.
- **Status tags** — a dot + an uppercase word (sage/amber/ink-muted). **No filled candy
  pills** — those read as software.
- **Meta tags** — hairline outline box, `10px` uppercase, `.12em` tracking, `--ink-2`, on
  `--rule-2`. For a record's own vocabulary (a contact's roles, an artwork-party role, an
  interest dimension), not its state — status keeps the dot idiom above. Never filled,
  never the accent.
  A **dashed** border + `--ink-3` is the one variant: it marks a value the dealer knows is
  provisional or standing in for something she can't supply yet (an unidentified holder).
  Dashed reads as "outline not yet inked" — the same reason nothing else on the wall is
  dashed. Don't spend it on ordinary emphasis.
- **Tables (the "ledger")** — hairline row rules, uppercase letterspaced headers, serif
  artist + italic title in the first cell, right-aligned tabular mono for price/year.
  Row hover → `--paper-2`. Wrap in `overflow-x:auto`.
- **Cards / frames** — hairline borders and the raised paper surface. No shadows.

---

## Alerts & feedback

Transient banners (success confirmations, info prompts, warnings, errors) use the one
shared **`<Alert tone>`** primitive (`src/components/alert.tsx`) — never raw Radix
`Callout` with a `color` prop, which reintroduces off-palette hue.

| tone | token | glyph | use |
|---|---|---|---|
| `info` | `--ink-3` (neutral) | i | neutral prompts / guidance |
| `success` | `--sage` | ✓ | "saved", completed actions |
| `warning` | `--amber` | ! | recoverable issues, mismatches, expiry |
| `error` | `--danger` | ✕ | failures, blocked actions |

Quiet by design: a 2px tone-colored left rule + glyph on a `--paper-2` surface, hairline
border — never a saturated fill. `--danger` is a **functional** red for errors +
validation only; it is deliberately distinct from the claret brand accent and is never
used for status, emphasis, or decoration. Inline validation errors may also use
`--danger` (or Radix `color="red"`), but there is no green/blue/orange anywhere.

---

## Overlays — the vitrine

An overlay is a **vitrine**: a second plaster panel set on the same wall so she can
finish a small piece of work without leaving the piece of work she's in. Use one only
when leaving the current surface would destroy in-progress input (the inline
create-artist path inside the artwork form is the canonical case). Anything that can be
a page should stay a page.

- Radix `Dialog` (`Dialog.Root` / `Trigger` / `Content`). Never `AlertDialog` for
  creation flows — that primitive is for destructive confirmations.
- The panel is `--paper` on a dimmed ground, square (radius 0 comes from the Theme), with
  a `--rule` hairline border. **No shadow** — the hairline and the dim do the separating.
- Title is serif (Radix `Dialog.Title` inherits `--heading-font-family`); an optional
  `Dialog.Description` is one quiet grotesque line in `--ink-3`.
- The overlay is its own surface for the one-primary-action rule: the panel's Save is a
  solid claret button, and while it is open the underlying view's primary reads as
  secondary. The trigger that opens the panel is therefore `outline`, never solid.
- Long forms scroll **inside** the panel (`maxHeight: 85vh; overflow-y: auto`); the page
  behind never scrolls with it.
- Dismissal always leaves the host form exactly as it was — an overlay must never
  navigate, remount, or discard the surface that opened it.

---

## Conversation — the Registrar chat

The chat view (`/chat`, docs/chat-agent.md) is a **transcript, not a messenger**: no
bubbles, no avatars, no left/right alignment games. It reads like a ledger of exchanges
on the plaster ground.

- Each turn is a full-width entry separated by a `--rule` hairline; the speaker is a
  letterspaced uppercase micro-cap label (`You` / `Registrar`) in `--ink-3`.
- Answers are plain grotesque body text. Artist/title mentions stay inline prose —
  the wall-label treatment belongs to the cited records, not the chat text.
- **Citations**: beneath an answer, a `Records` micro-cap label followed by underlined
  links to the artworks / contacts / artists consulted. The trail is the trust surface —
  never suppress it.
- **Writes**: a recorded interest confirms as a sage dot + uppercase `Recorded` + a plain
  restatement — the StatusTag idiom, not a toast, not a candy pill.
- The Send/Ask button is the view's single claret action. The waiting state is a serif
  italic line ("Consulting the records…"), not a spinner.

---

## Implementation — Radix Themes mapping

The app is already on Radix Themes. This is **three swaps plus a token layer**, not a
rewrite. Move off `indigo / mauve / medium`.

```tsx
// src/app/layout.tsx
<Theme
  accentColor="bronze"   // claret applied via --accent-9/10 override; bronze is the nearest built-in base
  grayColor="sand"       // warm stone — replaces cool mauve
  radius="none"          // was "medium" — square the corners
  scaling="100%"
>
```

```css
/* globals.css — token layer over Radix */
:root, .radix-themes {
  --default-font-family: "Hanken Grotesk", ui-sans-serif, system-ui, sans-serif;
  --heading-font-family: "EB Garamond", Georgia, serif;   /* NEW — headings go serif */
  --code-font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  --accent-9: #7A2E2E;  --accent-10: #6A2727;             /* claret over bronze */
}
/* prices/dims: .num { font-family: var(--code-font-family); font-variant-numeric: tabular-nums } */
```

Fonts: EB Garamond is already loaded in `layout.tsx`. Add Hanken Grotesk + IBM Plex
Mono via `next/font/google` the same way; **drop Noto Sans / Noto Sans Mono**.

The tearsheet route (`src/app/tearsheet/render/[id]/tearsheet.css`) already lives in its
own EB Garamond world — leave it; the app UI is now converging *toward* it, which is the
point.

---

## Motion

Restrained. One orchestrated page-load reveal (staggered fade + 14px rise) per view;
subtle hover state changes on rows and buttons. No bounce, no scattered micro-anims —
extra motion reads as AI-generated. Respect `prefers-reduced-motion`.

---

## Guardrails — how not to drift back to generic

**Do:** let images be the only saturated thing · serif for names/titles, grotesque for
operations · tabular mono for numbers · divide with hairlines + whitespace · claret for
the single primary action · letterspace uppercase labels.

**Don't:** indigo / purple gradients / drop shadows · rounded-everything or pill buttons
· bright candy status badges · two accents on one screen · headings in the grotesque ·
center everything (asymmetry + wide margins carry it).
