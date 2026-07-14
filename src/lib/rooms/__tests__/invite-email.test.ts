import { describe, expect, it } from "vitest";
import { buildInviteEmail } from "../invite-email";
import { sendEmailInputSchema } from "@/lib/schemas/email";

// The invite is the app's first real sendEmail caller. These pin the plumbing that,
// if broken, sends the room link to the wrong place or drops the PDF leave-behind.
// (The `from` sender is applied inside sendEmail from EMAIL_FROM — see the last case.)

const LINK = "https://app.example.com/room/abc123";

describe("buildInviteEmail", () => {
  it("addresses the recipient by their contact email, using the readable Name <addr> form", () => {
    const out = buildInviteEmail({
      toEmail: "jane@collector.com",
      toName: "Jane Collector",
      roomTitle: "Spring Selection",
      link: LINK,
    });
    expect(out.to).toBe("Jane Collector <jane@collector.com>");
    // And it's a valid send per the rails' own schema.
    expect(sendEmailInputSchema.safeParse(out).success).toBe(true);
  });

  it("falls back to the bare address when the name would break the address grammar", () => {
    const out = buildInviteEmail({
      toEmail: "jane@collector.com",
      toName: "Weird <name>",
      roomTitle: "Spring Selection",
      link: LINK,
    });
    expect(out.to).toBe("jane@collector.com");
    expect(sendEmailInputSchema.safeParse(out).success).toBe(true);
  });

  it("embeds the room link in the body so the collector can actually open the room", () => {
    const out = buildInviteEmail({
      toEmail: "jane@collector.com",
      roomTitle: "Spring Selection",
      link: LINK,
    });
    expect(out.html).toContain(LINK);
  });

  it("attaches the PDF leave-behind (filename + pdf content type) when bytes are provided", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const out = buildInviteEmail({
      toEmail: "jane@collector.com",
      roomTitle: "Spring Selection",
      link: LINK,
      pdf: { filename: "viewing-room.pdf", bytes },
    });
    expect(out.attachments).toHaveLength(1);
    expect(out.attachments![0]).toMatchObject({
      filename: "viewing-room.pdf",
      content: bytes,
      contentType: "application/pdf",
    });
    expect(sendEmailInputSchema.safeParse(out).success).toBe(true);
  });

  it("omits attachments entirely when no PDF is provided (link-only invite)", () => {
    const out = buildInviteEmail({
      toEmail: "jane@collector.com",
      roomTitle: "Spring Selection",
      link: LINK,
    });
    expect(out.attachments).toBeUndefined();
  });

  it("never sets `from` — the verified EMAIL_FROM sender is owned by sendEmail, and the invite must not override it", () => {
    const out = buildInviteEmail({
      toEmail: "jane@collector.com",
      roomTitle: "Spring Selection",
      link: LINK,
    });
    expect("from" in out).toBe(false);
  });
});
