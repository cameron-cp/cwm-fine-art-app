import { describe, expect, it } from "vitest";
import { partySchema } from "../party";

// A complete payload mirrors what ContactForm submits: every optional field is
// present as null, never absent (optionalText/optionalUrl reject `undefined`).
const base = {
  kind: "person" as const,
  display_name: "X",
  legal_name: null,
  entity_type: null,
  email: null,
  phone: null,
  website_url: null,
  linkedin_url: null,
  notes: null,
  roles: [],
  addresses: [],
};

function parse(patch: Record<string, unknown>) {
  return partySchema.safeParse({ ...base, ...patch });
}

describe("party web links", () => {
  it("prepends https:// to a scheme-less website so a pasted bare domain is a valid URL", () => {
    // She'll paste "gagosian.com", not "https://gagosian.com" — dropping it or
    // storing an unusable value both break the click-through on the detail page.
    const r = parse({ website_url: "gagosian.com" });
    expect(r.success && r.data.website_url).toBe("https://gagosian.com");
  });

  it("accepts a LinkedIn company page (bare) and normalizes the scheme", () => {
    // The field must work for a company page, not just an individual /in/ profile.
    const r = parse({ linkedin_url: "linkedin.com/company/sothebys" });
    expect(r.success && r.data.linkedin_url).toBe("https://linkedin.com/company/sothebys");
  });

  it("accepts an individual LinkedIn profile with subdomain", () => {
    const r = parse({ linkedin_url: "https://www.linkedin.com/in/jane-doe" });
    expect(r.success && r.data.linkedin_url).toBe("https://www.linkedin.com/in/jane-doe");
  });

  it("rejects a non-LinkedIn URL in the LinkedIn field — guards against pasting the website there", () => {
    const r = parse({ linkedin_url: "https://gagosian.com" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Must be a linkedin.com URL");
  });

  it("rejects a hostname that merely ends in the string 'linkedin.com'", () => {
    // notlinkedin.com / evil-linkedin.com must not pass the domain guard.
    expect(parse({ linkedin_url: "https://evil-linkedin.com/in/x" }).success).toBe(false);
  });

  it("treats blank as null for both fields", () => {
    const r = parse({ website_url: "", linkedin_url: "" });
    expect(r.success && r.data.website_url).toBeNull();
    expect(r.success && r.data.linkedin_url).toBeNull();
  });

  it("rejects a website that isn't a URL at all", () => {
    expect(parse({ website_url: "not a url" }).success).toBe(false);
  });
});
