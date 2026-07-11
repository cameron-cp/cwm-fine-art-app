import Anthropic from "@anthropic-ai/sdk";

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

const MODEL = "claude-opus-4-8";
const MAX_BIO_CHARS = 1200;

// Frozen so it hits the Anthropic prompt cache across generations. Edits
// invalidate the cache for the next 5 minutes.
const SYSTEM_PROMPT = `You write concise biographical notes for the private preview materials of a fine-art gallery. The note appears beneath an artist's name on a collector-facing sheet, so it must read like a measured, factual gallery or auction-house biography. Third person.

Hard rules:
- Length: 2 to 4 sentences, roughly 60 to 120 words. Never exceed one short paragraph.
- Never invent facts. Do NOT state specific exhibitions, museum or collection names, awards, gallery representation, auction results, birthplaces, or precise dates unless they are widely established and you are confident they are correct for THIS specific artist. When unsure, stay general (medium, themes, movement, period) rather than fabricate a specific.
- Use only knowledge consistent with the supplied facts (life years, nationality, and the listed works). Those facts identify which artist this is; do not drift to a different person who happens to share the name. If you do not have reliable knowledge of this specific artist, write only from the supplied facts and general art-historical framing — do not guess.
- No marketing language ("masterpiece", "visionary", "genius", "renowned", "celebrated"), no superlatives, no sales pitch.
- Avoid the tells of AI-generated prose. Specifically: no formulaic summary closer ("stands as a testament to", "cements their place", "sits within a tradition of", "continues to resonate", "invites the viewer to"); do NOT end with a sentence that restates the artist's significance in the abstract. No "not only... but also" or "not X, but Y" constructions. Avoid rule-of-three lists ("love, loss, and mortality"). Do not lean on em-dashes for rhythm. Vary sentence length; write the way a knowledgeable curator writes a wall label, not the way a model pads an essay. When you have little to say, write less — a true two-sentence note beats a padded four-sentence one.
- Output ONLY the biographical note itself: plain prose, no headings, no markdown, no lists, no quotation marks around it, and no preamble such as "Here is a bio".`;

export class BioGenerationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "BioGenerationError";
  }
}

export type BioFacts = {
  name: string;
  // Pre-formatted life line, e.g. "American, 1928–1987" or "b. 1955". May be "".
  byline: string;
  // The artist's works already in inventory, for grounding. May be empty.
  works: { title: string; year: number | null; medium: string | null }[];
};

// Trim to the last sentence boundary within the character cap, so a hard cut
// never leaves a dangling half-sentence.
function clampToSentence(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  const slice = trimmed.slice(0, max);
  const lastStop = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  return (lastStop > max * 0.5 ? slice.slice(0, lastStop + 1) : slice).trim();
}

export async function generateArtistBio(facts: BioFacts, apiKey: string): Promise<string> {
  const client = new Anthropic({ apiKey });

  const worksLines = facts.works
    .map((w) => `- ${w.title}${w.year ? `, ${w.year}` : ""}${w.medium ? ` — ${w.medium}` : ""}`)
    .join("\n");

  const userText = [
    "Write a biographical note for this artist.",
    "",
    `Name: ${facts.name}`,
    facts.byline ? `Life: ${facts.byline}` : null,
    worksLines ? `Works in inventory (context on their practice):\n${worksLines}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userText }],
    });
  } catch (e) {
    throw new BioGenerationError(
      e instanceof Error ? `Bio generation failed: ${e.message}` : "Bio generation failed",
      e,
    );
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  if (!text) throw new BioGenerationError("The model returned an empty bio.");

  return clampToSentence(text, MAX_BIO_CHARS);
}
