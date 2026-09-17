import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { readPageCaptureMeta } from "@/lib/storage/captures";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";
import { ManualUploadForm } from "@/components/project/ManualUploadForm";

interface ManualUploadPageProps {
  params: Promise<{ id: string; slug: string }>;
}

export default async function ManualUploadPage({ params }: ManualUploadPageProps) {
  const { id, slug } = await params;
  const project = await readProject(id);
  if (!project) notFound();

  const page = project.approvedPages.find((p) => p.slug === slug);
  if (!page) notFound();

  const capture = await readPageCaptureMeta(id, slug);

  return (
    <>
      <AppHeader />
      <ManualUploadForm
        projectId={id}
        projectName={project.name}
        pageSlug={slug}
        pageLabel={page.label}
        pageUrl={page.url}
        initialCapture={capture}
      />
      <AppFooter />
    </>
  );
}
