import { listProjects } from "@/lib/storage/projects";
import { ProjectDashboard } from "@/components/dashboard/ProjectDashboard";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";

export default async function Home() {
  const projects = await listProjects();
  return (
    <>
      <AppHeader />
      <ProjectDashboard initialProjects={projects} />
      <AppFooter />
    </>
  );
}
