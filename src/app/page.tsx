import { listProjects } from "@/lib/storage/projects";
import { ProjectDashboard } from "@/components/dashboard/ProjectDashboard";
import { AppHeader } from "@/components/nav/AppHeader";
import { AppFooter } from "@/components/nav/AppFooter";

// This page reads project.json files straight off disk (fs.readdir), which
// Next.js has no way to know can change — without this, it silently gets
// statically prerendered at build time and never re-reads the filesystem
// again for any request, so a deleted/renamed/new project would never show
// up (or stop showing up) once a production build has been made, no matter
// how many times the page is reloaded. Every page here that reads live data
// from lib/storage/* needs this same guard.
export const dynamic = "force-dynamic";

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
