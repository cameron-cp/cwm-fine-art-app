"use client";

import { Flex, Select, Text } from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/alert";
import type { AiFeature, AiProvider, SelectableModel } from "@/lib/ai/models";
import { updateAiModel } from "./actions";

export type AiModelRow = {
  feature: AiFeature;
  label: string;
  description: string;
  isCustom: boolean;
  // "default" or "<provider>:<model>" — the Select's current value.
  currentValue: string;
  // Human label of the model the default (env/code) resolves to.
  defaultLabel: string;
};

const PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

// Catalog grouped by provider for the Select's option groups.
function groupByProvider(catalog: SelectableModel[]) {
  const groups = new Map<AiProvider, SelectableModel[]>();
  for (const m of catalog) {
    const list = groups.get(m.provider) ?? [];
    list.push(m);
    groups.set(m.provider, list);
  }
  return [...groups.entries()];
}

function FeatureRow({
  row,
  catalog,
}: {
  row: AiModelRow;
  catalog: SelectableModel[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(row.currentValue);
  const groups = groupByProvider(catalog);

  function onChange(next: string) {
    setError(null);
    setValue(next);
    startTransition(async () => {
      const result = await updateAiModel({ feature: row.feature, value: next });
      if ("error" in result) {
        setError(result.error);
        setValue(row.currentValue); // revert the control on failure
        return;
      }
      router.refresh();
    });
  }

  return (
    <Flex
      justify="between"
      align="start"
      gap="4"
      py="3"
      style={{ borderTop: "1px solid var(--rule)" }}
    >
      <Flex direction="column" gap="1" style={{ maxWidth: "22rem" }}>
        <Text
          size="1"
          weight="medium"
          style={{ textTransform: "uppercase", letterSpacing: "0.14em" }}
        >
          {row.label}
        </Text>
        <Text size="1" color="gray" as="p">
          {row.description}
        </Text>
        {error ? <Alert tone="error">{error}</Alert> : null}
      </Flex>

      <Flex direction="column" align="end" gap="1">
        <Select.Root value={value} onValueChange={onChange} disabled={pending}>
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="default">Default ({row.defaultLabel})</Select.Item>
            {groups.map(([provider, models]) => (
              <Select.Group key={provider}>
                <Select.Label>{PROVIDER_LABELS[provider]}</Select.Label>
                {models.map((m) => (
                  <Select.Item key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`}>
                    {m.label}
                  </Select.Item>
                ))}
              </Select.Group>
            ))}
          </Select.Content>
        </Select.Root>
        <Text size="1" color="gray">
          {row.isCustom ? "Custom" : "Using default"}
        </Text>
      </Flex>
    </Flex>
  );
}

export function AiModelsForm({
  rows,
  catalog,
}: {
  rows: AiModelRow[];
  catalog: SelectableModel[];
}) {
  return (
    <Flex direction="column">
      {rows.map((row) => (
        <FeatureRow key={row.feature} row={row} catalog={catalog} />
      ))}
    </Flex>
  );
}
