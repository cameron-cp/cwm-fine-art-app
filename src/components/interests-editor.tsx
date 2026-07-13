"use client";

import {
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  IconButton,
  Select,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Field } from "@/components/field";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { addInterest, deleteInterest } from "@/app/(app)/contacts/interests-actions";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { resolveInterestValue } from "@/lib/interests/resolve";
import {
  INTEREST_CONFIDENCE_LABELS,
  INTEREST_DIMENSION_LABELS,
  INTEREST_SENTIMENT_LABELS,
  INTEREST_SOURCE_LABELS,
  interestConfidences,
  interestDimensions,
  interestSchema,
  interestSentiments,
  interestSources,
  type InterestDimension,
  type InterestRow,
  type InterestSentiment,
} from "@/lib/schemas/interest";

type ArtistOption = { id: string; name: string };

// UI-only sentinel for the "Add nationality…"/artist empty state (resolved before Zod).
const ADD = "__add__";

type Draft = {
  dimension: InterestDimension;
  sentiment: InterestSentiment;
  source: (typeof interestSources)[number];
  confidence: (typeof interestConfidences)[number];
  artist_id: string;
  value: string;
  price_min: string;
  price_max: string;
  qualifier: string;
};

function emptyDraft(): Draft {
  return {
    dimension: "artist",
    sentiment: "seeking",
    source: "stated",
    confidence: "confirmed",
    artist_id: "",
    value: "",
    price_min: "",
    price_max: "",
    qualifier: "",
  };
}

// Map the draft to the schema's input shape, sending only the fields this dimension
// uses (the coercers turn "" into null). Kept in one place so client-side validation
// and the server action see the exact same payload.
function draftToInput(d: Draft) {
  const isArtist = d.dimension === "artist";
  const isPrice = d.dimension === "price_band";
  return {
    dimension: d.dimension,
    sentiment: d.sentiment,
    source: d.source,
    confidence: d.confidence,
    artist_id: isArtist ? d.artist_id : "",
    value: !isArtist && !isPrice ? d.value : "",
    price_min_cents: isPrice ? d.price_min : "",
    price_max_cents: isPrice ? d.price_max : "",
    qualifier: d.qualifier,
  };
}

export function InterestsEditor({
  partyId,
  interests,
  summary,
  artists,
  mediumSuggestions,
}: {
  partyId: string;
  interests: InterestRow[];
  summary: string;
  artists: ArtistOption[];
  mediumSuggestions: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const mediumListId = useId();

  function openAdd() {
    setError(null);
    setDraft(emptyDraft());
    setAdding(true);
  }

  function submit() {
    const input = draftToInput(draft);
    const parsed = interestSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid interest");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addInterest(partyId, input);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setAdding(false);
      setDraft(emptyDraft());
      router.refresh();
    });
  }

  function onDelete(row: InterestRow) {
    const { label } = resolveInterestValue(row);
    if (!confirm(`Remove "${label}" from this collector's interests?`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteInterest(row.id, partyId);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  const isArtist = draft.dimension === "artist";
  const isPrice = draft.dimension === "price_band";
  const isNationality = draft.dimension === "nationality";
  const isFreeText = !isArtist && !isPrice && !isNationality;

  return (
    <Flex direction="column" gap="3" mt="7">
      <Flex justify="between" align="center">
        <Heading size="4">Areas of interest</Heading>
        {!adding && (
          <Button variant="soft" size="1" onClick={openAdd}>
            Add interest
          </Button>
        )}
      </Flex>

      {summary && (
        <Text size="2" color="gray">
          {summary}
        </Text>
      )}

      {error && (
        <Callout.Root color="red">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {interests.length === 0 && !adding ? (
        <Text color="gray" size="2">
          Nothing recorded yet. Capture the artists, media, eras, movements,
          nationalities, subjects, or price ranges this collector is drawn to.
        </Text>
      ) : (
        <Flex direction="column" gap="2">
          {interests.map((row) => {
            const { label } = resolveInterestValue(row);
            return (
              <Card key={row.id}>
                <Flex justify="between" align="center" gap="3">
                  <Flex align="center" gap="2" wrap="wrap">
                    <span className="inline-block border border-[var(--rule-2)] px-[7px] py-[2px] text-[10px] uppercase tracking-[0.12em] text-[var(--ink-2)]">
                      {INTEREST_SENTIMENT_LABELS[row.sentiment]}
                    </span>
                    <Text size="2" weight="medium">
                      {label}
                    </Text>
                    <Text size="1" color="gray">
                      {INTEREST_DIMENSION_LABELS[row.dimension]}
                      {row.qualifier ? ` · ${row.qualifier}` : ""}
                      {row.confidence !== "confirmed"
                        ? ` · ${INTEREST_CONFIDENCE_LABELS[row.confidence]}`
                        : ""}
                    </Text>
                  </Flex>
                  <IconButton
                    variant="ghost"
                    color="red"
                    size="1"
                    onClick={() => onDelete(row)}
                    disabled={pending}
                    aria-label={`Remove ${label}`}
                  >
                    ✕
                  </IconButton>
                </Flex>
              </Card>
            );
          })}
        </Flex>
      )}

      {adding && (
        <Card>
          <Flex direction="column" gap="3">
            <Flex gap="3" wrap="wrap">
              <Field label="Dimension">
                <Select.Root
                  value={draft.dimension}
                  onValueChange={(v) =>
                    setDraft({ ...draft, dimension: v as InterestDimension })
                  }
                >
                  <Select.Trigger />
                  <Select.Content>
                    {interestDimensions.map((d) => (
                      <Select.Item key={d} value={d}>
                        {INTEREST_DIMENSION_LABELS[d]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>

              <Field label="Sentiment">
                <Select.Root
                  value={draft.sentiment}
                  onValueChange={(v) =>
                    setDraft({ ...draft, sentiment: v as InterestSentiment })
                  }
                >
                  <Select.Trigger />
                  <Select.Content>
                    {interestSentiments.map((s) => (
                      <Select.Item key={s} value={s}>
                        {INTEREST_SENTIMENT_LABELS[s]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>
            </Flex>

            {/* Value input swaps by dimension. */}
            {isArtist && (
              <Field label="Artist">
                <Select.Root
                  value={draft.artist_id || ADD}
                  onValueChange={(v) =>
                    setDraft({ ...draft, artist_id: v === ADD ? "" : v })
                  }
                >
                  <Select.Trigger placeholder="Select artist…" />
                  <Select.Content>
                    <Select.Item value={ADD} disabled>
                      Select artist…
                    </Select.Item>
                    {artists.map((a) => (
                      <Select.Item key={a.id} value={a.id}>
                        {a.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>
            )}

            {isNationality && (
              <Field label="Nationality">
                <Select.Root
                  value={draft.value || ADD}
                  onValueChange={(v) =>
                    setDraft({ ...draft, value: v === ADD ? "" : v })
                  }
                >
                  <Select.Trigger placeholder="Select country…" />
                  <Select.Content>
                    <Select.Item value={ADD} disabled>
                      Select country…
                    </Select.Item>
                    {COUNTRY_OPTIONS.map((o) => (
                      <Select.Item key={o.code} value={o.code}>
                        {o.name}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>
            )}

            {isFreeText && (
              <Field label={INTEREST_DIMENSION_LABELS[draft.dimension]}>
                <TextField.Root
                  value={draft.value}
                  onChange={(e) => setDraft({ ...draft, value: e.target.value })}
                  placeholder={
                    draft.dimension === "medium"
                      ? "Oil on canvas"
                      : draft.dimension === "movement"
                        ? "Abstract Expressionism"
                        : ""
                  }
                  list={draft.dimension === "medium" ? mediumListId : undefined}
                />
                {draft.dimension === "medium" && mediumSuggestions.length > 0 && (
                  <datalist id={mediumListId}>
                    {mediumSuggestions.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )}
              </Field>
            )}

            {isPrice && (
              <Flex gap="3">
                <Field label="Min price">
                  <TextField.Root
                    value={draft.price_min}
                    onChange={(e) => setDraft({ ...draft, price_min: e.target.value })}
                    placeholder="$5,000"
                  />
                </Field>
                <Field label="Max price">
                  <TextField.Root
                    value={draft.price_max}
                    onChange={(e) => setDraft({ ...draft, price_max: e.target.value })}
                    placeholder="$50,000"
                  />
                </Field>
              </Flex>
            )}

            <Flex gap="3" wrap="wrap">
              <Field label="Source">
                <Select.Root
                  value={draft.source}
                  onValueChange={(v) =>
                    setDraft({ ...draft, source: v as Draft["source"] })
                  }
                >
                  <Select.Trigger />
                  <Select.Content>
                    {interestSources.map((s) => (
                      <Select.Item key={s} value={s}>
                        {INTEREST_SOURCE_LABELS[s]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>

              <Field label="Confidence">
                <Select.Root
                  value={draft.confidence}
                  onValueChange={(v) =>
                    setDraft({ ...draft, confidence: v as Draft["confidence"] })
                  }
                >
                  <Select.Trigger />
                  <Select.Content>
                    {interestConfidences.map((c) => (
                      <Select.Item key={c} value={c}>
                        {INTEREST_CONFIDENCE_LABELS[c]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Field>
            </Flex>

            <Field label="Qualifier (optional)">
              <TextField.Root
                value={draft.qualifier}
                onChange={(e) => setDraft({ ...draft, qualifier: e.target.value })}
                placeholder="early works only, no prints"
              />
            </Field>

            <Flex gap="3">
              <Button onClick={submit} loading={pending}>
                Add interest
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
        </Card>
      )}
    </Flex>
  );
}

// Local label wrapper — the app's per-form convention (copied, not shared).
