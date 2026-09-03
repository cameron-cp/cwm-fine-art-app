import { Container, Heading, Text } from "@radix-ui/themes";
import { notFound } from "next/navigation";
import { RetainerForm } from "../../retainer-form";
import type { Retainer } from "@/lib/schemas/stripe";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function EditRetainerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServer();

  const { data: row } = await supabase
    .from("retainers")
    .select("*, party:parties(display_name)")
    .eq("id", id)
    .maybeSingle();
  if (!row) notFound();
  const retainer = row as Pick<
    Retainer,
    | "id"
    | "status"
    | "stripe_subscription_id"
    | "amount_cents"
    | "billing_interval"
    | "description"
  > & { party: { display_name: string } | null };

  return (
    <Container size="2" py="6">
      <Heading size="7" mb="1">
        Edit retainer
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        {retainer.party?.display_name ?? "This contact"} keeps the same saved
        payment method — they do not re-authorize anything. The subscriber cannot
        be changed here; move a retainer to another contact by canceling this one
        and starting a new one.
      </Text>
      {/* The contact picker is the create-mode affordance; edit passes none. */}
      <RetainerForm
        parties={[]}
        retainer={{
          id: retainer.id,
          amount_cents: retainer.amount_cents,
          billing_interval: retainer.billing_interval,
          description: retainer.description,
          isLive: Boolean(retainer.stripe_subscription_id),
        }}
      />
    </Container>
  );
}
