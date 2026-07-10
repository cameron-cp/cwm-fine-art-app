import { Container, Heading, Text } from "@radix-ui/themes";
import { SettingsForm } from "./settings-form";
import type { InvoiceSettings } from "@/lib/schemas/invoice";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = getSupabaseServer();
  const { data } = await supabase
    .from("invoice_settings")
    .select("*")
    .eq("singleton", true)
    .maybeSingle();

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
    </Container>
  );
}
