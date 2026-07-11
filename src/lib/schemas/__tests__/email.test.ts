import { describe, expect, it } from "vitest";
import { sendEmailInputSchema } from "@/lib/schemas/email";

// The rails' contract lives in this schema: what a caller may hand to sendEmail
// and how it's normalized before it reaches Resend. Each test pins one rule that,
// if broken, would send mail to the wrong place or reject a valid send.

describe("sendEmailInputSchema", () => {
  it("normalizes a single recipient string to an array (Resend takes both, our send() assumes an array)", () => {
    const r = sendEmailInputSchema.safeParse({
      to: "collector@example.com",
      subject: "Hi",
      text: "body",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.to).toEqual(["collector@example.com"]);
  });

  it('accepts the "Name <addr>" display form so we can send with a readable To', () => {
    const r = sendEmailInputSchema.safeParse({
      to: "Jane Collector <jane@example.com>",
      subject: "Hi",
      text: "body",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.to).toEqual(["Jane Collector <jane@example.com>"]);
  });

  it("rejects a malformed address rather than letting Resend bounce it later", () => {
    const r = sendEmailInputSchema.safeParse({
      to: "not-an-email",
      subject: "Hi",
      text: "body",
    });
    expect(r.success).toBe(false);
  });

  it("requires html or text — an empty body is a caller bug, not a valid send", () => {
    const r = sendEmailInputSchema.safeParse({
      to: "collector@example.com",
      subject: "Hi",
    });
    expect(r.success).toBe(false);
  });

  it("requires a non-blank subject (Resend allows blank; we don't want silent blank-subject sends)", () => {
    const r = sendEmailInputSchema.safeParse({
      to: "collector@example.com",
      subject: "   ",
      text: "body",
    });
    expect(r.success).toBe(false);
  });
});
