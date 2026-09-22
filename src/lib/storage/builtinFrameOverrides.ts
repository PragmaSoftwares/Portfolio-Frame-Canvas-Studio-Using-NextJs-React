import fs from "node:fs/promises";
import path from "node:path";
import { BUILTIN_FRAME_OVERRIDES_PATH } from "./paths";
import type { FrameScreenQuad } from "@/types/frame";
import type { BuiltinFrameVariant } from "@/types/board";

type BuiltinFrameOverrides = Partial<Record<BuiltinFrameVariant, FrameScreenQuad>>;

async function readOverrides(): Promise<BuiltinFrameOverrides> {
  try {
    const raw = await fs.readFile(BUILTIN_FRAME_OVERRIDES_PATH, "utf-8");
    return JSON.parse(raw) as BuiltinFrameOverrides;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeOverrides(overrides: BuiltinFrameOverrides): Promise<void> {
  await fs.mkdir(path.dirname(/* turbopackIgnore: true */ BUILTIN_FRAME_OVERRIDES_PATH), { recursive: true });
  await fs.writeFile(BUILTIN_FRAME_OVERRIDES_PATH, JSON.stringify(overrides, null, 2), "utf-8");
}

/** Screen-corner corrections for the 4 built-in device frames, keyed by variant — a variant missing here just means "use its own built-in default quad." */
export async function listBuiltinFrameOverrides(): Promise<BuiltinFrameOverrides> {
  return readOverrides();
}

/** Corrects one built-in frame variant's screen corners, used from then on across every board. See DeviceFrame.tsx. */
export async function saveBuiltinFrameOverride(variant: BuiltinFrameVariant, screenQuad: FrameScreenQuad): Promise<void> {
  const overrides = await readOverrides();
  overrides[variant] = screenQuad;
  await writeOverrides(overrides);
}

/** Resets a built-in frame variant back to its own built-in default quad. */
export async function deleteBuiltinFrameOverride(variant: BuiltinFrameVariant): Promise<void> {
  const overrides = await readOverrides();
  delete overrides[variant];
  await writeOverrides(overrides);
}
