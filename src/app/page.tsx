import { listProjects } from "@/lib/storage/projects";
import { ProjectDashboard } from "@/components/dashboard/ProjectDashboard";

export default async function Home() {
  const projects = await listProjects();
  return <ProjectDashboard initialProjects={projects} />;
}
