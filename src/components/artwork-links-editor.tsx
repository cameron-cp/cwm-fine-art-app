"use client";

import { Button, Flex, Heading, IconButton, Select, Text, TextArea, TextField } from "@radix-ui/themes";
import Image from "next/image";
import Link from "next/link";
import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  linkArtworkToParty,
  unlinkArtworkFromParty,
} from "@/app/(app)/contacts/artwork-party-actions";
import { Alert } from "@/components/alert";
import { Field } from "@/components/field";
import { describeLink, isCurrent } from "@/lib/artwork-parties/summarize";
import {
  ARTWORK_PARTY_CONFIDENCE_LABELS,
  ARTWORK_PARTY_ROLE_HINTS,
  ARTWORK_PARTY_ROLE_LABELS,
  artworkPartyConfidences,
  artworkPartyRoles,
  artworkPartySchema,
  artworkPartySources,
  ARTWORK_PARTY_SOURCE_LABELS,
  type ArtworkPartyConfidence,
  type ArtworkPartyRole,
  type ArtworkPartyRow,
  type ArtworkPartySource,
} from "@/lib/schemas/artwork-party";
import { formatPriceCents } from "@/lib/supabase/storage";

// A contact's links to works — the collection they hold, plus the works they
// advise on, consigned, or are otherwise attached to. Ordering and the summary
// sentence are computed server-side by lib/artwork-parties/summarize.
//
// Rows use the "ledger" treatment (hairline rules, no cards) rather than the
// Card stack the interests editor uses: this is a list of works, so it should
// read like the inventory table it links into.

/** A row plus the signed thumbnail URL, which only the server can mint. */
export type ArtworkLinkView = ArtworkPartyRow & { imageUrl: string | null };

/** Pre-formatted picker entries; `label` is the datalist key, so it is unique. */
export type ArtworkOption = { id: string; label: string };

type Draft = {
  label: string;
  role: ArtworkPartyRole;
  source: ArtworkPartySource;
  confidence: ArtworkPartyConfidence;
  started_on: string;
  ended_on: string;
  notes: string;
};

function emptyDraft(): Draft {
  return {
    label: "",
    role: "owner",
    source: "stated",
    confidence: "confirmed",
    started_on: "",
    ended_on: "",
    notes: "",
  };
}

export function ArtworkLinksEditor({
  partyId,
  contactName,
  links,
  summary,
  artworkOptions,
}: {
  partyId: string;
  contactName: string;
  links: ArtworkLinkView[];
  summary: string;
  artworkOptions: ArtworkOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const listId = useId();

  // The datalist gives type-ahead over the whole inventory for free; this maps
  // the chosen label back to the id the schema actually wants.
  const idByLabel = useMemo(
    () => new Map(artworkOptions.map((o) => [o.label, o.id])),
    [artworkOptions],
  );

  function openAdd() {
    setError(null);
    setDraft(emptyDraft());
    setAdding(true);
  }

  function submit() {
    const artworkId = idByLabel.get(draft.label.trim());
    if (!artworkId) {
      setError("Pick a work from the list.");
      return;
    }
    const input = {
      artwork_id: artworkId,
      role: draft.role,
      source: draft.source,
      confidence: draft.confidence,
      started_on: draft.started_on,
      ended_on: draft.ended_on,
      notes: draft.notes,
    };
    const parsed = artworkPartySchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid link");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await linkArtworkToParty(partyId, input);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setAdding(false);
      setDraft(emptyDraft());
      router.refresh();
    });
  }

  function onDelete(row: ArtworkLinkView) {
    const title = row.artwork?.title ?? "this work";
    const role = ARTWORK_PARTY_ROLE_LABELS[row.role].toLowerCase();
    if (!confirm(`Remove ${contactName} as ${role} of “${title}”?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await unlinkArtworkFromParty(row.id, partyId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Flex direction="column" gap="3" mt="7">
      <Flex justify="between" align="center">
        <Heading size="4">Works</Heading>
        {!adding && (
          <Button variant="soft" size="1" onClick={openAdd}>
            Link a work
          </Button>
        )}
      </Flex>

      {summary && (
        <Text size="2" color="gray">
          {summary}
        </Text>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      {links.length === 0 && !adding ? (
        <Text color="gray" size="2">
          No works linked yet. Record the pieces this contact owns — or the works
          they advise on, consigned, or are otherwise attached to.
        </Text>
      ) : (
        <div className="border border-[var(--rule)]">
          {links.map((row, i) => (
            <ArtworkLinkRow
              key={row.id}
              row={row}
              first={i === 0}
              disabled={pending}
              onDelete={() => onDelete(row)}
            />
          ))}
        </div>
      )}

      {adding && (
        <div className="border border-[var(--rule)] bg-[var(--paper-2)] p-4">
          <Flex direction="column" gap="3">
            <Field label="Work" required>
              <TextField.Root
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="Start typing an artist or title…"
                list={listId}
                autoFocus
              />
              <datalist id={listId}>
                {artworkOptions.map((o) => (
                  <option key={o.id} value={o.label} />
                ))}
              </datalist>
            </Field>

            <Flex gap="3" wrap="wrap">
              <Field label="Role" hint={ARTWORK_PARTY_ROLE_HINTS[draft.role]}>
                <Select.Root
                  value={draft.role}
                  onValueChange={(v) => setDraft({ ...draft, role: v as ArtworkPartyRole })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    {artworkPartyRoles.map((r) => (
                      <Select.Item key={r} value={r}>
                        {ARTWORK_PARTY_ROLE_LABELS[r]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>

              <Field label="Source">
                <Select.Root
                  value={draft.source}
                  onValueChange={(v) => setDraft({ ...draft, source: v as ArtworkPartySource })}
                >
                  <Select.Trigger />
                  <Select.Content>
                    {artworkPartySources.map((s) => (
                      <Select.Item key={s} value={s}>
                        {ARTWORK_PARTY_SOURCE_LABELS[s]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>

              <Field label="Confidence">
                <Select.Root
                  value={draft.confidence}
                  onValueChange={(v) =>
                    setDraft({ ...draft, confidence: v as ArtworkPartyConfidence })
                  }
                >
                  <Select.Trigger />
                  <Select.Content>
                    {artworkPartyConfidences.map((c) => (
                      <Select.Item key={c} value={c}>
                        {ARTWORK_PARTY_CONFIDENCE_LABELS[c]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>
            </Flex>

            <Flex gap="3" wrap="wrap">
              <Field label="From" hint="Leave blank if unknown">
                <TextField.Root
                  type="date"
                  value={draft.started_on}
                  onChange={(e) => setDraft({ ...draft, started_on: e.target.value })}
                  className="num"
                />
              </Field>
              <Field label="Until" hint="Set only if the link has ended">
                <TextField.Root
                  type="date"
                  value={draft.ended_on}
                  onChange={(e) => setDraft({ ...draft, ended_on: e.target.value })}
                  className="num"
                />
              </Field>
            </Flex>

            <Field label="Note (optional)">
              <TextArea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Bought at Christie's; hangs in the Aspen house."
                rows={2}
              />
            </Field>

            <Flex gap="3">
              <Button onClick={submit} loading={pending}>
                Link work
              </Button>
              <Button
                variant="soft"
                color="gray"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </Flex>
          </Flex>
        </div>
      )}
    </Flex>
  );
}

function ArtworkLinkRow({
  row,
  first,
  disabled,
  onDelete,
}: {
  row: ArtworkLinkView;
  first: boolean;
  disabled: boolean;
  onDelete: () => void;
}) {
  const work = row.artwork;
  const open = isCurrent(row);
  // Closed links stay legible but step back a tone — the byline carries the dates.
  const artistColor = open ? "var(--ink)" : "var(--ink-2)";

  const detail = [work?.medium, work?.edition].filter(Boolean).join(" · ");

  return (
    <div
      className={`flex items-start gap-4 p-3 transition-colors hover:bg-[var(--paper-2)] ${
        first ? "" : "border-t border-[var(--rule)]"
      }`}
    >
      {/* Passe-partout mount: a mat inside a hairline frame, never a shadow. */}
      <div className="shrink-0 border border-[var(--rule)] bg-[var(--paper)] p-[5px]">
        {row.imageUrl ? (
          <Image
            src={row.imageUrl}
            alt=""
            width={56}
            height={56}
            className="h-14 w-14 object-cover"
            unoptimized
          />
        ) : (
          <div className="h-14 w-14 bg-[var(--paper-3)]" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {work ? (
          <Link href={`/artworks/${work.id}`} className="group block">
            <div
              className="font-serif text-[16px] font-semibold leading-tight"
              style={{ color: artistColor }}
            >
              {work.artist_name ?? "—"}
            </div>
            <div className="font-serif text-[14px] italic leading-snug text-[var(--ink-2)] group-hover:text-[var(--ink)] group-hover:underline">
              {work.title}
              {work.year ? <span className="not-italic">, {work.year}</span> : null}
            </div>
          </Link>
        ) : (
          <Text size="2" color="gray">
            Work no longer on file
          </Text>
        )}

        {detail && (
          <div className="mt-[3px] text-[10.5px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
            {detail}
          </div>
        )}

        {work?.price_cents != null && (
          <div className="num mt-[3px] text-[13px] text-[var(--ink-2)]">
            {formatPriceCents(work.price_cents, work.currency)}
          </div>
        )}

        {row.notes && (
          <Text as="p" size="1" color="gray" mt="1">
            {row.notes}
          </Text>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <span className="whitespace-nowrap border border-[var(--rule-2)] px-[7px] py-[2px] text-[10px] uppercase tracking-[0.14em] text-[var(--ink-2)]">
          {describeLink(row)}
        </span>
        <IconButton
          variant="ghost"
          color="red"
          size="1"
          onClick={onDelete}
          disabled={disabled}
          aria-label={`Unlink ${work?.title ?? "work"}`}
        >
          ✕
        </IconButton>
      </div>
    </div>
  );
}
