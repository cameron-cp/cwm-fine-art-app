"use client";

import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  Link as RadixLink,
  Separator,
  Spinner,
  Text,
} from "@radix-ui/themes";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  addConditionReport,
  deleteConditionReport,
  reparseConditionReport,
} from "../actions";
import {
  CONDITION_RATING_LABELS,
  type ConditionReport,
} from "@/lib/schemas/condition-report";
import { useSupabase } from "@/lib/supabase/browser";

export type ConditionReportWithUrl = ConditionReport & { url: string | null };

type Props = {
  artworkId: string;
  reports: ConditionReportWithUrl[];
};

const ACCEPT = "application/pdf,image/png,image/jpeg,image/gif,image/webp";

export function ConditionReports({ artworkId, reports }: Props) {
  const router = useRouter();
  const supabase = useSupabase();
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function run(fn: () => Promise<{ error?: string } | { data: unknown }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "pdf";
      const path = `${artworkId}/condition-reports/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("artworks")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
      const result = await addConditionReport(
        artworkId,
        path,
        file.name,
        file.type || "application/octet-stream",
      );
      if ("error" in result) {
        // Don't leave an orphaned object if the DB record failed.
        await supabase.storage.from("artworks").remove([path]);
        throw new Error(result.error);
      }
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const busy = pending || uploading;

  return (
    <Box>
      <Flex justify="between" align="center" mb="3">
        <Heading size="5">
          Condition reports{" "}
          <Text size="3" color="gray" weight="regular">
            ({reports.length})
          </Text>
        </Heading>
        <Button
          size="2"
          variant="soft"
          onClick={() => fileInput.current?.click()}
          loading={uploading}
          disabled={busy}
        >
          Upload report
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </Flex>

      {uploading && (
        <Flex align="center" gap="2" mb="3">
          <Spinner />
          <Text size="2" color="gray">
            Uploading and reading the report…
          </Text>
        </Flex>
      )}

      {error && (
        <Callout.Root color="red" size="1" mb="3">
          <Callout.Text>{error}</Callout.Text>
        </Callout.Root>
      )}

      {reports.length === 0 ? (
        <Flex
          align="center"
          justify="center"
          py="7"
          className="border border-[var(--rule)]"
        >
          <Text color="gray" size="2">
            No condition reports yet. Upload a PDF or image — it&apos;s attached and read for
            key details automatically.
          </Text>
        </Flex>
      ) : (
        <Flex direction="column" gap="3">
          {reports.map((r) => (
            <ReportCard
              key={r.id}
              report={r}
              busy={busy}
              onReparse={() => run(() => reparseConditionReport(artworkId, r.id))}
              onDelete={() => {
                if (!confirm(`Delete "${r.file_name}"?`)) return;
                run(() => deleteConditionReport(artworkId, r.id));
              }}
            />
          ))}
        </Flex>
      )}
    </Box>
  );
}

function StatusBadge({ status }: { status: ConditionReport["parse_status"] }) {
  const map = {
    pending: { color: "amber" as const, label: "Reading…" },
    parsed: { color: "green" as const, label: "Parsed" },
    failed: { color: "red" as const, label: "Parse failed" },
  };
  const { color, label } = map[status];
  return (
    <Badge color={color} variant="soft">
      {label}
    </Badge>
  );
}

function ReportCard({
  report,
  busy,
  onReparse,
  onDelete,
}: {
  report: ConditionReportWithUrl;
  busy: boolean;
  onReparse: () => void;
  onDelete: () => void;
}) {
  const p = report.parsed;
  return (
    <Card>
      <Flex justify="between" align="start" gap="3" wrap="wrap">
        <Flex direction="column" gap="1">
          <Flex align="center" gap="2">
            {report.url ? (
              <RadixLink href={report.url} target="_blank" rel="noopener" weight="medium">
                {report.file_name}
              </RadixLink>
            ) : (
              <Text weight="medium">{report.file_name}</Text>
            )}
            <StatusBadge status={report.parse_status} />
          </Flex>
          {(p?.report_date || p?.examiner) && (
            <Text size="1" color="gray">
              {[p?.examiner, p?.report_date].filter(Boolean).join(" · ")}
            </Text>
          )}
        </Flex>
        <Flex gap="2">
          <Button size="1" variant="soft" color="gray" onClick={onReparse} disabled={busy}>
            Re-parse
          </Button>
          <Button size="1" variant="soft" color="red" onClick={onDelete} disabled={busy}>
            Delete
          </Button>
        </Flex>
      </Flex>

      {report.parse_status === "failed" && report.parse_error && (
        <Text size="1" color="red" mt="2" as="p">
          {report.parse_error}
        </Text>
      )}

      {report.parse_status === "parsed" && p && (
        <>
          <Separator size="4" my="3" />
          <Flex direction="column" gap="3">
            {p.overall_condition && (
              <Detail label="Overall">
                <Badge variant="soft">{CONDITION_RATING_LABELS[p.overall_condition]}</Badge>
              </Detail>
            )}
            {p.summary && <Detail label="Summary">{p.summary}</Detail>}
            {p.findings.length > 0 && (
              <Detail label="Findings">
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {p.findings.map((f, i) => (
                    <li key={i}>
                      <Text size="2">{f}</Text>
                    </li>
                  ))}
                </ul>
              </Detail>
            )}
            {p.treatments.length > 0 && (
              <Detail label="Prior treatments">
                <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
                  {p.treatments.map((t, i) => (
                    <li key={i}>
                      <Text size="2">{t}</Text>
                    </li>
                  ))}
                </ul>
              </Detail>
            )}
            {p.recommendations && (
              <Detail label="Recommendations">{p.recommendations}</Detail>
            )}
          </Flex>
        </>
      )}
    </Card>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Flex gap="3" align="start">
      <Text
        size="1"
        color="gray"
        weight="medium"
        style={{ flex: "0 0 120px", paddingTop: 2 }}
      >
        {label}
      </Text>
      <Box flexGrow="1">
        {typeof children === "string" ? <Text size="2">{children}</Text> : children}
      </Box>
    </Flex>
  );
}
