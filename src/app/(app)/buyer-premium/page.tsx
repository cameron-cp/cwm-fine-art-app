import { Container, Flex, Heading, Text } from "@radix-ui/themes";
import { AuctionCalculator } from "./auction-calculator";

export const metadata = { title: "Buyer's premium" };

export default function BuyerPremiumPage() {
  return (
    <Container size="4" py="6">
      <Flex direction="column" gap="2" mb="5">
        <Heading size="7">Auction buyer&apos;s premium</Heading>
        <Text size="2" color="gray">
          What a client would pay at Christie&apos;s, Sotheby&apos;s, or Phillips. Tiered rates apply on a
          marginal basis. Per-lot is how auction houses actually charge; aggregate is for what-if comparisons.
        </Text>
      </Flex>
      <AuctionCalculator />
    </Container>
  );
}
