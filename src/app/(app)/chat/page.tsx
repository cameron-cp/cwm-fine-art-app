import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { ChatPanel } from "./chat-panel";

// "Ask" — the Registrar chat (docs/chat-agent.md). The conversation view
// pattern is documented in docs/design/design-system.md §Conversation.

export default function ChatPage() {
  return (
    <Container size="3" py="6">
      <Flex direction="column" gap="1" mb="6">
        <Heading size="8" weight="medium">
          Ask
        </Heading>
        <Text size="2" style={{ color: "var(--ink-3)" }}>
          Answers come from your own records — works, contacts, notes — and cite
          what they consulted. Stating a collector&rsquo;s interest records it.
        </Text>
      </Flex>
      <ChatPanel />
    </Container>
  );
}
