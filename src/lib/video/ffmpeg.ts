import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FfmpegStatus {
  available: boolean;
  version?: string;
}

// Unlike Chromium (a known, fixed path once Playwright's own install step has
// run — see lib/capture/browser.ts), ffmpeg isn't managed by this project's
// own dependencies at all; it's whatever the OS's own `ffmpeg` resolves to on
// PATH. That means actually confirming it works requires spawning it, not
// just checking a file exists. Cached for the life of the process (same
// reasoning as getBrowser()/isChromiumInstalled()) since this won't change
// while the server's running — if someone installs ffmpeg after the server
// started, a restart is what makes it visible, same PATH-propagation gotcha
// as any other newly-installed command-line tool.
let statusPromise: Promise<FfmpegStatus> | null = null;

export function getFfmpegStatus(): Promise<FfmpegStatus> {
  if (!statusPromise) {
    statusPromise = execFileAsync("ffmpeg", ["-version"])
      .then(({ stdout }) => {
        // First line looks like: "ffmpeg version 9.0.2-full_build-www.gyan.dev Copyright ..."
        const match = stdout.match(/ffmpeg version (\S+)/);
        return { available: true, version: match?.[1] };
      })
      .catch(() => ({ available: false }));
  }
  return statusPromise;
}

export interface ProbedVideo {
  durationSec: number;
  sizeBytes: number;
}

/**
 * Confirms a file is an actually-complete, readable video — not just "a file
 * that exists" or "a file that's stopped growing". Those two are easy to
 * conflate (a crashed mid-encode file and a successfully finished one both
 * stop growing), but ffprobe can tell them apart: a file that's missing its
 * final moov atom (written only once encoding actually finishes) won't
 * report a valid duration. Used by the stale-render self-heal
 * (lib/storage/scrollVideos.ts) to check "did this actually finish, even
 * though nothing recorded that?" before concluding a render failed.
 */
export async function probeVideoFile(filePath: string): Promise<ProbedVideo | null> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,size",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const [durationStr, sizeStr] = stdout.trim().split("\n");
    const durationSec = Number(durationStr);
    const sizeBytes = Number(sizeStr);
    if (!Number.isFinite(durationSec) || durationSec <= 0 || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      return null;
    }
    return { durationSec, sizeBytes };
  } catch {
    return null;
  }
}

export const FFMPEG_NOT_INSTALLED_MESSAGE = "ffmpeg isn't installed on this server yet.";

export const FFMPEG_INSTALL_COMMANDS: { label: string; command: string }[] = [
  { label: "Windows", command: "winget install Gyan.FFmpeg" },
  { label: "macOS", command: "brew install ffmpeg" },
  { label: "Ubuntu / Debian", command: "sudo apt install ffmpeg" },
  { label: "Fedora", command: "sudo dnf install ffmpeg" },
  { label: "Arch", command: "sudo pacman -S ffmpeg" },
];
