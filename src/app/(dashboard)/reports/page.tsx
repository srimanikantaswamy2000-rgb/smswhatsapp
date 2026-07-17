"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Download, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ReportRow {
  date: string; // YYYY-MM-DD
  name: string;
  url: string;
  updatedAt: string | null;
  size: number | null;
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024
    ? `${Math.round(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Daily lead reports — every PDF the 6 PM cron generated, newest
 * first, filterable by date. Reports live in the public `reports`
 * storage bucket; this page just lists and opens them.
 */
export default function ReportsPage() {
  const [reports, setReports] = useState<ReportRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState("");
  const [preview, setPreview] = useState<ReportRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/reports")
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        if (!cancelled) setReports(body.reports as ReportRow[]);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!reports) return null;
    if (!dateFilter) return reports;
    return reports.filter((r) => r.date === dateFilter);
  }, [reports, dateFilter]);

  return (
    <div className="flex h-full flex-col gap-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Lead Reports</h1>
          <p className="text-sm text-muted-foreground">
            Daily PDF reports generated at 6 PM — pick a date or browse the list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-40"
            aria-label="Filter by date"
          />
          {dateFilter && (
            <Button variant="ghost" size="sm" onClick={() => setDateFilter("")}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          Failed to load reports: {error}
        </p>
      )}

      {!error && filtered === null && (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {filtered !== null && filtered.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
          <FileText className="h-8 w-8" />
          <p className="text-sm">
            {dateFilter
              ? `No report for ${formatDate(dateFilter)}.`
              : "No reports yet — the first one arrives after the 6 PM cron runs."}
          </p>
        </div>
      )}

      {filtered !== null && filtered.length > 0 && (
        <div className="flex flex-1 gap-4 overflow-hidden">
          <ul className="w-full space-y-2 overflow-y-auto lg:w-96 lg:shrink-0">
            {filtered.map((r) => (
              <li key={r.name}>
                <button
                  type="button"
                  onClick={() => setPreview(r)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted ${
                    preview?.name === r.name
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-card"
                  }`}
                >
                  <FileText className="h-5 w-5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {formatDate(r.date)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatSize(r.size)}
                    </span>
                  </span>
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    download={r.name}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Download report ${r.date}`}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </button>
              </li>
            ))}
          </ul>

          {/* Inline PDF viewer — desktop only; mobile taps open the PDF. */}
          <div className="hidden flex-1 overflow-hidden rounded-lg border border-border lg:block">
            {preview ? (
              <iframe
                src={preview.url}
                title={`Lead report ${preview.date}`}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a report to read it here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
