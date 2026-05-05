"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Callout, Flex, Text, TextArea, TextField } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import {
  artistSchema,
  type Artist,
  type ArtistFormInput,
  type ArtistInput,
} from "@/lib/schemas/artist";
import { createArtist, deleteArtist, updateArtist } from "./actions";

type Props = { artist?: Artist };

export function ArtistForm({ artist }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ArtistFormInput, unknown, ArtistInput>({
    resolver: zodResolver(artistSchema),
    defaultValues: {
      name: artist?.name ?? "",
      birth_year: artist?.birth_year ?? null,
      death_year: artist?.death_year ?? null,
      nationality: artist?.nationality ?? null,
      bio: artist?.bio ?? null,
    },
  });

  function onSubmit(values: ArtistInput) {
    setError(null);
    startTransition(async () => {
      const result = artist ? await updateArtist(artist.id, values) : await createArtist(values);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push("/artists");
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
          <Callout.Root color="red">
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        <Field label="Name" error={errors.name?.message} required>
          <TextField.Root {...register("name")} placeholder="e.g. Agnes Martin" />
        </Field>

        <Flex gap="3">
          <Field label="Birth year" error={errors.birth_year?.message}>
            <TextField.Root type="number" {...register("birth_year")} placeholder="1912" />
          </Field>
          <Field label="Death year" error={errors.death_year?.message}>
            <TextField.Root type="number" {...register("death_year")} placeholder="2004" />
          </Field>
        </Flex>

        <Field label="Nationality" error={errors.nationality?.message}>
          <TextField.Root {...register("nationality")} placeholder="American" />
        </Field>

        <Field label="Bio" error={errors.bio?.message}>
          <TextArea {...register("bio")} rows={5} placeholder="Short biographical note" />
        </Field>

        <Flex gap="3" mt="2" justify="between">
          <Flex gap="3">
            <Button type="submit" loading={pending}>
              {artist ? "Save changes" : "Create artist"}
            </Button>
            <Button type="button" variant="soft" color="gray" onClick={() => router.back()}>
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

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Flex direction="column" gap="1" flexGrow="1">
      <Text as="label" size="2" weight="medium">
        {label}
        {required && <Text color="red"> *</Text>}
      </Text>
      {children}
      {error && (
        <Text size="1" color="red">
          {error}
        </Text>
      )}
    </Flex>
  );
}
