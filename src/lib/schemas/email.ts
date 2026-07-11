import { z } from "zod";

// Payload for the transactional email rails (src/lib/email). Kept channel-
// agnostic: it does not know about tearsheets or invoices — callers build the
// subject/body/attachments and hand them over. Attachments carry raw bytes or a
// base64 string so a PDF (from Browserless) can be sent without a public URL.

// Accepts a bare "addr@domain" or the display form "Name <addr@domain>".
// Resend accepts both; we validate the embedded address either way.
const recipient = z.string().transform((v) => v.trim()).pipe(
  z.union([
    z.email(),
    z.string().regex(
      /^[^<>]+<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>$/,
      "Must be an email address or \"Name <email>\".",
    ),
  ]),
);

// One or many recipients; a single string is normalized to a one-element array.
const recipients = z
  .union([recipient, z.array(recipient).min(1)])
  .transform((v) => (Array.isArray(v) ? v : [v]));

export const emailAttachmentSchema = z.object({
  filename: z.string().min(1),
  // Buffer is a Uint8Array subclass, so this covers both; base64 string also ok.
  content: z.union([z.instanceof(Uint8Array), z.string().min(1)]),
  contentType: z.string().min(1).optional(),
});
export type EmailAttachment = z.infer<typeof emailAttachmentSchema>;

export const sendEmailInputSchema = z
  .object({
    to: recipients,
    subject: z.string().trim().min(1, "Subject is required."),
    html: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    cc: recipients.optional(),
    bcc: recipients.optional(),
    // Overrides the EMAIL_REPLY_TO default for this one send.
    replyTo: recipient.optional(),
    attachments: z.array(emailAttachmentSchema).optional(),
  })
  .refine((v) => Boolean(v.html || v.text), {
    message: "Provide html or text (or both).",
    path: ["html"],
  });

export type SendEmailInput = z.input<typeof sendEmailInputSchema>;
export type SendEmailParsed = z.infer<typeof sendEmailInputSchema>;
