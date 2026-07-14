import Anthropic from "@anthropic-ai/sdk";
import { resolveFeatureModel } from "@/lib/ai/models";

// Content + character scoping for AI-drafted artist bios.
//
// The risk with LLM-generated artist bios is fabricated specifics (invented
// exhibitions, museum collections, awards, birthplaces) going out under the
// gallery's name. Scoping is enforced on three axes:
//   1. Content — the frozen system prompt forbids inventing specifics and grounds
//      the model in the supplied facts + the artist's actual inventory.
//   2. Character — a modest max_tokens plus a hard MAX_BIO_CHARS trim.
//   3. Human — the draft lands in the editable Bio field; nothing is saved until
//      the dealer reviews and hits Save.
//
// The same call also fact-checks the nationality and life dates the dealer typed
// into the form (returned as findings, never mutating the form) — the model knows
// whether "Spanish, 1881–1973" is right for Picasso, and this is judgment under
// ambiguity, so it's the model's job, not deterministic code's.

const MAX_BIO_CHARS = 1200;

// Frozen so it hits the Anthropic prompt cache across generations. Edits
// invalidate the cache for the next 5 minutes.
const SYSTEM_PROMPT = `You write concise biographical notes for the private preview materials of a fine-art gallery. The note appears beneath an artist's name on a collector-facing sheet, so it must read like a measured, factual gallery or auction-house biography. Third person.

The artist's nationality and life dates are printed SEPARATELY, on the byline directly above this note. They are not part of your job to restate.

Hard rules for the note:
- Length: 2 to 4 sentences, roughly 60 to 120 words. Never exceed one short paragraph.
- Do NOT restate the nationality or the life dates. No opening parenthetical like "(Spanish, 1881–1973)", no "Born in 1881...", no "The Spanish painter...", no "d. 1973". The byline already carries those. Open with the practice, the work, or the movement — not a biographical data line. You may name a nationality, place, or period only where it does real analytical work (explaining an influence or context), never as bare scene-setting.
- Never invent facts. Do NOT state specific exhibitions, museum or collection names, awards, gallery representation, auction results, or birthplaces unless they are widely established and you are confident they are correct for THIS specific artist. When unsure, stay general (medium, themes, movement, period) rather than fabricate a specific.
- Use only knowledge consistent with the supplied facts (life years, nationality, and the listed works). Those facts identify which artist this is; do not drift to a different person who happens to share the name. If you do not have reliable knowledge of this specific artist, write only from general art-historical framing and the listed works — do not guess.
- No marketing language ("masterpiece", "visionary", "genius", "renowned", "celebrated"), no superlatives, no sales pitch.
- Avoid the tells of AI-generated prose. Specifically: no formulaic summary closer ("stands as a testament to", "cements their place", "sits within a tradition of", "continues to resonate", "invites the viewer to"); do NOT end with a sentence that restates the artist's significance in the abstract. No "not only... but also" or "not X, but Y" constructions. Avoid rule-of-three lists ("love, loss, and mortality"). Do not lean on em-dashes for rhythm. Vary sentence length; write the way a knowledgeable curator writes a wall label, not the way a model pads an essay. When you have little to say, write less — a true two-sentence note beats a padded four-sentence one.
- The note is plain prose: no headings, no markdown, no lists, no surrounding quotation marks, no preamble such as "Here is a bio".

Fact-check (separate from the note):
- For each supplied fact (nationality, life dates), judge it against your reliable knowledge of THIS specific artist and return a verdict.
- "confirmed": the supplied value matches what you reliably know for this artist.
- "contradicted": you are confident the supplied value is wrong (e.g. wrong nationality, wrong birth or death year). Say what you believe the correct value is.
- "unverified": you do not have reliable, specific knowledge of this artist, so you can neither confirm nor deny. Use this instead of guessing. Do NOT mark something contradicted on a hunch.
- Keep each note to one short sentence, and empty for "confirmed" unless a caveat genuinely helps (e.g. a commonly cited alternative date).

Return everything through the submit_artist_bio tool.`;

// The tool the model must answer through, so the bio and the fact-check come back
// as structured fields rather than parsed out of prose. Defined at module scope so
// it stays byte-stable alongside the cached system prompt.
const BIO_TOOL: Anthropic.Messages.Tool = {
  name: "submit_artist_bio",
  description: "Return the biographical note and the verdicts on the supplied nationality and life dates.",
  input_schema: {
    type: "object",
    properties: {
      bio: {
        type: "string",
        description: "The biographical note. Plain prose, 2–4 sentences, no restatement of nationality or dates.",
      },
      nationality: {
        type: "object",
        description: "Verdict on the supplied nationality. Omit entirely if no nationality was supplied.",
        properties: {
          verdict: { type: "string", enum: ["confirmed", "unverified", "contradicted"] },
          note: { type: "string", description: "One short sentence; the correct value if contradicted. May be empty." },
        },
        required: ["verdict", "note"],
      },
      dates: {
        type: "object",
        description: "Verdict on the supplied life dates. Omit entirely if no dates were supplied.",
        properties: {
          verdict: { type: "string", enum: ["confirmed", "unverified", "contradicted"] },
          note: { type: "string", description: "One short sentence; the correct value if contradicted. May be empty." },
        },
        required: ["verdict", "note"],
      },
    },
    required: ["bio"],
  },
};

export class BioGenerationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BioGenerationError";
  }
}

export type FactVerdict = "confirmed" | "unverified" | "contradicted";
export type FactFinding = { verdict: FactVerdict; note: string };

export type BioFacts = {
  name: string;
  // Demonym byline, e.g. "Cuban-American". "" when the dealer left it blank.
  nationalityLabel: string;
  // Life-dates label, e.g. "1881–1973" or "b. 1955". "" when blank.
  lifeLabel: string;
  // The artist's works already in inventory, for grounding. May be empty.
  works: { title: string; year: number | null; medium: string | null }[];
};

export type BioResult = {
  bio: string;
  // A finding is present only for a fact the dealer actually supplied.
  nationality: FactFinding | null;
  dates: FactFinding | null;
};

const VERDICTS: FactVerdict[] = ["confirmed", "unverified", "contradicted"];

// Coerce a tool-returned finding into our shape, dropping anything malformed.
function toFinding(raw: unknown): FactFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const { verdict, note } = raw as { verdict?: unknown; note?: unknown };
  if (typeof verdict !== "string" || !VERDICTS.includes(verdict as FactVerdict)) return null;
  return { verdict: verdict as FactVerdict, note: typeof note === "string" ? note.trim() : "" };
}

// Trim to the last sentence boundary within the character cap, so a hard cut
// never leaves a dangling half-sentence.
function clampToSentence(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  return (lastStop > max * 0.5 ? slice.slice(0, lastStop + 1) : slice).trim();
}

export async function generateArtistBio(facts: BioFacts, apiKey: string): Promise<BioResult> {
  const client = new Anthropic({ apiKey });
  const { model } = resolveFeatureModel("bio");

  const worksLines = facts.works
    .map((w) => `- ${w.title}${w.year ? `, ${w.year}` : ""}${w.medium ? ` — ${w.medium}` : ""}`)
    .join("\n");

  const userText = [
    "Write a biographical note for this artist and fact-check the supplied facts.",
    "",
    `Name: ${facts.name}`,
    facts.nationalityLabel ? `Nationality (supplied): ${facts.nationalityLabel}` : "Nationality: (not supplied)",
    facts.lifeLabel ? `Life dates (supplied): ${facts.lifeLabel}` : "Life dates: (not supplied)",
    worksLines ? `Works in inventory (context on their practice):\n${worksLines}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [BIO_TOOL],
      tool_choice: { type: "tool", name: BIO_TOOL.name },
      messages: [{ role: "user", content: userText }],
    });
  } catch (e) {
    throw new BioGenerationError(
      e instanceof Error ? `Bio generation failed: ${e.message}` : "Bio generation failed",
      e,
    );
  }

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === BIO_TOOL.name,
  );
  if (!toolUse) throw new BioGenerationError("The model did not return a bio.");

  const out = toolUse.input as { bio?: unknown; nationality?: unknown; dates?: unknown };
  const bio = typeof out.bio === "string" ? out.bio.trim() : "";
  if (!bio) throw new BioGenerationError("The model returned an empty bio.");

  // Only report a finding for a fact the dealer actually supplied — a verdict on a
  // blank field is meaningless.
  return {
    bio: clampToSentence(bio, MAX_BIO_CHARS),
    nationality: facts.nationalityLabel ? toFinding(out.nationality) : null,
    dates: facts.lifeLabel ? toFinding(out.dates) : null,
  };
}
