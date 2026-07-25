"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, Button, Flex, Select, Text, TextArea, TextField } from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { COUNTRY_CODES, COUNTRY_OPTIONS, countryName, demonym } from "@/lib/countries";
import {
  artistSchema,
  deriveSortName,
  type Artist,
  type ArtistFormInput,
  type ArtistInput,
} from "@/lib/schemas/artist";
import type { BioResult, FactFinding } from "@/lib/artist/bio";
import { Field } from "@/components/field";
import { ArtistAuthorityPicker, type ResolvedPayload } from "./artist-authority-picker";
import { createArtist, deleteArtist, generateArtistBio, updateArtist } from "./actions";

const COUNTRY_CODE_SET = new Set<string>(COUNTRY_CODES);

type Props = {
  artist?: Artist;
  // Inline mode (the artwork form's create-artist overlay): hand the new artist
  // back to the host instead of navigating to /artists, and let the host close
  // itself on cancel. Same fields, same schema, same server action.
  onCreated?: (artist: { id: string; name: string }) => void;
  onCancel?: () => void;
};

const ADD_PLACEHOLDER = "__add__";

export function ArtistForm({ artist, onCreated, onCancel }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [bioPending, startBio] = useTransition();
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioChecks, setBioChecks] = useState<BioResult | null>(null);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ArtistFormInput, unknown, ArtistInput>({
    resolver: zodResolver(artistSchema),
    defaultValues: {
      name: artist?.name ?? "",
      sort_name: artist?.sort_name ?? "",
      birth_year: artist?.birth_year ?? null,
      death_year: artist?.death_year ?? null,
      nationalities: (artist?.nationalities ?? []) as ArtistFormInput["nationalities"],
      bio: artist?.bio ?? null,
      canonical_artist_id: artist?.canonical_artist_id ?? null,
    },
  });

  // Adopt a Wikidata/Getty lookup: prefill the editable fields + record the
  // canonical link. Nothing is saved yet — she verifies, then submits.
  function onAuthorityResolved(payload: ResolvedPayload) {
    const f = payload.fields;
    setValue("name", f.preferred_name, { shouldDirty: true });
    setValue("sort_name", f.sort_name, { shouldDirty: true });
    setValue("birth_year", f.birth_year, { shouldDirty: true });
    setValue("death_year", f.death_year, { shouldDirty: true });
    const codes = f.nationality_codes.filter((c) => COUNTRY_CODE_SET.has(c));
    setValue("nationalities", codes as ArtistFormInput["nationalities"], { shouldDirty: true });
    if (f.bio) setValue("bio", f.bio, { shouldDirty: true });
    setValue("canonical_artist_id", payload.canonicalArtistId, { shouldDirty: true });
  }

  const nameReg = register("name");

  function onSubmit(values: ArtistInput) {
    setError(null);
    startTransition(async () => {
      const result = artist ? await updateArtist(artist.id, values) : await createArtist(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (onCreated && !artist) {
        onCreated({ id: result.data.id, name: values.name });
        return;
      }
      router.push("/artists");
    });
  }

  function onGenerateBio() {
    setBioError(null);
    setBioChecks(null);
    const name = getValues("name")?.trim();
    if (!name) {
      setBioError("Enter the artist's name first.");
      return;
    }
    const num = (v: unknown): number | null => {
      if (v === "" || v === null || v === undefined) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    startBio(async () => {
      const result = await generateArtistBio({
        name,
        birth_year: num(getValues("birth_year")),
        death_year: num(getValues("death_year")),
        nationalities: (getValues("nationalities") ?? []) as string[],
        artistId: artist?.id ?? null,
      });
      if ("error" in result) {
        setBioError(result.error);
        return;
      }
      setValue("bio", result.data.bio, { shouldDirty: true });
      setBioChecks(result.data);
    });
  }

  function onDelete() {
    if (!artist) return;
    if (!confirm(`Delete ${artist.name}? Artworks referencing this artist will block deletion.`)) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteArtist(artist.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push("/artists");
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Flex direction="column" gap="4" maxWidth="540px">
        {error && (
          <Alert tone="error">{error}</Alert>
        )}

        <input type="hidden" {...register("canonical_artist_id")} />

        <Field
          label="Look up artist (Wikidata / Getty)"
          hint="Search a public art authority to prefill verified details. Everything stays editable — check it before saving."
        >
          <ArtistAuthorityPicker onResolved={onAuthorityResolved} />
        </Field>

        <Field label="Name" error={errors.name?.message} required>
          <TextField.Root
            {...nameReg}
            placeholder="e.g. Agnes Martin"
            onBlur={(e) => {
              nameReg.onBlur(e);
              // Fill the filing name from the display name only if it's still blank,
              // so a manual override is never clobbered.
              const current = getValues("sort_name");
              if (typeof current !== "string" || current.trim() === "") {
                setValue("sort_name", deriveSortName(e.target.value), { shouldDirty: true });
              }
            }}
          />
        </Field>

        <Field
          label="Files as"
          error={errors.sort_name?.message}
          hint='How she alphabetizes. Auto-filled from the name ("Picasso, Pablo") — override for mononyms (KAWS) or collectives.'
        >
          <TextField.Root {...register("sort_name")} placeholder="Martin, Agnes" />
        </Field>

        <Flex direction="column" gap="1">
          <Flex gap="3">
            <Field label="Birth year" error={errors.birth_year?.message}>
              <TextField.Root type="number" {...register("birth_year")} placeholder="1912" />
            </Field>
            <Field label="Death year" error={errors.death_year?.message}>
              <TextField.Root type="number" {...register("death_year")} placeholder="2004" />
            </Field>
          </Flex>
          {bioChecks?.dates && <FactCheckNote label="Dates" finding={bioChecks.dates} />}
        </Flex>

        <Controller
          control={control}
          name="nationalities"
          render={({ field }) => {
            const codes = (field.value ?? []) as string[];
            const set = (next: string[]) => field.onChange(next);
            const availableOptions = COUNTRY_OPTIONS.filter((o) => !codes.includes(o.code));
            return (
              <Field
                label="Nationality"
                hint={
                  codes.length > 1
                    ? `Shows as "${codes.map(demonym).join("-")}". First = primary.`
                    : "Add one or more. Tap ★ to set the primary (shown first)."
                }
              >
                <Flex direction="column" gap="2">
                  {codes.length > 0 && (
                    <Flex gap="2" wrap="wrap">
                      {codes.map((code, i) => (
                        <Badge key={code} size="2" variant={i === 0 ? "solid" : "soft"} color="gray">
                          {i !== 0 && (
                            <button
                              type="button"
                              aria-label={`Make ${countryName(code)} primary`}
                              onClick={() => set([code, ...codes.filter((c) => c !== code)])}
                              className="cursor-pointer"
                            >
                              ★
                            </button>
                          )}
                          {countryName(code)}
                          <button
                            type="button"
                            aria-label={`Remove ${countryName(code)}`}
                            onClick={() => set(codes.filter((c) => c !== code))}
                            className="cursor-pointer"
                          >
                            ✕
                          </button>
                        </Badge>
                      ))}
                    </Flex>
                  )}
                  <Select.Root
                    value={ADD_PLACEHOLDER}
                    onValueChange={(v) => v !== ADD_PLACEHOLDER && !codes.includes(v) && set([...codes, v])}
                  >
                    <Select.Trigger placeholder="Add nationality…" />
                    <Select.Content>
                      <Select.Item value={ADD_PLACEHOLDER} disabled>
                        Add nationality…
                      </Select.Item>
                      {availableOptions.map((o) => (
                        <Select.Item key={o.code} value={o.code}>
                          {o.name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select.Root>
                  {bioChecks?.nationality && (
                    <FactCheckNote label="Nationality" finding={bioChecks.nationality} />
                  )}
                </Flex>
              </Field>
            );
          }}
        />

        <Flex direction="column" gap="1" flexGrow="1">
          <Flex justify="between" align="center" gap="3">
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
              Bio
            </label>
            <Button
              type="button"
              size="1"
              variant="soft"
              loading={bioPending}
              onClick={onGenerateBio}
            >
              Draft with AI
            </Button>
          </Flex>
          <Text size="1" color="gray">
            Drafts from the fields above and this artist&apos;s works. Always review before saving —
            AI can be wrong about specifics.
          </Text>
          <TextArea {...register("bio")} rows={6} placeholder="Short biographical note" />
          {bioError && (
            <Text size="1" color="red">
              {bioError}
            </Text>
          )}
          {errors.bio?.message && (
            <Text size="1" color="red">
              {errors.bio.message}
            </Text>
          )}
        </Flex>

        <Flex gap="3" mt="2" justify="between">
          <Flex gap="3">
            <Button type="submit" loading={pending}>
              {artist ? "Save changes" : "Create artist"}
            </Button>
            <Button
              type="button"
              variant="soft"
              color="gray"
              onClick={() => (onCancel ? onCancel() : router.back())}
            >
              Cancel
            </Button>
          </Flex>
          {artist && (
            <Button type="button" variant="soft" color="red" onClick={onDelete} loading={pending}>
              Delete
            </Button>
          )}
        </Flex>
      </Flex>
    </form>
  );
}

// A verdict on one dealer-entered fact, shown inline beneath that field after an
// AI draft. Guidance only — it never mutates the field; she reconciles by hand.
const VERDICT_STYLE: Record<
  FactFinding["verdict"],
  { color: "green" | "amber" | "red"; icon: string; label: string }
> = {
  confirmed: { color: "green", icon: "✓", label: "AI: looks right" },
  unverified: { color: "amber", icon: "?", label: "AI: couldn't verify" },
  contradicted: { color: "red", icon: "⚠", label: "AI: may be wrong" },
};

function FactCheckNote({ label, finding }: { label: string; finding: FactFinding }) {
  const style = VERDICT_STYLE[finding.verdict];
  return (
    <Text size="1" color={style.color} aria-label={`${label} fact-check`}>
      {style.icon} {style.label}
      {finding.note ? ` — ${finding.note}` : ""}
    </Text>
  );
}

