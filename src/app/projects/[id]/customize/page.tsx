import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { CustomizeForm } from "@/components/customize/CustomizeForm";

interface CustomizePageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomizePage({ params }: CustomizePageProps) {
  const { id } = await params;
  const project = await readProject(id);
  if (!project) notFound();

  return <CustomizeForm project={project} />;
}
