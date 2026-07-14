import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeRegistrarTool,
  REGISTRAR_TOOLS,
  type RecordRef,
} from "./tools";

// The Registrar: a tool-use loop over the dealer's own records
// (docs/chat-agent.md). Same SDK + frozen-cached-system-prompt pattern as the
// import/condition/bio integrations.

// System prompt is frozen so it hits the Anthropic prompt cache on repeat
// turns. Edits will invalidate the cache for the next 5 minutes.
const SYSTEM_PROMPT = `You are the registrar for a single fine-art dealership. You answer the dealer's questions from her own records, and you keep those records current.

You have tools over her database: artworks (her inventory AND tracked market works, with owners and locations), contacts (people/organizations with roles, interests, relationships), her private notes archive, and one write tool for recording collector interests.

Rules:
- Answer ONLY from tool results. Never invent works, owners, prices, or history. If the records have nothing, say so plainly.
- Search before answering. For questions about a work or person, check the database; for "have we discussed…", "what did they think…", or any recollection, also search the notes archive.
- When the dealer states a collector's interest ("X is looking for a 1960s Joan Mitchell"), do BOTH: (a) log each stated signal with log_collector_interest — here an artist interest AND an era interest ('1960s') — then (b) answer the implied question by searching for matching works, including tracked works and their owners, and checking the notes archive for relevant past conversations. Confirm exactly what you recorded.
- Log only facts the dealer states, never your own inferences. Use sentiment 'seeking' unless she says otherwise and confidence 'likely' for conversational mentions.
- If a person or artist is ambiguous or not on file, ask — never guess, never log against the wrong record.
- Refer to works as Artist, Title (year). Quote prices exactly as the records return them.
- Be brief and concrete: prose, not bullet-point dumps. Lead with the answer. No preamble.`;

const MODEL = "claude-opus-4-8";
const MAX_ROUNDS = 8;

export type ChatTurnMessage = { role: "user" | "assistant"; content: string };

export type ToolEvent = {
  tool: string;
  summary: string;
  refs: RecordRef[];
};

export class RegistrarError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "RegistrarError";
  }
}

export async function runRegistrar(
  history: ChatTurnMessage[],
  supabase: SupabaseClient,
  apiKey: string,
): Promise<{ reply: string; toolEvents: ToolEvent[] }> {
  const client = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const toolEvents: ToolEvent[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: REGISTRAR_TOOLS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      const reply = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (!reply) throw new RegistrarError("The model returned an empty reply.");
      return { reply, toolEvents };
    }

    messages.push({ role: "assistant", content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const execution = await executeRegistrarTool(supabase, block.name, block.input);
        toolEvents.push({
          tool: block.name,
          summary: execution.summary,
          refs: execution.refs,
        });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(execution.result),
        });
      } catch (err) {
        // Surface the failure to the model so it can adjust or report it,
        // rather than aborting the whole turn.
        const message = err instanceof Error ? err.message : "Tool execution failed.";
        toolEvents.push({ tool: block.name, summary: `failed — ${message}`, refs: [] });
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: message }),
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });
  }

  throw new RegistrarError("The registrar hit the tool-call limit without concluding.");
}
