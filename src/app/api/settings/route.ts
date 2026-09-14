import { NextResponse } from "next/server";
import { readSettings, writeSettings } from "@/lib/storage/settings";
import type { AgencySettings } from "@/types/settings";

export const runtime = "nodejs";

export async function GET() {
  const settings = await readSettings();
  return NextResponse.json({ settings });
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown, fallback: string | null): string | null {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const current = await readSettings();

  const updated: AgencySettings = {
    agencyName: asString(record.agencyName, current.agencyName),
    agencyLogoPath: asNullableString(record.agencyLogoPath, current.agencyLogoPath),
    defaultWatermarkText: asString(record.defaultWatermarkText, current.defaultWatermarkText),
    defaultWatermarkVisible:
      typeof record.defaultWatermarkVisible === "boolean"
        ? record.defaultWatermarkVisible
        : current.defaultWatermarkVisible,
    defaultBackgroundLight: asString(record.defaultBackgroundLight, current.defaultBackgroundLight),
    defaultBackgroundDark: asString(record.defaultBackgroundDark, current.defaultBackgroundDark),
    defaultFontFamily: asString(record.defaultFontFamily, current.defaultFontFamily),
    standardServices: asStringArray(record.standardServices, current.standardServices),
    updatedAt: new Date().toISOString(),
  };

  await writeSettings(updated);
  return NextResponse.json({ settings: updated });
}
