"use client";

import Link from "next/link";
import { PageSelectionsPanel } from "./PageSelectionsPanel";
import type { ApprovedPage } from "@/types/project";
import type { PageCaptureMeta } from "@/types/capture";
import type { ScreenshotSelection } from "@/types/review";

export interface PageReviewData {
  page: ApprovedPage;
  capture: PageCaptureMeta | null;
  selections: ScreenshotSelection[];
}

interface ScreenshotReviewGridProps {
  projectId: string;
  projectName: string;
  pagesData: PageReviewData[];
}

export function ScreenshotReviewGrid({ projectId, projectName, pagesData }: ScreenshotReviewGridProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 left-1/2 h-140 w-225 -translate-x-1/2 rounded-full bg-linear-to-br from-indigo-600/25 via-violet-600/10 to-transparent blur-3xl"
      />

      <div className="relative mx-auto max-w-5xl space-y-10 px-6 py-12">
        <header className="space-y-2">
          <Link href={`/projects/${projectId}`} className="text-xs text-slate-400 hover:text-slate-100">
            ← Back to {projectName}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Screenshot review</h1>
          <p className="text-slate-400 text-sm">
            Pick a device, drag a crop area over the full-page screenshot, and click &quot;Add this to list&quot;.
            Repeat for as many sections as you want — even several from the same page. Nothing here modifies the
            original capture.
          </p>
        </header>

        {pagesData.map(({ page, capture, selections }) => (
          <PageSelectionsPanel
            key={page.slug}
            projectId={projectId}
            page={page}
            capture={capture}
            selections={selections}
          />
        ))}
      </div>
    </div>
  );
}
