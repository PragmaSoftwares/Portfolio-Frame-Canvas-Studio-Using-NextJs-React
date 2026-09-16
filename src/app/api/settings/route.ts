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

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function asHexColor(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_COLOR_PATTERN.test(value) ? value : fallback;
}

function asClampedNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
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
    defaultWatermarkText: asString(record.defaultWatermarkText, current.defaultWatermarkText),
    defaultWatermarkVisible:
      typeof record.defaultWatermarkVisible === "boolean"
        ? record.defaultWatermarkVisible
        : current.defaultWatermarkVisible,
    watermarkColor: asHexColor(record.watermarkColor, current.watermarkColor),
    watermarkLineWidth: asClampedNumber(record.watermarkLineWidth, current.watermarkLineWidth, 0.25, 10),
    watermarkFontSize: asClampedNumber(record.watermarkFontSize, current.watermarkFontSize, 8, 72),
    watermarkOpacity: asClampedNumber(record.watermarkOpacity, current.watermarkOpacity, 0.05, 1),
    defaultBackgroundLight: asString(record.defaultBackgroundLight, current.defaultBackgroundLight),
    defaultBackgroundDark: asString(record.defaultBackgroundDark, current.defaultBackgroundDark),
    defaultFontFamily: asString(record.defaultFontFamily, current.defaultFontFamily),
    updatedAt: new Date().toISOString(),
  };

  await writeSettings(updated);
  return NextResponse.json({ settings: updated });
}
