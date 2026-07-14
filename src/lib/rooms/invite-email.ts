import { GALLERY_NAME } from "@/lib/brand";
import type { SendEmailInput } from "@/lib/schemas/email";

// Builds the invite email payload for a viewing room. Pure + presentational so the
// from/recipient/attachment plumbing is unit-testable without Resend (sendEmail
// applies the EMAIL_FROM sender itself). Recipient uses the "Name <addr>" display
// form when a name is known so the collector sees a readable To.
export function buildInviteEmail(opts: {
  toEmail: string;
  toName?: string | null;
  roomTitle: string;
  introNote?: string | null;
  link: string;
  pdf?: { filename: string; bytes: Uint8Array<ArrayBuffer> } | null;
}): SendEmailInput {
  // Guard the display form: a name with angle brackets would break the address
  // grammar, so fall back to the bare address in that case.
  const safeName = opts.toName && !/[<>]/.test(opts.toName) ? opts.toName.trim() : null;
  const to = safeName ? `${safeName} <${opts.toEmail}>` : opts.toEmail;

  const subject = `${opts.roomTitle} — a private viewing from ${GALLERY_NAME}`;

  const intro = opts.introNote?.trim()
    ? `<p style="margin:0 0 16px;color:#45423b;">${escapeHtml(opts.introNote.trim())}</p>`
    : "";

  const html = `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:520px;margin:0 auto;padding:32px 8px;color:#1b1a17;background:#f3f2ee;">
  <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6e6a60;margin-bottom:24px;">${escapeHtml(GALLERY_NAME)}</div>
  <h1 style="font-size:24px;font-weight:600;margin:0 0 8px;">${escapeHtml(opts.roomTitle)}</h1>
  <p style="margin:0 0 16px;color:#45423b;">You've been invited to a private online viewing.</p>
  ${intro}
  <p style="margin:24px 0;">
    <a href="${escapeAttr(opts.link)}" style="display:inline-block;background:#7a2e2e;color:#f3f2ee;text-decoration:none;padding:12px 22px;font-family:Helvetica,Arial,sans-serif;font-size:14px;letter-spacing:.04em;">Enter the viewing room</a>
  </p>
  <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#6e6a60;">This link is personal to you. Please don't forward it.</p>
</div>`.trim();

  return {
    to,
    subject,
    html,
    ...(opts.pdf
      ? {
          attachments: [
            {
              filename: opts.pdf.filename,
              content: opts.pdf.bytes,
              contentType: "application/pdf",
            },
          ],
        }
      : {}),
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
