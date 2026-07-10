"use client";

import { Badge, Box, Button, Callout, Flex, IconButton, Text } from "@radix-ui/themes";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  deleteArtworkImage,
  recordArtworkImage,
  reorderArtworkImages,
  setPrimaryImage,
} from "../actions";
import { useSupabase } from "@/lib/supabase/browser";

export type ManagedImage = {
  id: string;
  storage_path: string;
  url: string | null;
};

type Props = {
  artworkId: string;
  images: ManagedImage[];
  primaryPath: string | null;
};

export function ImageManager({ artworkId, images, primaryPath }: Props) {
  const router = useRouter();
  const supabase = useSupabase();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const hasPrimary = !!primaryPath;

  function run(fn: () => Promise<{ error?: string } | { data: unknown }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploading(true);
    try {
      // Upload sequentially so positions/primary assignment stay deterministic.
      let primaryAssigned = hasPrimary;
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
        const path = `${artworkId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("artworks")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        const recorded = await recordArtworkImage(artworkId, path, !primaryAssigned);
        if ("error" in recorded) {
          // Don't leave an orphaned object if the DB record failed.
          await supabase.storage.from("artworks").remove([path]);
          throw new Error(recorded.error);
        }
        primaryAssigned = true;
      }
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= images.length) return;
    const order = images.map((i) => i.id);
    [order[index], order[target]] = [order[target], order[index]];
    run(() => reorderArtworkImages(artworkId, order));
  }

  const busy = pending || uploading;

  return (
    <Box>
      <Flex justify="between" align="center" mb="3">
        <Text size="3" weight="medium">
          Images{" "}
          <Text size="2" color="gray" weight="regular">
            ({images.length})
          </Text>
        </Text>
        <Button
          size="2"
          variant="soft"
          onClick={() => fileInput.current?.click()}
          loading={uploading}
          disabled={busy}
        >
          Add images
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
      </Flex>

      {error && (
        <Callout.Root color="red" size="1" mb="3">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {images.length === 0 ? (
        <Flex
          align="center"
          justify="center"
          py="7"
          className="border border-dashed border-[var(--gray-a6)] rounded-3"
        >
          <Text color="gray" size="2">
            No images yet. Add one — the first becomes the tearsheet hero.
          </Text>
        </Flex>
      ) : (
        <Flex direction="column" gap="3">
          {images.map((img, index) => {
            const isHero = img.storage_path === primaryPath;
            return (
              <Flex
                key={img.id}
                gap="3"
                align="center"
                p="2"
                className="border border-[var(--gray-a5)] rounded-3"
              >
                <Box style={{ flex: "0 0 96px" }}>
                  {img.url ? (
                    <Image
                      src={img.url}
                      alt=""
                      width={96}
                      height={96}
                      className="rounded-2 object-cover"
                      style={{ width: 96, height: 96 }}
                      unoptimized
                    />
                  ) : (
                    <Box
                      className="rounded-2 bg-[var(--gray-a3)]"
                      style={{ width: 96, height: 96 }}
                    />
                  )}
                </Box>

                <Flex direction="column" gap="2" flexGrow="1">
                  {isHero ? (
                    <Badge color="green" variant="soft">
                      Tearsheet hero
                    </Badge>
                  ) : (
                    <Button
                      size="1"
                      variant="soft"
                      color="gray"
                      onClick={() => run(() => setPrimaryImage(artworkId, img.storage_path))}
                      disabled={busy}
                      style={{ alignSelf: "flex-start" }}
                    >
                      Set as hero
                    </Button>
                  )}
                </Flex>

                <Flex gap="1" align="center">
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="Move up"
                    disabled={index === 0 || busy}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </IconButton>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="gray"
                    aria-label="Move down"
                    disabled={index === images.length - 1 || busy}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </IconButton>
                  <IconButton
                    size="1"
                    variant="ghost"
                    color="red"
                    aria-label="Delete image"
                    disabled={busy}
                    onClick={() => {
                      if (!confirm("Delete this image?")) return;
                      run(() => deleteArtworkImage(artworkId, img.id));
                    }}
                  >
                    ×
                  </IconButton>
                </Flex>
              </Flex>
            );
          })}
        </Flex>
      )}
    </Box>
  );
}
