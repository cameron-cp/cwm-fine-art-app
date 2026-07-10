import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { getServerEnv, publicEnv } from "@/lib/env";
import { renderPdfViaBrowserless } from "@/lib/pdf/browserless";

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

  return renderPdfViaBrowserless({ renderUrl, filename: "tearsheet.pdf" });
}

function originFrom(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}
