import { Box, Container, Heading } from "@radix-ui/themes";
import Link from "next/link";
import { RoomForm } from "../room-form";

export default function NewRoomPage() {
  return (
    <Container size="3" py="6">
      <Box mb="5">
        <Link
          href="/rooms"
          className="text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)] hover:text-[var(--ink)]"
        >
          ← All rooms
        </Link>
        <Heading size="7" weight="medium" mt="2">
          New viewing room
        </Heading>
      </Box>
      <RoomForm />
    </Container>
  );
}
