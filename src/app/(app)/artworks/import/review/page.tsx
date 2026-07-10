import { Callout, Container, Heading, Text } from "@radix-ui/themes";
import Link from "next/link";
import { z } from "zod";
import { ImportReview } from "./import-review";
import { importDraftSchema } from "@/lib/schemas/import-draft";
import { getSupabaseServer } from "@/lib/supabase/server";

const queryParamsSchema = z.object({
  d: z.string().uuid().optional(),
});

export const dynamic = "force-dynamic";

// Kept out of the component body so the react-hooks/purity rule doesn't flag the
// clock read: this is a per-request Server Component, so reading "now" here is
// correct and intended, not an unstable render.
function isDraftExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

export default async function ReviewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const params = queryParamsSchema.safeParse(await searchParams);
  if (!params.success || !params.data.d) {
    return <ExpiredPanel />;
  }

  const supabase = getSupabaseServer();
  const [
    { data: draftRow, error: draftErr },
    { data: artistsData },
  ] = await Promise.all([
    supabase
      .from("import_drafts")
      .select("id, payload, expires_at")
      .eq("id", params.data.d)
      .maybeSingle(),
    supabase.from("artists").select("id, name").order("name"),
  ]);

  if (draftErr || !draftRow) {
    return <ExpiredPanel />;
  }
  if (isDraftExpired(draftRow.expires_at)) {
    return <ExpiredPanel />;
  }

  const parsed = importDraftSchema.safeParse(draftRow.payload);
  if (!parsed.success) {
    return (
      <Container size="3" py="6">
        <Heading size="7" mb="3">
          Review import
        </Heading>
        <Callout.Root color="red">
          <Callout.Text>
            This draft is corrupted ({parsed.error.issues[0]?.message ?? "invalid"}).
            Please re-upload the PDF.
          </Callout.Text>
        </Callout.Root>
      </Container>
    );
  }

  const artists = artistsData ?? [];

  return (
    <Container size="3" py="6">
      <Heading size="7" mb="2">
        Review import
      </Heading>
      <Text size="2" color="gray" mb="5" as="p">
        Claude extracted these fields from your tearsheet. Review, edit anything
        that&apos;s wrong, then save.
      </Text>

      <ImportReview draft={parsed.data} artists={artists} />
    </Container>
  );
}

function ExpiredPanel() {
  return (
    <Container size="3" py="6">
      <Heading size="7" mb="3">
        Review import
      </Heading>
      <Callout.Root color="amber">
        <Callout.Text>
          This import draft expired or doesn&apos;t exist. Drafts are kept for 30
          minutes —{" "}
          <Link
            href="/artworks/import"
            className="text-[var(--accent-11)] underline"
          >
            re-upload the PDF
          </Link>{" "}
          to start over.
        </Callout.Text>
      </Callout.Root>
    </Container>
  );
}
