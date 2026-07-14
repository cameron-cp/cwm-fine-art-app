"use client";

import { Button, Flex, Text, TextField } from "@radix-ui/themes";
import Image from "next/image";
import { useState } from "react";
import { Alert } from "@/components/alert";
import { addWorkToRoom, removeWork, reorderWorks, setWorkCaption } from "../actions";

export type RoomWorkItem = {
  id: string; // viewing_room_works id
  artworkId: string;
  title: string;
  artistName: string;
  caption: string | null;
  imageUrl: string | null;
};

export type AvailableWork = {
  id: string; // artwork id
  title: string;
  artistName: string;
  imageUrl: string | null;
};

function Thumb({ url }: { url: string | null }) {
  return url ? (
    <Image
      src={url}
      alt=""
      width={48}
      height={48}
      className="h-12 w-12 shrink-0 border border-[var(--rule)] object-cover"
      unoptimized
    />
  ) : (
    <div className="h-12 w-12 shrink-0 border border-[var(--rule)] bg-[var(--paper-3)]" />
  );
}

export function WorksPanel({
  roomId,
  works,
  available,
}: {
  roomId: string;
  works: RoomWorkItem[];
  available: AvailableWork[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);

  const orderedIds = works.map((w) => w.id);

  async function run(key: string, fn: () => Promise<{ error: string } | unknown>) {
    setBusy(key);
    setError(null);
    const res = (await fn()) as { error?: string };
    setBusy(null);
    if (res && "error" in res && res.error) setError(res.error);
  }

  async function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= orderedIds.length) return;
    const reordered = [...orderedIds];
    [reordered[index], reordered[next]] = [reordered[next], reordered[index]];
    await run("reorder", () => reorderWorks(roomId, reordered));
  }

  const filtered = available.filter((a) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return a.title.toLowerCase().includes(q) || a.artistName.toLowerCase().includes(q);
  });

  return (
    <Flex direction="column" gap="4">
      {error && <Alert tone="error">{error}</Alert>}

      {works.length === 0 ? (
        <Text size="2" style={{ color: "var(--ink-3)" }}>
          No works yet — add inventory works below.
        </Text>
      ) : (
        <Flex direction="column" gap="3">
          {works.map((w, i) => (
            <Flex key={w.id} gap="3" align="start" className="border-b border-[var(--rule)] pb-3">
              <Thumb url={w.imageUrl} />
              <Flex direction="column" gap="2" flexGrow="1" minWidth="0">
                <div>
                  <div className="font-serif text-[15px] font-semibold leading-tight text-[var(--ink)]">
                    {w.artistName}
                  </div>
                  <div className="font-serif text-[13px] italic text-[var(--ink-2)]">{w.title}</div>
                </div>
                <CaptionEditor
                  roomId={roomId}
                  workId={w.id}
                  initial={w.caption}
                  onError={setError}
                />
              </Flex>
              <Flex direction="column" gap="1" align="center">
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0 || busy === "reorder"}
                  onClick={() => move(i, -1)}
                  className="px-1 text-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === works.length - 1 || busy === "reorder"}
                  onClick={() => move(i, 1)}
                  className="px-1 text-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-30"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label="Remove"
                  disabled={busy === `rm-${w.id}`}
                  onClick={() => run(`rm-${w.id}`, () => removeWork(w.id, roomId))}
                  className="px-1 text-[var(--ink-3)] hover:text-[var(--danger)] disabled:opacity-30"
                >
                  ✕
                </button>
              </Flex>
            </Flex>
          ))}
        </Flex>
      )}

      <div>
        <Button variant="outline" color="gray" onClick={() => setAdding((v) => !v)}>
          {adding ? "Done adding" : "Add works"}
        </Button>
      </div>

      {adding && (
        <Flex direction="column" gap="3" className="border border-[var(--rule)] bg-[var(--paper-2)] p-3">
          <TextField.Root
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search inventory by title or artist…"
          />
          {filtered.length === 0 ? (
            <Text size="2" style={{ color: "var(--ink-3)" }}>
              {available.length === 0 ? "All inventory works are already in this room." : "No matches."}
            </Text>
          ) : (
            <Flex direction="column" gap="2" style={{ maxHeight: 320, overflowY: "auto" }}>
              {filtered.slice(0, 40).map((a) => (
                <Flex key={a.id} gap="3" align="center">
                  <Thumb url={a.imageUrl} />
                  <Flex direction="column" flexGrow="1" minWidth="0">
                    <span className="font-serif text-[14px] font-semibold text-[var(--ink)]">
                      {a.artistName}
                    </span>
                    <span className="font-serif text-[12px] italic text-[var(--ink-2)]">{a.title}</span>
                  </Flex>
                  <Button
                    size="1"
                    variant="soft"
                    color="gray"
                    disabled={busy === `add-${a.id}`}
                    onClick={() => run(`add-${a.id}`, () => addWorkToRoom(roomId, { artwork_id: a.id }))}
                  >
                    Add
                  </Button>
                </Flex>
              ))}
            </Flex>
          )}
        </Flex>
      )}
    </Flex>
  );
}

function CaptionEditor({
  roomId,
  workId,
  initial,
  onError,
}: {
  roomId: string;
  workId: string;
  initial: string | null;
  onError: (e: string | null) => void;
}) {
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const dirty = (value.trim() || null) !== (initial?.trim() || null);

  async function save() {
    if (!dirty) return;
    setSaving(true);
    onError(null);
    const res = await setWorkCaption(roomId, workId, value);
    setSaving(false);
    if ("error" in res) onError(res.error);
  }

  return (
    <Flex gap="2" align="center">
      <TextField.Root
        size="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Caption (optional)"
        className="flex-1"
        onBlur={save}
      />
      {dirty && (
        <Button size="1" variant="ghost" loading={saving} onClick={save}>
          Save
        </Button>
      )}
    </Flex>
  );
}
