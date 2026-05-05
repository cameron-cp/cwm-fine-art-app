import { Container, Heading } from "@radix-ui/themes";
import { ArtistForm } from "../artist-form";

export default function NewArtistPage() {
  return (
    <Container size="3" py="6">
      <Heading size="7" mb="5">
        New artist
      </Heading>
      <ArtistForm />
    </Container>
  );
}
