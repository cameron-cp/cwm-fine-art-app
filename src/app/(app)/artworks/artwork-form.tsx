"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Flex,
  IconButton,
  Select,
  Text,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition } from "react";
import { useFieldArray, useForm, Controller } from "react-hook-form";
import {
  ARTWORK_STATUS_META,
  artworkSchema,
  artworkStatus,
  type Artwork,
  type ArtworkFormInput,
  type ArtworkInput,
} from "@/lib/schemas/artwork";
import { useSupabase } from "@/lib/supabase/browser";
import {
  createArtwork,
  deleteArtwork,
  recordArtworkImage,
  updateArtwork,
} from "./actions";

type ArtistOption = { id: string; name: string };

// A place an artwork can sit: one party_addresses row, labelled by its owning party.
export type AddressOption = {
  id: string;
  partyName: string;
  label: string; // party_addresses.label, or "Address" when null
  oneLine: string; // formatted address, comma-joined
};

// UI-only sentinel for the nullable location select (resolved to null before RHF/Zod).
const NONE = "__none__";

type SharedProps = {
  artists: ArtistOption[];
  hasPrimaryImage: boolean;
  mediumSuggestions?: string[];
  addressOptions?: AddressOption[];
  submitLabel?: string;
};

// Discriminated union: pass `artwork` for edit, `initialValues` for import,
// or neither for the new-artwork case. Passing both is a TS error.
type EditProps = SharedProps & {
  artwork: Artwork;
  initialValues?: never;
  artistIdOverride?: never;
};

type ImportProps = SharedProps & {
  artwork?: never;
  initialValues: Partial<ArtworkInput>;
  // Reactively patches artist_id after a parent creates an artist mid-flow.
  artistIdOverride?: string;
};

type NewProps = SharedProps & {
  artwork?: never;
  initialValues?: never;
  artistIdOverride?: never;
  // Preselect an artist when arriving from an artist page (?artist=<id>).
  defaultArtistId?: string;
};

type Props = EditProps | ImportProps | NewProps;

const STATUSES = artworkStatus.options.map((value) => ({
  value,
  label: ARTWORK_STATUS_META[value].label,
}));

function priceCentsToDollarString(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function ArtworkForm(props: Props) {
  const {
    artists,
    hasPrimaryImage,
    mediumSuggestions = [],
    addressOptions = [],
    submitLabel,
  } = props;
  const addressGroups = groupAddressOptions(addressOptions);
  const artwork = "artwork" in props ? props.artwork : undefined;
  const initialValues =
    "initialValues" in props ? props.initialValues : undefined;
  const artistIdOverride =
    "artistIdOverride" in props ? props.artistIdOverride : undefined;
  const defaultArtistId =
    "defaultArtistId" in props ? props.defaultArtistId : undefined;

  const router = useRouter();
  const supabase = useSupabase();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const mediumListId = useId();

  // Edit: prefill from artwork. Import: prefill from initialValues, never
  // fall back to artists[0] for artist_id (we want the user to choose, or
  // the import flow to inject via artistIdOverride). New: empty + first artist.
  const isImport = initialValues !== undefined;
  const defaults = artwork
    ? {
        artist_id: artwork.artist_id,
        title: artwork.title,
        year: artwork.year,
        medium: artwork.medium,
        signature_details: artwork.signature_details,
        height_in: artwork.height_in,
        width_in: artwork.width_in,
        depth_in: artwork.depth_in,
        edition: artwork.edition,
        catalogue_raisonne: artwork.catalogue_raisonne,
        provenance_lines: artwork.provenance_lines.map((value) => ({ value })),
        exhibited: artwork.exhibited,
        literature: artwork.literature,
        condition: artwork.condition,
        price_cents: priceCentsToDollarString(artwork.price_cents),
        currency: artwork.currency,
        status: artwork.status,
        notes: artwork.notes,
        primary_image_path: artwork.primary_image_path,
        current_party_address_id: artwork.current_party_address_id ?? null,
      }
    : isImport
    ? {
        artist_id: initialValues.artist_id ?? "",
        title: initialValues.title ?? "",
        year: initialValues.year ?? null,
        medium: initialValues.medium ?? null,
        signature_details: initialValues.signature_details ?? null,
        height_in: initialValues.height_in ?? null,
        width_in: initialValues.width_in ?? null,
        depth_in: initialValues.depth_in ?? null,
        edition: initialValues.edition ?? null,
        catalogue_raisonne: initialValues.catalogue_raisonne ?? null,
        provenance_lines: (initialValues.provenance_lines ?? []).map(
          (entry) =>
            typeof entry === "string" ? { value: entry } : entry,
        ),
        exhibited: initialValues.exhibited ?? null,
        literature: initialValues.literature ?? null,
        condition: initialValues.condition ?? null,
        price_cents: priceCentsToDollarString(initialValues.price_cents),
        currency: initialValues.currency ?? "USD",
        status: initialValues.status ?? "available",
        notes: initialValues.notes ?? null,
        primary_image_path: initialValues.primary_image_path ?? null,
        current_party_address_id: initialValues.current_party_address_id ?? null,
      }
    : {
        artist_id: defaultArtistId ?? artists[0]?.id ?? "",
        title: "",
        year: null,
        medium: null,
        signature_details: null,
        height_in: null,
        width_in: null,
        depth_in: null,
        edition: null,
        catalogue_raisonne: null,
        provenance_lines: [],
        exhibited: null,
        literature: null,
        condition: null,
        price_cents: priceCentsToDollarString(null),
        currency: "USD",
        status: "available" as const,
        notes: null,
        primary_image_path: null,
        current_party_address_id: null,
      };

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<ArtworkFormInput, unknown, ArtworkInput>({
    resolver: zodResolver(artworkSchema),
    defaultValues: defaults,
  });

  // Import flow: parent creates an artist after the form has mounted, then
  // bumps artistIdOverride. Patch the form's artist_id reactively.
  useEffect(() => {
    if (artistIdOverride) {
      setValue("artist_id", artistIdOverride, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  }, [artistIdOverride, setValue]);

  const provenance = useFieldArray({ control, name: "provenance_lines" });

  async function uploadImage(artworkId: string): Promise<string | null> {
    if (!imageFile) return null;
    const ext = imageFile.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${artworkId}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("artworks")
      .upload(path, imageFile, { contentType: imageFile.type, upsert: false });
    if (upErr) throw new Error(`Image upload failed: ${upErr.message}`);
    return path;
  }

  function onSubmit(values: ArtworkInput) {
    setError(null);
    startTransition(async () => {
      try {
        const result = artwork
          ? await updateArtwork(artwork.id, values)
          : await createArtwork(values);
        if ("error" in result) {
          setError(result.error);
          return;
        }

        const id = result.data.id;
        if (imageFile) {
          const storagePath = await uploadImage(id);
          if (storagePath) {
            const setAsPrimary = !hasPrimaryImage;
            const recorded = await recordArtworkImage(id, storagePath, setAsPrimary);
            if ("error" in recorded) {
              setError(recorded.error);
              return;
            }
          }
        }

        router.push(`/artworks/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  }

  function onDelete() {
    if (!artwork) return;
    if (!confirm(`Delete "${artwork.title}"? This also removes its images.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteArtwork(artwork.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push("/artworks");
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Flex direction="column" gap="4" maxWidth="640px">
        {error && (
          <Alert tone="error">{error}</Alert>
        )}

        <Field label="Artist" error={errors.artist_id?.message} required>
          <Controller
            control={control}
            name="artist_id"
            render={({ field }) => (
              <Select.Root
                value={field.value || undefined}
                onValueChange={field.onChange}
              >
                <Select.Trigger placeholder="Select artist…" />
                <Select.Content>
                  {artists.map((a) => (
                    <Select.Item key={a.id} value={a.id}>
                      {a.name}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}
          />
        </Field>

        <Field label="Title" error={errors.title?.message} required>
          <TextField.Root {...register("title")} placeholder="e.g. Migration" />
        </Field>

        <Flex gap="3">
          <Field label="Year" error={errors.year?.message}>
            <TextField.Root type="number" {...register("year")} placeholder="1978" />
          </Field>
          <Field label="Edition" error={errors.edition?.message}>
            <TextField.Root {...register("edition")} placeholder="3/10 or AP" />
          </Field>
        </Flex>

        <Field label="Medium" error={errors.medium?.message}>
          <TextField.Root
            {...register("medium")}
            placeholder="Oil on canvas"
            list={mediumListId}
          />
          {mediumSuggestions.length > 0 && (
            <datalist id={mediumListId}>
              {mediumSuggestions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </Field>

        <Field label="Signature / inscription" error={errors.signature_details?.message}>
          <TextArea
            {...register("signature_details")}
            rows={2}
            placeholder='Inscribed on the reverse: "PHILIP GUSTON / MIGRATION"'
          />
        </Field>

        <Flex direction="column" gap="2">
          <Text size="2" weight="medium">
            Dimensions (inches)
          </Text>
          <Flex gap="3">
            <Field label="Height" error={errors.height_in?.message}>
              <TextField.Root
                type="number"
                step="any"
                {...register("height_in")}
                placeholder="48"
              />
            </Field>
            <Field label="Width" error={errors.width_in?.message}>
              <TextField.Root
                type="number"
                step="any"
                {...register("width_in")}
                placeholder="60"
              />
            </Field>
            <Field label="Depth (3D only)" error={errors.depth_in?.message}>
              <TextField.Root
                type="number"
                step="any"
                {...register("depth_in")}
                placeholder=""
              />
            </Field>
          </Flex>
          <Text size="1" color="gray">
            Cm conversion is rendered automatically. Leave depth blank for paintings and works on paper.
          </Text>
        </Flex>

        <Field
          label="Catalogue raisonné"
          error={errors.catalogue_raisonne?.message}
        >
          <TextArea
            {...register("catalogue_raisonne")}
            rows={2}
            placeholder="This work is registered in the Philip Guston Catalogue Raisonné (# P78.047)."
          />
        </Field>

        <Flex direction="column" gap="2">
          <Flex justify="between" align="center">
            <Text size="2" weight="medium">
              Provenance
            </Text>
            <Button
              type="button"
              size="1"
              variant="soft"
              onClick={() => provenance.append({ value: "" })}
            >
              + Add owner
            </Button>
          </Flex>
          {provenance.fields.length === 0 && (
            <Text size="1" color="gray">
              List previous owners chronologically. Each entry is one line on the tearsheet.
            </Text>
          )}
          {provenance.fields.map((field, index) => (
            <Flex key={field.id} gap="2" align="start">
              <Text size="1" color="gray" style={{ minWidth: 18, paddingTop: 8 }}>
                {index + 1}.
              </Text>
              <Flex direction="column" gap="1" flexGrow="1">
                <TextField.Root
                  {...register(`provenance_lines.${index}.value`)}
                  placeholder={
                    index === 0
                      ? "Collection of Sandra and Howard Hoffen"
                      : "Sotheby's, New York, 9 May 1990, Lot 237"
                  }
                />
                {errors.provenance_lines?.[index]?.value?.message && (
                  <Text size="1" color="red">
                    {errors.provenance_lines[index]?.value?.message}
                  </Text>
                )}
              </Flex>
              <IconButton
                type="button"
                size="1"
                variant="ghost"
                color="gray"
                onClick={() => provenance.move(index, Math.max(0, index - 1))}
                disabled={index === 0}
                aria-label="Move up"
              >
                ↑
              </IconButton>
              <IconButton
                type="button"
                size="1"
                variant="ghost"
                color="gray"
                onClick={() =>
                  provenance.move(index, Math.min(provenance.fields.length - 1, index + 1))
                }
                disabled={index === provenance.fields.length - 1}
                aria-label="Move down"
              >
                ↓
              </IconButton>
              <IconButton
                type="button"
                size="1"
                variant="ghost"
                color="red"
                onClick={() => provenance.remove(index)}
                aria-label="Remove"
              >
                ×
              </IconButton>
            </Flex>
          ))}
        </Flex>

        <Field label="Exhibited" error={errors.exhibited?.message}>
          <TextArea
            {...register("exhibited")}
            rows={5}
            placeholder={`Santa Fe, Gerald Peters Gallery, Picasso on Paper, Selected Works from the Marina Picasso Collection, August – November 1998, fig. 10, n.p., traveled to Dallas, Gerald Peters Gallery, November – December 1998.`}
          />
          <Text size="1" color="gray">
            One exhibition per paragraph, oldest first. Separate them with a blank line.
          </Text>
        </Field>

        <Field label="Literature" error={errors.literature?.message}>
          <TextArea
            {...register("literature")}
            rows={5}
            placeholder={`Cooper, Harry, Mark Godfrey, Alison de Lima Greene, and Kate Nesin, Philip Guston Now, exh. cat., Washington D.C.: National Gallery of Art, 2020, p. 202 (text), not illustrated.`}
          />
          <Text size="1" color="gray">
            Free-form. Multiple references separated by paragraph breaks.
          </Text>
        </Field>

        <Field label="Condition (internal)" error={errors.condition?.message}>
          <TextArea
            {...register("condition")}
            rows={2}
            placeholder="Won't appear on tearsheet"
          />
        </Field>

        <Flex gap="3">
          <Field label="Price" error={errors.price_cents?.message}>
            <TextField.Root {...register("price_cents")} placeholder="120000" />
          </Field>
          <Field label="Currency" error={errors.currency?.message}>
            <TextField.Root {...register("currency")} placeholder="USD" />
          </Field>
          <Field label="Status" error={errors.status?.message}>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select.Root value={field.value} onValueChange={field.onChange}>
                  <Select.Trigger />
                  <Select.Content>
                    {STATUSES.map((s) => (
                      <Select.Item key={s.value} value={s.value}>
                        {s.label}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              )}
            />
          </Field>
        </Flex>

        <Field
          label="Current location"
          error={errors.current_party_address_id?.message}
        >
          <Controller
            control={control}
            name="current_party_address_id"
            render={({ field }) => (
              <Select.Root
                value={(field.value as string | null) ?? NONE}
                onValueChange={(v) => field.onChange(v === NONE ? null : v)}
              >
                <Select.Trigger placeholder="None" />
                <Select.Content>
                  <Select.Item value={NONE}>None</Select.Item>
                  {addressGroups.map((group) => (
                    <Select.Group key={group.partyName}>
                      <Select.Label>{group.partyName}</Select.Label>
                      {group.options.map((o) => (
                        <Select.Item key={o.id} value={o.id}>
                          {o.label} — {o.oneLine}
                        </Select.Item>
                      ))}
                    </Select.Group>
                  ))}
                </Select.Content>
              </Select.Root>
            )}
          />
          <Text size="1" color="gray">
            Where the work physically sits — a contact&apos;s address (e.g. a
            collector&apos;s Storage or Freeport). Doesn&apos;t change ownership.
          </Text>
        </Field>

        <Field label="Internal notes" error={errors.notes?.message}>
          <TextArea {...register("notes")} rows={3} placeholder="Won't appear on tearsheet" />
        </Field>

        {/* On edit, the dedicated image manager on the artwork page handles
            uploads/reorder/hero. Only new/import need an inline first upload. */}
        {!artwork && (
          <Field label="Image" error={undefined}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
            <Text size="1" color="gray">
              First image becomes the tearsheet hero. You can add more images after saving.
            </Text>
          </Field>
        )}

        <Flex gap="3" mt="2" justify="between">
          <Flex gap="3">
            <Button type="submit" loading={pending}>
              {submitLabel ?? (artwork ? "Save changes" : "Create artwork")}
            </Button>
            <Button
              type="button"
              variant="soft"
              color="gray"
              onClick={() => router.back()}
            >
              Cancel
            </Button>
          </Flex>
          {artwork && (
            <Button
              type="button"
              variant="soft"
              color="red"
              onClick={onDelete}
              loading={pending}
            >
              Delete
            </Button>
          )}
        </Flex>
      </Flex>
    </form>
  );
}

// Group address options by their owning party for a sectioned Select.
function groupAddressOptions(
  options: AddressOption[],
): { partyName: string; options: AddressOption[] }[] {
  const byParty = new Map<string, AddressOption[]>();
  for (const o of options) {
    const arr = byParty.get(o.partyName) ?? [];
    arr.push(o);
    byParty.set(o.partyName, arr);
  }
  return Array.from(byParty, ([partyName, opts]) => ({ partyName, options: opts }));
}

