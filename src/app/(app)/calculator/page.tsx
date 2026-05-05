import { Container, Heading, Text, Flex } from "@radix-ui/themes";
import { Calculator } from "./calculator";

export const metadata = { title: "Fee calculator" };

export default function CalculatorPage() {
  return (
    <Container size="4" py="6">
      <Flex direction="column" gap="2" mb="5">
        <Heading size="7">Fee calculator</Heading>
        <Text size="2" color="gray">
          Private sale — 20% up to $250K, 10% to $2.5M, 7.5% to $5M, 5% above. Auction — flat 10%.
          Tiered rates apply on a marginal basis.
        </Text>
      </Flex>
      <Calculator />
    </Container>
  );
}
