import Anthropic from "@anthropic-ai/sdk";
import { resolveFeatureModel } from "@/lib/ai/models";
import {
  conditionReportParseSchema,
  conditionReportToolInputSchema,
  type ConditionReportParse,
} from "@/lib/schemas/condition-report";

// Frozen system prompt so it hits the Anthropic prompt cache across reports.
const SYSTEM_PROMPT = `You read fine-art condition reports and extract their key facts into a tool call.

A condition report is a document (or scanned image) written by a conservator or examiner describing the physical state of an artwork. It typically covers: an overall condition statement, the support and medium, the surface, the frame, any losses/tears/craquelure/discoloration, prior restorations or treatments, and sometimes recommendations.

Rules:
- Return null (or an empty array) for anything NOT clearly stated in the document. Never invent findings.
- Break the observations into discrete entries: one physical observation per string in "findings", in the order they appear.
- Put prior restorations/treatments in "treatments", not "findings".
- For overall_condition, only pick a grade if the report states or clearly implies one; otherwise null.
- Preserve the examiner/conservator name and the report date exactly as written.

Always call the submit_condition_report tool exactly once.`;

const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export class ConditionParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ConditionParseError";
  }
}

// Build the content block for the uploaded file based on its mime type.
function fileBlock(
  bytes: ArrayBuffer,
  mimeType: string,
): Anthropic.Messages.ContentBlockParam {
  const data = Buffer.from(bytes).toString("base64");
  if (mimeType === "application/pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }
  if (SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
        data,
      },
    };
  }
  throw new ConditionParseError(
    `Unsupported file type for parsing: ${mimeType}. Upload a PDF or an image.`,
  );
}

export async function extractConditionReport(
  bytes: ArrayBuffer,
  mimeType: string,
  apiKey: string,
): Promise<ConditionReportParse> {
  const client = new Anthropic({ apiKey });
  const { model } = resolveFeatureModel("condition");

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
        name: "submit_condition_report",
        description:
          "Submit the extracted condition-report fields. Call exactly once; use null / empty arrays for anything absent.",
        input_schema: conditionReportToolInputSchema,
      },
    ],
    tool_choice: { type: "tool", name: "submit_condition_report" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock(bytes, mimeType),
          {
            type: "text",
            text: "Extract this condition report. Return null / empty arrays for anything not clearly stated.",
          },
        ],
      },
    ],
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (
    !toolUse ||
    toolUse.type !== "tool_use" ||
    toolUse.name !== "submit_condition_report"
  ) {
    throw new ConditionParseError(
      "Model did not call the submit_condition_report tool",
    );
  }

  const parsed = conditionReportParseSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    console.error("[condition] model output failed validation", {
      issues: parsed.error.issues,
      raw: toolUse.input,
    });
    throw new ConditionParseError(
      "Couldn't parse the condition report — the file may be unreadable.",
      parsed.error,
    );
  }

  return parsed.data;
}
