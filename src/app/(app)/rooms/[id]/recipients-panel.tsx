"use client";

import { Button, Flex, Select, Text, TextField } from "@radix-ui/themes";
import { useState } from "react";
import { Alert } from "@/components/alert";
import { StatusTag } from "@/components/status-tag";
import { generateRecipient, revokeRecipient, sendInvite } from "../actions";

export type RecipientView = {
  id: string;
  label: string | null;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  partyName: string;
  partyEmail: string | null;
};

type Contact = { id: string; name: string; email: string | null };

const NONE = "__none__";

function linkFor(appUrl: string, token: string): string {
  const base = appUrl || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/room/${token}`;
}

function recipientState(r: RecipientView): { tone: "positive" | "warning" | "muted"; label: string } {
  if (r.revokedAt) return { tone: "muted", label: "Revoked" };
  if (r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now())
    return { tone: "warning", label: "Expired" };
  if (r.firstViewedAt) return { tone: "positive", label: "Viewed" };
  return { tone: "warning", label: "Not opened" };
}

export function RecipientsPanel({
  roomId,
  recipients,
  contacts,
  appUrl,
}: {
  roomId: string;
  recipients: RecipientView[];
  contacts: Contact[];
  appUrl: string;
}) {
  const [partyId, setPartyId] = useState<string>(NONE);
  const [expiresAt, setExpiresAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function add() {
    if (partyId === NONE) {
      setError("Pick a contact.");
      return;
    }
    setBusy("add");
    setError(null);
    // <input type="datetime-local"> gives "YYYY-MM-DDTHH:mm" (no zone); treat as
    // local and hand an ISO string with offset to the schema.
    const iso = expiresAt ? new Date(expiresAt).toISOString() : "";
    const res = await generateRecipient(roomId, {
      party_id: partyId,
      label: "",
      expires_at: iso,
    });
    setBusy(null);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    setPartyId(NONE);
    setExpiresAt("");
  }

  async function copy(token: string) {
    try {
      await navigator.clipboard.writeText(linkFor(appUrl, token));
      setCopied(token);
      setTimeout(() => setCopied((c) => (c === token ? null : c)), 1500);
    } catch {
      setError("Couldn't copy — select and copy the link manually.");
    }
  }

  async function run(key: string, fn: () => Promise<{ error?: string } | unknown>) {
    setBusy(key);
    setError(null);
    const res = (await fn()) as { error?: string };
    setBusy(null);
    if (res && "error" in res && res.error) setError(res.error);
  }

  return (
    <Flex direction="column" gap="4">
      {error && <Alert tone="error">{error}</Alert>}

      {recipients.length === 0 ? (
        <Text size="2" style={{ color: "var(--ink-3)" }}>
          No recipients yet. Add a contact to mint a private link.
        </Text>
      ) : (
        <Flex direction="column" gap="3">
          {recipients.map((r) => {
            const st = recipientState(r);
            const active = !r.revokedAt;
            return (
              <Flex
                key={r.id}
                direction="column"
                gap="2"
                className="border-b border-[var(--rule)] pb-3"
              >
                <Flex justify="between" align="center" gap="3">
                  <span className="font-serif text-[15px] font-semibold text-[var(--ink)]">
                    {r.partyName}
                  </span>
                  <StatusTag tone={st.tone}>{st.label}</StatusTag>
                </Flex>
                {active && (
                  <Flex gap="2" align="center" wrap="wrap">
                    <Button size="1" variant="soft" color="gray" onClick={() => copy(r.token)}>
                      {copied === r.token ? "Copied" : "Copy link"}
                    </Button>
                    <Button
                      size="1"
                      variant="ghost"
                      disabled={!r.partyEmail || busy === `inv-${r.id}`}
                      loading={busy === `inv-${r.id}`}
                      onClick={() => run(`inv-${r.id}`, () => sendInvite(r.id))}
                    >
                      Send invite
                    </Button>
                    <Button
                      size="1"
                      variant="ghost"
                      color="gray"
                      disabled={busy === `rev-${r.id}`}
                      onClick={() => run(`rev-${r.id}`, () => revokeRecipient(r.id, roomId))}
                    >
                      Revoke
                    </Button>
                  </Flex>
                )}
                {!r.partyEmail && active && (
                  <Text size="1" style={{ color: "var(--ink-3)" }}>
                    No email on file — add one to this contact to send an invite.
                  </Text>
                )}
              </Flex>
            );
          })}
        </Flex>
      )}

      <Flex
        direction="column"
        gap="3"
        className="border border-[var(--rule)] bg-[var(--paper-2)] p-3"
      >
        <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-3)]">
          Add recipient
        </Text>
        <Select.Root value={partyId} onValueChange={setPartyId}>
          <Select.Trigger placeholder="Choose a contact…" />
          <Select.Content>
            <Select.Item value={NONE}>Choose a contact…</Select.Item>
            {contacts.map((c) => (
              <Select.Item key={c.id} value={c.id}>
                {c.name}
                {c.email ? "" : " (no email)"}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <label>
          <Text as="div" mb="1" size="1" style={{ color: "var(--ink-3)" }}>
            Expires (optional)
          </Text>
          <TextField.Root
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
        <div>
          <Button loading={busy === "add"} onClick={add}>
            Generate link
          </Button>
        </div>
      </Flex>
    </Flex>
  );
}
