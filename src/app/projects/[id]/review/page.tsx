import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { readPageCaptureMeta } from "@/lib/storage/captures";
import { readPageSelections } from "@/lib/storage/review";
import { ScreenshotReviewGrid, type PageReviewData } from "@/components/review/ScreenshotReviewGrid";
import { AppHeader } from "@/components/nav/AppHeader";

interface ReviewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { id } = await params;
  const project = await readProject(id);
  if (!project) notFound();

  const pagesData: PageReviewData[] = [];
  for (const page of project.approvedPages) {
    const capture = await readPageCaptureMeta(id, page.slug);
    const selections = await readPageSelections(id, page.slug);
    pagesData.push({ page, capture, selections });
  }

  return (
    <>
      <AppHeader />
      <ScreenshotReviewGrid projectId={id} projectName={project.name} pagesData={pagesData} />
    </>
  );
}
