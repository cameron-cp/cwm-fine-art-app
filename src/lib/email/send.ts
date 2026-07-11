import { getServerEnv } from "@/lib/env";
import {
  sendEmailInputSchema,
  type SendEmailInput,
} from "@/lib/schemas/email";
import { getResendClient } from "./client";

type SendResult = { data: { id: string } } | { error: string };

// The single send seam for the whole app. Validates with Zod, applies the
// EMAIL_FROM / EMAIL_REPLY_TO defaults, and always resolves to the app's
// { data } | { error } shape — it never throws for an expected failure
// (missing config, bad input, Resend rejection), so callers branch, not catch.
export async function sendEmail(input: SendEmailInput): Promise<SendResult> {
  const parsed = sendEmailInputSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid email payload." };
  }

  const resend = getResendClient();
  if (!resend) return { error: "RESEND_API_KEY is not configured." };

  const { EMAIL_FROM, EMAIL_REPLY_TO } = getServerEnv();
  if (!EMAIL_FROM) return { error: "EMAIL_FROM is not configured." };

  const { to, subject, html, text, cc, bcc, replyTo, attachments } = parsed.data;
  const resolvedReplyTo = replyTo ?? EMAIL_REPLY_TO;

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject,
      // Resend requires html or text; the schema guarantees at least one.
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(cc ? { cc } : {}),
      ...(bcc ? { bcc } : {}),
      ...(resolvedReplyTo ? { replyTo: resolvedReplyTo } : {}),
      ...(attachments
        ? {
            attachments: attachments.map((a) => ({
              filename: a.filename,
              content:
                typeof a.content === "string"
                  ? a.content
                  : Buffer.from(a.content),
              ...(a.contentType ? { contentType: a.contentType } : {}),
            })),
          }
        : {}),
      // Cast: CreateEmailOptions is a union that requires one of html/text at
      // the type level; our Zod refine guarantees it at runtime but TS can't
      // narrow across the conditional spreads. Field names (to, replyTo, cc,
      // bcc, attachments) verified against resend's types.
    } as Parameters<typeof resend.emails.send>[0]);

    if (error) return { error: error.message };
    if (!data?.id) return { error: "Resend returned no message id." };
    return { data: { id: data.id } };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to send email.",
    };
  }
}
