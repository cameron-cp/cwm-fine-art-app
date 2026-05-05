import { SignUp } from "@clerk/nextjs";
import { Flex } from "@radix-ui/themes";

export default function Page() {
  return (
    <Flex align="center" justify="center" className="min-h-screen" p="6">
      <SignUp />
    </Flex>
  );
}
