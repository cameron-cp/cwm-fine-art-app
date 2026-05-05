import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getServerEnv, publicEnv } from "@/lib/env";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad artwork id" }, { status: 400 });
  }

  const env = getServerEnv();
  if (!env.BROWSERLESS_API_KEY) {
    return NextResponse.json(
      { error: "BROWSERLESS_API_KEY is not configured" },
      { status: 500 },
    );
  }
  if (!env.TEARSHEET_RENDER_SECRET) {
    return NextResponse.json(
      { error: "TEARSHEET_RENDER_SECRET is not configured" },
      { status: 500 },
    );
  }

  const appUrl = publicEnv.NEXT_PUBLIC_APP_URL ?? originFrom(req);
  const renderUrl = `${appUrl}/tearsheet/render/${parsed.data.id}?token=${encodeURIComponent(
    env.TEARSHEET_RENDER_SECRET,
  )}`;

  const browserlessUrl = `https://production-sfo.browserless.io/pdf?token=${encodeURIComponent(
    env.BROWSERLESS_API_KEY,
  )}`;

  const blRes = await fetch(browserlessUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: renderUrl,
      gotoOptions: { waitUntil: "networkidle0", timeout: 30000 },
      options: {
        format: "Letter",
        printBackground: true,
        preferCSSPageSize: true,
      },
    }),
  });

  if (!blRes.ok) {
    const detail = await blRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Browserless ${blRes.status}: ${detail.slice(0, 500)}` },
      { status: 502 },
    );
  }

  const pdf = await blRes.arrayBuffer();
  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="tearsheet.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}

function originFrom(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
