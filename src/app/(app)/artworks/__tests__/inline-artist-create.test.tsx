// @vitest-environment jsdom

// The dealer's real failure mode: she starts entering a work, realizes the artist
// isn't in the system, and every escape route costs her the entry. These tests pin
// the invariant that makes the inline path worth having — creating the artist must
// not navigate, must not remount the artwork form, and must leave every field she
// already typed exactly as it was.
import { Theme } from "@radix-ui/themes";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const back = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, back, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/browser", () => ({
  useSupabase: () => ({ storage: { from: () => ({ upload: vi.fn() }) } }),
}));

const createArtist = vi.fn(async (input: { name: string }) => ({
  data: { id: ARTIST_ID, name: input.name },
}));

vi.mock("@/app/(app)/artists/actions", () => ({
  createArtist: (input: { name: string }) => createArtist(input),
  updateArtist: vi.fn(),
  deleteArtist: vi.fn(),
  generateArtistBio: vi.fn(),
}));

// The authority lookup talks to Wikidata through React Query; out of scope here.
vi.mock("@/app/(app)/artists/artist-authority-picker", () => ({
  ArtistAuthorityPicker: () => null,
}));

const createArtwork = vi.fn();

vi.mock("../actions", () => ({
  createArtwork: () => createArtwork(),
  updateArtwork: vi.fn(),
  deleteArtwork: vi.fn(),
  recordArtworkImage: vi.fn(),
}));

const ARTIST_ID = "11111111-1111-4111-8111-111111111111";

const { ArtworkForm } = await import("../artwork-form");
const { mergeArtistOptions } = await import("../artist-picker");

beforeEach(() => {
  push.mockClear();
  back.mockClear();
  createArtist.mockClear();
  createArtwork.mockClear();
});

afterEach(() => cleanup());

// jest-dom matchers aren't installed; read the DOM value directly.
function valueOf(placeholder: string): string {
  return (screen.getByPlaceholderText(placeholder) as HTMLInputElement).value;
}

function renderForm(artists: { id: string; name: string }[] = []) {
  return render(
    <Theme>
      <ArtworkForm artists={artists} hasPrimaryImage={false} />
    </Theme>,
  );
}

describe("creating an artist from inside the artwork form", () => {
  it("keeps every already-typed artwork field and selects the new artist", async () => {
    const user = userEvent.setup();
    renderForm([]);

    // She fills in the work first — this is the input that must survive.
    await user.type(screen.getByPlaceholderText("e.g. Migration"), "Migration");
    await user.type(screen.getByPlaceholderText("1978"), "1978");
    await user.type(screen.getByPlaceholderText("Oil on canvas"), "Oil on canvas");

    await user.click(screen.getByRole("button", { name: "New artist" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("e.g. Agnes Martin"),
      "Agnes Martin",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create artist" }));

    await waitFor(() => expect(createArtist).toHaveBeenCalledTimes(1));
    expect(createArtist.mock.calls[0]?.[0]).toMatchObject({ name: "Agnes Martin" });

    // The overlay closes and the new artist is the Artist field's value, so she
    // can submit immediately instead of hunting for it in the list.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() =>
      expect(screen.getByLabelText("Artist").textContent).toContain("Agnes Martin"),
    );

    // The whole point: nothing was navigated away from, nothing was retyped.
    expect(push).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    expect(valueOf("e.g. Migration")).toBe("Migration");
    expect(valueOf("1978")).toBe("1978");
    expect(valueOf("Oil on canvas")).toBe("Oil on canvas");
  });

  // She will hit Enter after typing a name. The overlay is portaled out of the
  // host <form>, so Enter must save the artist — if the panel ever renders inside
  // the artwork form's DOM, this instead submits a half-filled artwork.
  it("saves the artist on Enter without submitting the artwork", async () => {
    const user = userEvent.setup();
    renderForm([]);

    await user.type(screen.getByPlaceholderText("e.g. Migration"), "Migration");
    await user.click(screen.getByRole("button", { name: "New artist" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(
      within(dialog).getByPlaceholderText("e.g. Agnes Martin"),
      "Agnes Martin{Enter}",
    );

    await waitFor(() => expect(createArtist).toHaveBeenCalledTimes(1));
    expect(createArtwork).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByLabelText("Artist").textContent).toContain("Agnes Martin"),
    );
    expect(valueOf("e.g. Migration")).toBe("Migration");
  });

  it("offers the create path when the artist roster is empty", async () => {
    renderForm([]);

    // No artist select to choose from, but the form is still usable — the old
    // behaviour was a page-level dead end that refused to render the form at all.
    expect(screen.getByRole("button", { name: "New artist" })).toBeTruthy();
    expect(screen.getByPlaceholderText("e.g. Migration")).toBeTruthy();
    expect(screen.queryByLabelText("Artist")).toBeNull();
  });

  it("cancelling the overlay leaves the artwork form untouched", async () => {
    const user = userEvent.setup();
    renderForm([{ id: "22222222-2222-4222-8222-222222222222", name: "Joan Mitchell" }]);

    await user.type(screen.getByPlaceholderText("e.g. Migration"), "Untitled");
    await user.click(screen.getByRole("button", { name: "New artist" }));

    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(back).not.toHaveBeenCalled();
    expect(valueOf("e.g. Migration")).toBe("Untitled");
    expect(screen.getByLabelText("Artist").textContent).toContain("Joan Mitchell");
  });
});

describe("mergeArtistOptions", () => {
  it("files a session-created artist alphabetically, not at the bottom", () => {
    const merged = mergeArtistOptions(
      [
        { id: "a", name: "Agnes Martin" },
        { id: "c", name: "Cy Twombly" },
      ],
      [{ id: "b", name: "Brice Marden" }],
    );
    expect(merged.map((a) => a.name)).toEqual([
      "Agnes Martin",
      "Brice Marden",
      "Cy Twombly",
    ]);
  });

  it("does not double-list an artist once the server refetch includes them", () => {
    const merged = mergeArtistOptions(
      [{ id: "a", name: "Agnes Martin" }],
      [{ id: "a", name: "Agnes Martin" }],
    );
    expect(merged).toHaveLength(1);
  });
});
