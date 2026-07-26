import { Container, Heading, Text } from "@radix-ui/themes";
import { RetainerForm } from "../retainer-form";
import { onlyContactableParties } from "@/lib/parties/contactable";
import { getSupabaseServer } from "@/lib/supabase/server";

export default async function NewRetainerPage() {
  const supabase = getSupabaseServer();
  // A retainer charges a saved card, which an unidentified holder (0022) can
  // never have — the DB CHECK bars it. Keep it out of the picker too.
  const { data } = await onlyContactableParties(
    supabase.from("parties").select("id, display_name, email"),
  ).order("display_name");
  const parties = (data ?? []) as {
    id: string;
    display_name: string;
    email: string | null;
  }[];

  return (
    <Container size="2" py="6">
      <Heading size="7" mb="1">
        New retainer
      </Heading>
      <Text color="gray" size="2" mb="5" as="p">
        A retainer is a Stripe subscription that auto-charges the contact&rsquo;s
        card or bank on a schedule. They complete a one-time Stripe checkout to
        authorize it.
      </Text>
      {parties.length === 0 ? (
        <Text color="red">Add a contact first.</Text>
      ) : (
        <RetainerForm parties={parties} />
      )}
    </Container>
  );
}
