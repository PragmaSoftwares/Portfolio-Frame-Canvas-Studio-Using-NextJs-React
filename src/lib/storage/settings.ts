import fs from "node:fs/promises";
import path from "node:path";
import { DATA_ROOT, SETTINGS_PATH } from "./paths";
import type { AgencySettings } from "@/types/settings";

const DEFAULT_SETTINGS: AgencySettings = {
  agencyName: "",
  agencyLogoPath: null,
  defaultWatermarkText: "",
  defaultWatermarkVisible: false,
  defaultBackgroundLight: "#f8fafc",
  defaultBackgroundDark: "#0f172a",
  defaultFontFamily: "System UI",
  standardServices: [],
  updatedAt: new Date(0).toISOString(),
};

export async function readSettings(): Promise<AgencySettings> {
  try {
    const raw = await fs.readFile(SETTINGS_PATH, "utf-8");
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AgencySettings>) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return DEFAULT_SETTINGS;
    throw err;
  }
}

export async function writeSettings(settings: AgencySettings): Promise<void> {
  await fs.mkdir(DATA_ROOT, { recursive: true });
  await fs.writeFile(path.join(DATA_ROOT, "settings.json"), JSON.stringify(settings, null, 2), "utf-8");
}
