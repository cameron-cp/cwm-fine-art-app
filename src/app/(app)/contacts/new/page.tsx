import { Container, Heading } from "@radix-ui/themes";
import { ContactForm } from "../contact-form";

export default function NewContactPage() {
  return (
    <Container size="3" py="6">
      <Heading size="7" mb="5">
        New contact
      </Heading>
      <ContactForm />
    </Container>
  );
}
