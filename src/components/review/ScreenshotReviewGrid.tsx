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
    <div className="min-h-screen bg-slate-950 text-slate-100 px-6 py-12">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="space-y-2">
          <Link href={`/projects/${projectId}`} className="text-xs text-slate-500 hover:text-slate-300">
            ← {projectName}
          </Link>
          <h1 className="text-2xl font-semibold">Screenshot review</h1>
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
