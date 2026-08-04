// @vitest-environment jsdom

// Exhibition history is one of the two things a collector's advisor asks about
// before a price (the other is provenance). It has to be editable on the work and
// it has to sit where a dealer's eye expects it — after Provenance, before
// Literature, the order every auction catalogue and her own factsheets use.
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Artwork } from "@/lib/schemas/artwork";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  useSupabase: () => ({ storage: { from: () => ({ upload: vi.fn() }) } }),
}));

vi.mock("@/app/(app)/artists/actions", () => ({
  createArtist: vi.fn(),
  updateArtist: vi.fn(),
  deleteArtist: vi.fn(),
  generateArtistBio: vi.fn(),
}));

vi.mock("@/app/(app)/artists/artist-authority-picker", () => ({
  ArtistAuthorityPicker: () => null,
}));

const updateArtwork = vi.fn<(id: string, values: unknown) => Promise<unknown>>(
  async () => ({ data: { id: ARTWORK_ID } }),
);

vi.mock("../actions", () => ({
  createArtwork: vi.fn(),
  updateArtwork: (id: string, values: unknown) => updateArtwork(id, values),
  deleteArtwork: vi.fn(),
  recordArtworkImage: vi.fn(),
}));

const { ArtworkForm } = await import("../artwork-form");

// The shared <Field> primitive renders a bare <label> with no htmlFor, so its
// label is not programmatically tied to the control (an app-wide a11y gap worth
// fixing separately). Query by the react-hook-form field name instead — that is
// what actually identifies the control.
function control(name: string): HTMLTextAreaElement {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) throw new Error(`no form control named "${name}"`);
  return el as HTMLTextAreaElement;
}

const ARTIST_ID = "19ff35a1-59d4-4e29-bc70-7cc4353206ef";
const ARTWORK_ID = "6e5b9173-0e83-41a6-b2fc-75f1b814dfd9";

const EXHIBITED =
  "Santa Fe, Gerald Peters Gallery, Picasso on Paper, Selected Works from the " +
  "Marina Picasso Collection, August – November 1998, fig. 10, n.p., traveled to " +
  "Dallas, Gerald Peters Gallery, November – December 1998.";

const ARTWORK: Artwork = {
  id: ARTWORK_ID,
  artist_id: ARTIST_ID,
  title: "Homme au béret basque",
  year: 1946,
  medium: "Gouache on paper",
  signature_details: null,
  height_in: 19.88,
  width_in: 13,
  depth_in: null,
  edition: null,
  catalogue_raisonne: null,
  provenance_lines: ["Estate of the artist;"],
  exhibited: EXHIBITED,
  literature: null,
  condition: null,
  price_cents: null,
  currency: "USD",
  status: "available",
  notes: null,
  primary_image_path: null,
  current_party_address_id: null,
  created_at: "2026-07-10T21:42:13.831104+00:00",
  updated_at: "2026-07-10T21:42:13.831104+00:00",
};

function renderEdit(artwork: Artwork = ARTWORK) {
  return render(
    <Theme>
      <ArtworkForm
        artwork={artwork}
        artists={[{ id: ARTIST_ID, name: "Pablo Picasso" }]}
        hasPrimaryImage={false}
      />
    </Theme>,
  );
}

afterEach(() => {
  updateArtwork.mockClear();
  cleanup();
});

describe("Exhibited on the artwork form", () => {
  it("shows the stored exhibition history so she can correct it", () => {
    renderEdit();
    expect(control("exhibited").value).toBe(EXHIBITED);
  });

  it("sits between Provenance and Literature", () => {
    // Not cosmetic: she reads these three blocks in catalogue order when checking
    // a work against a consignor's paperwork, and the tearsheet prints them in
    // that same order. A field in the wrong place gets filled in wrong.
    renderEdit();
    const order = ["Provenance", "Exhibited", "Literature"].map((label) =>
      screen.getByText(label),
    );
    expect(
      order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("saves an edit to the exhibition history", async () => {
    const user = userEvent.setup();
    renderEdit({ ...ARTWORK, exhibited: null });

    await user.type(control("exhibited"), "Basel, Galerie Beyeler, 1966.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(updateArtwork).toHaveBeenCalledTimes(1));
    expect(updateArtwork.mock.calls[0]?.[1]).toMatchObject({
      exhibited: "Basel, Galerie Beyeler, 1966.",
    });
  });

  it("saves a cleared field as null, not an empty string", async () => {
    const user = userEvent.setup();
    renderEdit();

    await user.clear(control("exhibited"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await vi.waitFor(() => expect(updateArtwork).toHaveBeenCalledTimes(1));
    expect(updateArtwork.mock.calls[0]?.[1]).toMatchObject({ exhibited: null });
  });
});
