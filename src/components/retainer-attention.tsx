import { Link, Text } from "@radix-ui/themes";
import NextLink from "next/link";

export type AttentionContact = {
  id: string;
  display_name: string;
  email: string | null;
};

// "Attn: <person>" for a retainer whose payer is a company.
//
// The heading above it is the PAYER (Detroit Design District — whose card pays
// and whose name is on the receipt); this is the human on the thread (Amelia
// Patt-Zamir). Exactly the distinction invoices already draw between
// bill_to_name and bill_to_attention.
//
// Shared by the retainer detail page so the line reads identically wherever it
// appears, and so it is testable on its own — both pages are async server
// components. Renders nothing at all when there's no attention contact, which is
// the common one-person retainer.
export function RetainerAttention({
  attention,
}: {
  attention: AttentionContact | null;
}) {
  if (!attention) return null;

  return (
    <Text color="gray" size="2" as="p">
      Attn:{" "}
      <Link asChild size="2">
        <NextLink href={`/contacts/${attention.id}`}>
          {attention.display_name}
        </NextLink>
      </Link>
      {attention.email ? (
        <span className="num"> · {attention.email}</span>
      ) : null}
    </Text>
  );
}
