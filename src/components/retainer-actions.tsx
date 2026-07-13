"use client";

import { Button, Flex } from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import { useState, useTransition } from "react";
import {
  cancelRetainer,
  reconcileRetainer,
} from "@/app/(app)/retainers/actions";

// Cancel + manual-reconcile controls on the retainer detail page.
export function RetainerActions({
  id,
  canCancel,
}: {
  id: string;
  canCancel: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function run(action: () => Promise<{ error: string } | { data: unknown }>) {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await action();
      if ("error" in res) setError(res.error);
    });
  }

  return (
    <Flex direction="column" gap="2" mt="4">
      <Flex gap="3" align="center">
        <Button
          variant="outline"
          loading={pending}
          onClick={() =>
            run(async () => {
              const res = await reconcileRetainer(id);
              if ("data" in res) setInfo(`Status: ${res.data.status}.`);
              return res;
            })
          }
        >
          Check Stripe status
        </Button>
        {canCancel && (
          <Button
            color="red"
            variant="soft"
            loading={pending}
            onClick={() => run(() => cancelRetainer(id))}
          >
            Cancel retainer
          </Button>
        )}
      </Flex>
      {info && <Alert tone="success">{info}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
    </Flex>
  );
}
