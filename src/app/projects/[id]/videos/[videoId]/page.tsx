import { notFound } from "next/navigation";
import { readProject } from "@/lib/storage/projects";
import { readScrollVideo } from "@/lib/storage/scrollVideos";
import { listAllSelections } from "@/lib/storage/review";
import { getFfmpegStatus, FFMPEG_INSTALL_COMMANDS } from "@/lib/video/ffmpeg";
import { ScrollVideoEditor } from "@/components/video/ScrollVideoEditor";

// Same reasoning as every other page reading live storage data — see
// boards/new/page.tsx's comment for why this guard is required.
export const dynamic = "force-dynamic";

interface ScrollVideoPageProps {
  params: Promise<{ id: string; videoId: string }>;
}

export default async function ScrollVideoPage({ params }: ScrollVideoPageProps) {
  const { id, videoId } = await params;
  const project = await readProject(id);
  if (!project) notFound();

  const video = await readScrollVideo(id, videoId);
  if (!video) notFound();

  const ffmpeg = await getFfmpegStatus();

  if (!ffmpeg.available) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Scroll video</h1>
        <div className="mt-6 rounded-xl border border-amber-800 bg-amber-950/30 px-5 py-4 text-sm text-amber-200">
          <p className="font-medium">ffmpeg isn&apos;t installed on this server yet.</p>
          <p className="mt-2 text-amber-200/80">
            Scroll video export needs ffmpeg to render. Install it with the command for your OS, then restart the
            app:
          </p>
          <ul className="mt-3 space-y-1.5">
            {FFMPEG_INSTALL_COMMANDS.map((c) => (
              <li key={c.label} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-amber-200/70">{c.label}</span>
                <code className="rounded bg-black/30 px-2 py-1 text-xs">{c.command}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  const selections = await listAllSelections(id, project.approvedPages);

  return (
    <ScrollVideoEditor
      projectId={id}
      projectName={project.name}
      video={video}
      selections={selections}
      ffmpegVersion={ffmpeg.version}
    />
  );
}
