"use client";

import { Button, Flex, Select, Text, TextArea, TextField } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/alert";
import {
  PRICE_VISIBILITY_LABELS,
  priceVisibilities,
  roomStatuses,
  type PriceVisibility,
  type RoomRow,
  type RoomStatus,
} from "@/lib/schemas/viewing-room";
import { createRoom, setRoomSettings } from "./actions";

const STATUS_LABELS: Record<RoomStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
};

const FIELD_LABEL = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]";

// One form for both "new" (createRoom → redirect to detail) and "settings"
// (setRoomSettings in place). Status is only editable in settings mode.
export function RoomForm({ room }: { room?: RoomRow }) {
  const router = useRouter();
  const editing = !!room;

  const [title, setTitle] = useState(room?.title ?? "");
  const [introNote, setIntroNote] = useState(room?.intro_note ?? "");
  const [priceVisibility, setPriceVisibility] = useState<PriceVisibility>(
    room?.price_visibility ?? "on_request",
  );
  const [status, setStatus] = useState<RoomStatus>(room?.status ?? "draft");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const payload = {
      title,
      intro_note: introNote,
      price_visibility: priceVisibility,
      status: editing ? status : "draft",
    };
    const res = editing
      ? await setRoomSettings(room!.id, payload)
      : await createRoom(payload);
    setPending(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    if (editing) {
      router.refresh();
    } else {
      router.push(`/rooms/${res.data.id}`);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Flex direction="column" gap="4" style={{ maxWidth: 520 }}>
        <label>
          <Text as="div" mb="1" className={FIELD_LABEL}>
            Title
          </Text>
          <TextField.Root
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Spring selection for the Hendersons"
            required
          />
        </label>

        <label>
          <Text as="div" mb="1" className={FIELD_LABEL}>
            Introduction (optional)
          </Text>
          <TextArea
            value={introNote}
            onChange={(e) => setIntroNote(e.target.value)}
            placeholder="A short note shown at the top of the room."
            rows={3}
          />
        </label>

        <label>
          <Text as="div" mb="1" className={FIELD_LABEL}>
            Prices
          </Text>
          <Select.Root
            value={priceVisibility}
            onValueChange={(v) => setPriceVisibility(v as PriceVisibility)}
          >
            <Select.Trigger />
            <Select.Content>
              {priceVisibilities.map((v) => (
                <Select.Item key={v} value={v}>
                  {PRICE_VISIBILITY_LABELS[v]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </label>

        {editing && (
          <label>
            <Text as="div" mb="1" className={FIELD_LABEL}>
              Status
            </Text>
            <Select.Root value={status} onValueChange={(v) => setStatus(v as RoomStatus)}>
              <Select.Trigger />
              <Select.Content>
                {roomStatuses.map((s) => (
                  <Select.Item key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </label>
        )}

        {error && <Alert tone="error">{error}</Alert>}

        <Flex gap="3">
          <Button type="submit" loading={pending}>
            {editing ? "Save settings" : "Create room"}
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}
