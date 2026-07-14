import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { runRegistrar, RegistrarError } from "@/lib/chat/agent";
import { getServerEnv } from "@/lib/env";
import { getSupabaseServer } from "@/lib/supabase/server";

// The Registrar chat turn (docs/chat-agent.md). Non-streaming v1: the client
// posts the visible transcript, gets back the reply plus the citation trail.
// Reads/writes run on the user-JWT Supabase client — the agent sees exactly
// what the signed-in dealer sees.

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8_000),
      }),
    )
    .min(1)
    .max(40)
    .refine((ms) => ms[ms.length - 1].role === "user", {
      message: "Last message must be from the user",
    }),
});

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const env = getServerEnv();
  if (!env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad request body" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseServer();
    const { reply, toolEvents } = await runRegistrar(
      parsed.data.messages,
      supabase,
      env.ANTHROPIC_API_KEY,
    );
    return NextResponse.json({ data: { reply, toolEvents } });
  } catch (err) {
    console.error("[chat] turn failed", err);
    const message =
      err instanceof RegistrarError
        ? err.message
        : "The registrar couldn't complete that request.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
