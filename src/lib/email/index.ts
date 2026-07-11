// Transactional email rails. Import from here.
//
// Usage (wire the trigger/UI later — this is just the pipe):
//   import { sendEmail } from "@/lib/email";
//   const res = await sendEmail({
//     to: "collector@example.com",
//     subject: "A work I think you'll love",
//     html: "<p>…</p>",
//     attachments: [{ filename: "tearsheet.pdf", content: pdfBytes }],
//   });
//   if ("error" in res) { /* surface res.error */ }
export { sendEmail } from "./send";
export { getResendClient } from "./client";
export type {
  SendEmailInput,
  EmailAttachment,
} from "@/lib/schemas/email";
