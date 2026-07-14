"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Button, TextArea } from "@radix-ui/themes";
import { Alert } from "@/components/alert";
import type { ToolEvent } from "@/lib/chat/agent";
import type { RecordRef } from "@/lib/chat/tools";

// Conversation view (design-system §Conversation): no bubbles — turns are
// hairline-ruled entries on the plaster ground, speaker as letterspaced
// micro-caps, the citation trail beneath each answer. Send is the view's one
// claret action.

type Turn = {
  role: "user" | "assistant";
  content: string;
  toolEvents?: ToolEvent[];
};

const MICRO = "text-[10.5px] font-semibold uppercase tracking-[0.14em]";

const EXAMPLES = [
  "John Smith is looking for a 1960s Joan Mitchell",
  "What do we know about the Hendersons?",
  "Which tracked works don't have an owner on file?",
];

const REF_HREF: Partial<Record<RecordRef["kind"], (id: string) => string>> = {
  artwork: (id) => `/artworks/${id}`,
  party: (id) => `/contacts/${id}`,
  artist: (id) => `/artists/${id}`,
  // notes have no app page yet — rendered as plain text
};

function dedupeRefs(events: ToolEvent[]): RecordRef[] {
  const seen = new Set<string>();
  const out: RecordRef[] = [];
  for (const e of events) {
    for (const r of e.refs) {
      const key = `${r.kind}:${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

export function ChatPanel() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending) return;
    setError(null);
    setInput("");
    const nextTurns: Turn[] = [...turns, { role: "user", content }];
    setTurns(nextTurns);
    setPending(true);
    // Post only role/content — toolEvents are client-side display state.
    const payload = nextTurns.map((t) => ({ role: t.role, content: t.content }));
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
      });
      const json = (await res.json()) as {
        data?: { reply: string; toolEvents: ToolEvent[] };
        error?: string;
      };
      if (!res.ok || !json.data) {
        throw new Error(json.error ?? "The registrar couldn't complete that request.");
      }
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: json.data!.reply, toolEvents: json.data!.toolEvents },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      // Leave the user's turn visible so the question isn't lost.
    } finally {
      setPending(false);
      endRef.current?.scrollIntoView({ block: "nearest" });
    }
  }

  return (
    <div>
      {turns.length === 0 && (
        <div className="border border-[var(--rule)] px-6 py-8">
          <p className="font-serif text-[17px] italic text-[var(--ink-2)]">
            Ask about a work, a collector, or a past conversation.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => setInput(ex)}
                className="border border-[var(--rule)] px-3 py-[6px] text-[13px] text-[var(--ink-2)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--ink)]"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.length > 0 && (
        <div className="border-t border-[var(--rule)]">
          {turns.map((turn, i) => (
            <TurnView key={i} turn={turn} />
          ))}
        </div>
      )}

      {pending && (
        <p className="border-b border-[var(--rule)] py-4 font-serif text-[15px] italic text-[var(--ink-3)]">
          Consulting the records…
        </p>
      )}

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <form
        className="mt-6 flex items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex-1">
          <TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder="e.g. John Smith is looking for a 1960s Joan Mitchell"
            rows={2}
            disabled={pending}
            aria-label="Ask the registrar"
          />
        </div>
        <Button type="submit" disabled={pending || !input.trim()}>
          Ask
        </Button>
      </form>
      <div ref={endRef} />
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  const events = turn.toolEvents ?? [];
  const recorded = events.filter((e) => e.tool === "log_collector_interest");
  const refs = dedupeRefs(events);

  return (
    <div className="border-b border-[var(--rule)] py-5">
      <div className={`${MICRO} mb-2 text-[var(--ink-3)]`}>
        {turn.role === "user" ? "You" : "Registrar"}
      </div>
      <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-[var(--ink)]">
        {turn.content}
      </div>

      {recorded.map((e, i) => (
        <div key={i} className="mt-3 flex items-baseline gap-[7px]">
          <span
            className="inline-block h-[6px] w-[6px] shrink-0 self-center rounded-full"
            style={{ background: "var(--sage)" }}
          />
          <span className={`${MICRO}`} style={{ color: "var(--sage)" }}>
            Recorded
          </span>
          <span className="text-[13px] text-[var(--ink-2)]">{e.summary}</span>
        </div>
      ))}

      {refs.length > 0 && (
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className={`${MICRO} text-[var(--ink-3)]`}>Records</span>
          {refs.map((r) => {
            const href = REF_HREF[r.kind]?.(r.id);
            return href ? (
              <Link
                key={`${r.kind}:${r.id}`}
                href={href}
                className="text-[12.5px] text-[var(--ink-2)] underline decoration-[var(--rule)] underline-offset-2 hover:text-[var(--ink)] hover:decoration-[var(--ink-3)]"
              >
                {r.label}
              </Link>
            ) : (
              <span key={`${r.kind}:${r.id}`} className="text-[12.5px] text-[var(--ink-3)]">
                {r.label} (note)
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
