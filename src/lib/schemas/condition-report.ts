import { z } from "zod";

// Structured fields extracted from a fine-art condition report by the model.
// Everything is nullable/optional — condition reports are unstructured prose and
// no single field is guaranteed present. The model returns null when absent.

export const conditionRatings = [
  "excellent",
  "very_good",
  "good",
  "fair",
  "poor",
] as const;
export const conditionRating = z.enum(conditionRatings);
export type ConditionRating = z.infer<typeof conditionRating>;

// Defensive coercion: some model outputs use "" instead of null.
const nullableText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  z.string().trim().min(1).nullable(),
);

const nullableRating = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? null : v),
  conditionRating.nullable(),
);

// Drop empty/blank entries a model might emit rather than failing the whole
// extraction on a single "" element.
const stringList = z.preprocess(
  (v) =>
    Array.isArray(v)
      ? v.filter((s) => typeof s === "string" && s.trim() !== "")
      : v,
  z.array(z.string().trim().min(1)).default([]),
);

// Shape the Anthropic tool produces (validated before persisting to `parsed`).
export const conditionReportParseSchema = z.object({
  summary: nullableText,
  overall_condition: nullableRating,
  report_date: nullableText, // as written on the report, e.g. "March 3, 2024"
  examiner: nullableText, // conservator / author
  // Discrete condition observations, one finding per entry, in report order.
  findings: stringList,
  // Prior restorations / treatments noted in the report.
  treatments: stringList,
  recommendations: nullableText,
});

export type ConditionReportParse = z.infer<typeof conditionReportParseSchema>;

// JSON Schema for Anthropic's tool input_schema.
export const conditionReportToolInputSchema = {
  type: "object" as const,
  properties: {
    summary: {
      type: ["string", "null"],
      description:
        "One or two sentence overall condition statement in the report's own words. Null if none.",
    },
    overall_condition: {
      type: ["string", "null"],
      enum: [...conditionRatings, null],
      description:
        "Overall condition grade if the report states or clearly implies one. Map to the closest of: excellent, very_good, good, fair, poor. Null if the report gives no overall grade.",
    },
    report_date: {
      type: ["string", "null"],
      description:
        "Date the report was written, verbatim as printed (e.g. 'March 3, 2024'). Null if not stated.",
    },
    examiner: {
      type: ["string", "null"],
      description:
        "Name of the conservator, examiner, or firm that authored the report. Null if not stated.",
    },
    findings: {
      type: "array",
      items: { type: "string" },
      description:
        "Each discrete condition observation as its own string, in the order they appear (e.g. 'Minor craquelure in the upper-left quadrant', 'Two small losses along the bottom edge'). Empty array if none.",
    },
    treatments: {
      type: "array",
      items: { type: "string" },
      description:
        "Each prior restoration or conservation treatment noted, as its own string. Empty array if none.",
    },
    recommendations: {
      type: ["string", "null"],
      description:
        "Any recommended actions or handling notes, verbatim or lightly summarized. Null if none.",
    },
  },
  required: [
    "summary",
    "overall_condition",
    "report_date",
    "examiner",
    "findings",
    "treatments",
    "recommendations",
  ],
};

// DB row shape for condition_reports.
export type ConditionReport = {
  id: string;
  artwork_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  parse_status: "pending" | "parsed" | "failed";
  parse_error: string | null;
  parsed: ConditionReportParse | null;
  created_at: string;
  updated_at: string;
};

export const CONDITION_RATING_LABELS: Record<ConditionRating, string> = {
  excellent: "Excellent",
  very_good: "Very good",
  good: "Good",
  fair: "Fair",
  poor: "Poor",
};
