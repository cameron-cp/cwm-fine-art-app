import { Container, Heading } from "@radix-ui/themes";
import { InvoiceForm } from "../invoice-form";
import { getInvoiceFormOptions } from "../options";

export default async function NewInvoicePage() {
  const { artworkOptions, partyOptions } = await getInvoiceFormOptions();
  return (
    <Container size="4" py="6">
      <Heading size="7" mb="5">
        New invoice
      </Heading>
      <InvoiceForm artworks={artworkOptions} parties={partyOptions} />
    </Container>
  );
}
