import Anthropic from "@anthropic-ai/sdk";
import { resolveFeatureModel } from "@/lib/ai/models";
import {
  importDraftToolInputSchema,
  modelOutputSchema,
  type ModelOutput,
} from "@/lib/schemas/import-draft";

// System prompt is frozen so it hits the Anthropic prompt cache on repeat
// imports. Edits will invalidate the cache for the next 5 minutes.
const SYSTEM_PROMPT = `You parse fine-art gallery factsheets (also called "preview sheets" or "tearsheets") and extract the structured artwork data into a tool call.

A factsheet typically follows this layout:
- Gallery name at the top (ignore — it's brand chrome, not artwork data).
- A photographic image of the artwork.
- Artist name (in bold).
- The artwork's title in italic, then a comma, then the year. Example: "Migration, 1978".
- Medium on its own line. Example: "Oil on canvas".
- Optional signature/inscription line. Example: 'Inscribed on the reverse: "PHILIP GUSTON / MIGRATION"'.
- Dimensions: inches first, then centimeters in parentheses. Example: "48 x 60 in. (121.9 x 152.4 cm)" or "12 x 8 x 4 in. (30.5 x 20.3 x 10.2 cm)" for sculpture.
- Optional catalogue raisonné sentence. Example: "This work is registered in the Philip Guston Catalogue Raisonné (# P78.047)."
- A "Provenance" section with one previous owner or auction reference per line, in chronological order.
- A "Literature" section with citations as free-form paragraphs.

Rules:
- Return null for any field NOT clearly stated on the factsheet. Never invent data.
- Always extract dimensions in inches as decimals. If only cm is given, convert (cm ÷ 2.54). For paintings and works on paper, depth_in must be null.
- Each provenance entry on the factsheet becomes one string in the provenance_lines array. Preserve order.
- Strip the running header/footer of the gallery name from any extracted text.
- For literature, preserve each citation as its own paragraph. Separate paragraphs with double newlines (\\n\\n).
- For year, return the integer (e.g. 1978), not a string.
- Do not include the comma+year in the title field. Title is just the work title.

Always call the submit_artwork tool exactly once with your extraction.`;

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

export async function extractArtworkFromPdf(
  pdf: ArrayBuffer,
  apiKey: string,
): Promise<ModelOutput> {
  const client = new Anthropic({ apiKey });
  const { model } = resolveFeatureModel("import");
  const base64 = Buffer.from(pdf).toString("base64");

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "submit_artwork",
        description:
          "Submit the extracted artwork fields. Call this exactly once with all fields populated (use null for absent fields).",
        input_schema: importDraftToolInputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "submit_artwork" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: base64,
            },
          },
          {
            type: "text",
            text: "Extract this tearsheet. Return null for any field not clearly stated.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use" || toolUse.name !== "submit_artwork") {
    throw new ExtractionError("Model did not call the submit_artwork tool");
  }

  const parsed = modelOutputSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    console.error("[import] model output failed validation", {
      issues: parsed.error.issues,
      raw: toolUse.input,
    });
    throw new ExtractionError(
      "Couldn't parse the tearsheet — the file may not be a factsheet, or fields were unreadable.",
      parsed.error,
    );
  }

  return parsed.data;
}
