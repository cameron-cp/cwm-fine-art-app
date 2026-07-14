import { Box, Container, Flex, Heading, Separator, Text } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RecipientsPanel, type RecipientView } from "./recipients-panel";
import { RoomExportButton } from "./room-export-button";
import { WorksPanel, type AvailableWork, type RoomWorkItem } from "./works-panel";
import { RoomForm } from "../room-form";
import { publicEnv } from "@/lib/env";
import type { RoomRow } from "@/lib/schemas/viewing-room";
import { getSupabaseServer } from "@/lib/supabase/server";
import { signedArtworkUrls } from "@/lib/supabase/storage";

export const dynamic = "force-dynamic";

const SECTION = "text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]";

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServer();

  const { data: roomData, error } = await supabase
    .from("viewing_rooms")
    .select("id, title, intro_note, price_visibility, status, created_at, updated_at, published_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !roomData) notFound();
  const room = roomData as RoomRow;

  const [{ data: workRows }, { data: recipientRows }, { data: inventory }, { data: contacts }] =
    await Promise.all([
      supabase
        .from("viewing_room_works")
        .select("id, position, caption, artwork:artworks(id, title, primary_image_path, artists(name))")
        .eq("room_id", id)
        .order("position", { ascending: true }),
      supabase
        .from("viewing_room_recipients")
        .select("id, label, token, expires_at, revoked_at, first_viewed_at, last_viewed_at, created_at, party:parties(id, display_name, email)")
        .eq("room_id", id)
        .order("created_at", { ascending: true }),
      supabase
        .from("artworks")
        .select("id, title, primary_image_path, artists(name)")
        .eq("record_kind", "inventory")
        .order("created_at", { ascending: false }),
      supabase
        .from("parties")
        .select("id, display_name, email")
        .order("display_name", { ascending: true }),
    ]);

  // Normalize the embedded joins (PostgREST returns object|array depending on rel).
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  type RawWork = {
    id: string;
    position: number;
    caption: string | null;
    artwork: { id: string; title: string; primary_image_path: string | null; artists: { name: string } | { name: string }[] | null } | Array<{ id: string; title: string; primary_image_path: string | null; artists: { name: string } | { name: string }[] | null }> | null;
  };
  const rawWorks = (workRows ?? []) as RawWork[];
  const usedArtworkIds = new Set<string>();

  // Sign every thumbnail (current works + available inventory) in one call.
  const workPaths = rawWorks
    .map((w) => one(w.artwork)?.primary_image_path)
    .filter((p): p is string => !!p);
  const invRows = (inventory ?? []) as {
    id: string;
    title: string;
    primary_image_path: string | null;
    artists: { name: string } | { name: string }[] | null;
  }[];
  const invPaths = invRows.map((a) => a.primary_image_path).filter((p): p is string => !!p);
  const signed = await signedArtworkUrls(supabase, [...workPaths, ...invPaths], 3600);

  const works: RoomWorkItem[] = rawWorks.map((w) => {
    const art = one(w.artwork);
    if (art) usedArtworkIds.add(art.id);
    return {
      id: w.id,
      artworkId: art?.id ?? "",
      title: art?.title ?? "—",
      artistName: one(art?.artists)?.name ?? "Unknown artist",
      caption: w.caption,
      imageUrl: art?.primary_image_path ? (signed[art.primary_image_path] ?? null) : null,
    };
  });

  const available: AvailableWork[] = invRows
    .filter((a) => !usedArtworkIds.has(a.id))
    .map((a) => ({
      id: a.id,
      title: a.title,
      artistName: one(a.artists)?.name ?? "Unknown artist",
      imageUrl: a.primary_image_path ? (signed[a.primary_image_path] ?? null) : null,
    }));

  const recipients: RecipientView[] = ((recipientRows ?? []) as unknown as Array<{
    id: string;
    label: string | null;
    token: string;
    expires_at: string | null;
    revoked_at: string | null;
    first_viewed_at: string | null;
    last_viewed_at: string | null;
    party: { id: string; display_name: string; email: string | null } | Array<{ id: string; display_name: string; email: string | null }> | null;
  }>).map((r) => {
    const p = one(r.party);
    return {
      id: r.id,
      label: r.label,
      token: r.token,
      expiresAt: r.expires_at,
      revokedAt: r.revoked_at,
      firstViewedAt: r.first_viewed_at,
      lastViewedAt: r.last_viewed_at,
      partyName: p?.display_name ?? "—",
      partyEmail: p?.email ?? null,
    };
  });

  const contactOptions = ((contacts ?? []) as { id: string; display_name: string; email: string | null }[]).map(
    (c) => ({ id: c.id, name: c.display_name, email: c.email }),
  );

  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? "";

  return (
    <Container size="4" py="6">
      <Flex justify="between" align="start" mb="5" gap="4" wrap="wrap">
        <Box>
          <Link
            href="/rooms"
            className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)] hover:text-[var(--ink)]"
          >
            ← All rooms
          </Link>
          <Heading size="8" weight="medium" mt="2">
            {room.title}
          </Heading>
        </Box>
        <RoomExportButton roomId={room.id} />
      </Flex>

      <Flex gap="7" align="start" wrap="wrap">
        <Box style={{ flex: "1 1 460px", minWidth: 320 }}>
          <Text as="div" className={SECTION} mb="3">
            Works — {works.length}
          </Text>
          <WorksPanel roomId={room.id} works={works} available={available} />
        </Box>

        <Box style={{ flex: "1 1 360px", minWidth: 300 }}>
          <Text as="div" className={SECTION} mb="3">
            Recipients — {recipients.length}
          </Text>
          <RecipientsPanel
            roomId={room.id}
            recipients={recipients}
            contacts={contactOptions}
            appUrl={appUrl}
          />

          <Separator size="4" my="6" />

          <Text as="div" className={SECTION} mb="3">
            Settings
          </Text>
          <RoomForm room={room} />
        </Box>
      </Flex>
    </Container>
  );
}
