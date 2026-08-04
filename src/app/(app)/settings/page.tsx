import { Card, Container, Flex, Heading, Text } from "@radix-ui/themes";
import { StatusTag } from "@/components/status-tag";
import { SettingsForm } from "./settings-form";
import { AiModelsForm, type AiModelRow } from "./ai-models-form";
import {
  catalogEntry,
  FEATURE_META,
  resolveFeatureModel,
  selectableModels,
} from "@/lib/ai/models";
import { getAllFeatureModelStatus } from "@/lib/ai/settings";
import { getServerEnv } from "@/lib/env";
import type { InvoiceSettings } from "@/lib/schemas/invoice";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("invoice_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

  const env = getServerEnv();
  const stripeConfigured = Boolean(env.STRIPE_SECRET_KEY);
  const webhookConfigured = Boolean(env.STRIPE_WEBHOOK_SECRET);
  const anthropicConfigured = Boolean(env.ANTHROPIC_API_KEY);

  // AI models: current effective choice per feature + the catalog for the picker.
  const modelStatus = await getAllFeatureModelStatus(supabase);
  const catalog = selectableModels();
  const labelFor = (sel: { provider: "anthropic" | "openai" | "google"; model: string }) =>
    catalogEntry(sel)?.label ?? sel.model;
  const aiRows: AiModelRow[] = modelStatus.map((s) => ({
    feature: s.feature,
    label: FEATURE_META[s.feature].label,
    description: FEATURE_META[s.feature].description,
    isCustom: s.isCustom,
    currentValue: s.isCustom ? `${s.effective.provider}:${s.effective.model}` : "default",
    defaultLabel: labelFor(resolveFeatureModel(s.feature)),
  }));

  return (
    <Container size="3" py="6">
      <Heading size="7" mb="1">
        Invoice settings
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        Business header, wire/remittance details, and Terms &amp; Conditions.
        Each invoice snapshots these at creation, so editing here never changes an
        already-issued invoice.
      </Text>
      {data ? (
        <SettingsForm settings={data as InvoiceSettings} />
      ) : (
        <Text color="red">Settings row missing — run migration 0007.</Text>
      )}

      <Heading size="4" mt="7" mb="2">
        Payments (Stripe)
      </Heading>
      <Card>
        <Flex direction="column" gap="2">
          <Flex align="center" gap="2">
            <Text size="2">API key</Text>
            <StatusTag tone={stripeConfigured ? "positive" : "muted"}>
              {stripeConfigured ? "Configured" : "Not configured"}
            </StatusTag>
          </Flex>
          <Flex align="center" gap="2">
            <Text size="2">Webhook secret</Text>
            <StatusTag tone={webhookConfigured ? "positive" : "muted"}>
              {webhookConfigured ? "Configured" : "Not configured"}
            </StatusTag>
          </Flex>
          <Text size="1" color="gray">
            Keys are managed in Doppler. ACH and the Billing Portal each require a
            one-time Stripe dashboard setup (see .env.example). No secrets are
            shown here.
          </Text>
        </Flex>
      </Card>

      <Heading size="4" mt="7" mb="2">
        AI models
      </Heading>
      <Text color="gray" size="2" mb="3" as="p">
        Choose which model powers each AI feature. “Default” uses the built-in
        choice (currently Claude Opus 4.8 for every feature); pick a specific
        model to override just that one.
      </Text>
      <Card>
        {anthropicConfigured ? null : (
          <Flex mb="2">
            <StatusTag tone="muted">
              ANTHROPIC_API_KEY not configured — AI features are inactive
            </StatusTag>
          </Flex>
        )}
        <AiModelsForm rows={aiRows} catalog={catalog} />
      </Card>

      <Heading size="4" mt="7" mb="2">
        Data sources
      </Heading>
      <Card>
        <Text size="1" color="gray" as="p">
          Artist lookup data: Getty ULAN (ODC-BY) and Wikidata (CC0). Used to
          prefill artist details for review; every field remains editable before
          saving.
        </Text>
      </Card>
    </Container>
  );
}
