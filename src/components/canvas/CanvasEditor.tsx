"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { Rnd } from "react-rnd";
import { DeviceFrame, defaultCornerRadiusFraction, defaultScreenQuad, builtinFrameImageInfo } from "@/components/board/DeviceFrame";
import { CustomDeviceFrame } from "@/components/board/CustomDeviceFrame";
import { PlainFrame } from "@/components/board/PlainFrame";
import { CornerPinEditor } from "./CornerPinEditor";
import { InfoTooltip } from "@/components/ui/Tooltip";
import { backgroundStyleFor, WatermarkOverlay, EXPORT_SCALE_FACTOR } from "@/components/board/BoardCanvas";
import { DEFAULT_CROP } from "@/types/review";
import type { CropFit } from "@/types/review";
import { defaultFrameWidth, frameOuterHeight, defaultFrameForDevice, defaultContentFit } from "@/lib/board/frameSize";
import { textBoxStyle, textContentStyle } from "@/lib/board/textStyle";
import { FONT_FAMILY_NAMES, cssFontFamily } from "@/lib/fonts";
import type {
  Board,
  BackgroundFit,
  BoardBackground,
  CanvasItem,
  ScreenshotItem,
  TextItem,
  TextAlign,
  TextTransform,
  VerticalAlign,
  FrameVariant,
  BuiltinFrameVariant,
} from "@/types/board";
import type { BackgroundImage } from "@/types/backgroundImage";
import type { CustomFrame, FrameScreenQuad } from "@/types/frame";
import type { SelectionWithPage } from "@/lib/storage/review";

interface CanvasEditorProps {
  projectId: string;
  projectName: string;
  board: Board;
  // True when `board` is an in-memory draft (see draftBoard() in
  // lib/storage/boards.ts) that has never actually been written to disk —
  // the editor's first save creates it for real instead of patching an
  // existing board, then swaps the URL to the real id.
  isNewBoard?: boolean;
  selections: SelectionWithPage[];
  backgroundImages: BackgroundImage[];
  customFrames: CustomFrame[];
  // Per-variant screen-corner corrections for the 4 built-in device frames
  // — a variant missing here just uses its own built-in default quad. See
  // lib/storage/builtinFrameOverrides.ts.
  builtinFrameOverrides: Partial<Record<BuiltinFrameVariant, FrameScreenQuad>>;
  // Watermark is agency-wide (AgencySettings.defaultWatermarkVisible/Text),
  // not per-project — applies identically to every project's boards.
  watermarkVisible: boolean;
  watermarkText: string;
  watermarkColor: string;
  watermarkLineWidth: number;
  watermarkFontSize: number;
  watermarkOpacity: number;
  watermarkFontFamily: string;
}

const EDITOR_SCALE = 0.36;
const BUILTIN_FRAME_VARIANTS: BuiltinFrameVariant[] = ["desktop", "laptop", "tablet", "mobile"];
const FRAME_OPTIONS: FrameVariant[] = [...BUILTIN_FRAME_VARIANTS, "none"];
const BUILTIN_FRAME_LABELS: Record<BuiltinFrameVariant, string> = {
  desktop: "Desktop",
  laptop: "Laptop",
  tablet: "Tablet",
  mobile: "Mobile",
};
const BACKGROUND_FIT_OPTIONS: { value: BackgroundFit; label: string }[] = [
  { value: "cover", label: "Cover" },
  { value: "repeat", label: "Repeat" },
  { value: "stretch", label: "Stretch" },
];
const CONTENT_FIT_OPTIONS: { value: CropFit; label: string; description: string }[] = [
  { value: "fit", label: "Fit", description: "Show the whole screenshot, no cropping" },
  { value: "fill", label: "Cover", description: "Fill the frame, cropping overflow" },
  { value: "stretch", label: "Stretch", description: "Fill exactly, may distort" },
];
const TEXT_ALIGN_OPTIONS: TextAlign[] = ["left", "center", "right", "justify"];
const TEXT_TRANSFORM_OPTIONS: { value: TextTransform; label: string }[] = [
  { value: "none", label: "Normal" },
  { value: "uppercase", label: "UPPERCASE" },
  { value: "lowercase", label: "lowercase" },
  { value: "capitalize", label: "Capitalize" },
];
const VERTICAL_ALIGN_OPTIONS: VerticalAlign[] = ["top", "middle", "bottom"];
const DEFAULT_TEXT_WIDTH = 480;
const DEFAULT_TEXT_HEIGHT = 100;

function mediaSrc(projectId: string, filename: string): string {
  return `/api/media/projects/${projectId}/captures/selections/${filename}`;
}

function backgroundImageSrc(filename: string): string {
  return `/api/media/backgrounds/${filename}`;
}

function customFrameSrc(filename: string): string {
  return `/api/media/frames/${filename}`;
}

// The corner-rounding slider's starting value before a user ever touches
// it — a built-in frame already has its own tuned default (see
// DeviceFrame's FRAME_ASSETS), a custom frame has none (0, since how
// off-corner-pinned it is varies frame to frame), and "none" has no frame
// to round at all.
function defaultCornerRadiusPct(frame: FrameVariant): number {
  if (frame === "none" || frame === "custom") return 0;
  return defaultCornerRadiusFraction(frame);
}

const V_TRACK_HEIGHT = 120;
const V_THUMB_SIZE = 16;

/**
 * A vertical scrollbar-style drag handle for choosing which part of a
 * screenshot stays visible when its aspect ratio doesn't match its frame —
 * direct manipulation (drag the thumb, or use arrow keys) rather than a
 * numeric input, matching how position/crop is adjusted everywhere else in
 * this app. Thumb-at-top = top of the screenshot stays visible, and so on.
 */
function VerticalPositionControl({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function fractionFromClientY(clientY: number): number {
    const track = trackRef.current;
    if (!track) return value;
    const rect = track.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Capture is best-effort (keeps the drag tracking even if the pointer
    // leaves the track) — a capture failure shouldn't block applying the
    // position itself.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setDragging(true);
    onChange(fractionFromClientY(e.clientY));
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    onChange(fractionFromClientY(e.clientY));
  }

  function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.15 : 0.05;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      onChange(Math.max(0, value - step));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onChange(Math.min(1, value + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      onChange(0);
    } else if (e.key === "End") {
      e.preventDefault();
      onChange(1);
    }
  }

  const usable = V_TRACK_HEIGHT - V_THUMB_SIZE;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-slate-400">Vertical position</label>
        <span className="text-[11px] text-slate-500">{Math.round(value * 100)}% from top</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1 text-[10px] text-slate-500">
          <span>Top</span>
          <div
            ref={trackRef}
            role="slider"
            aria-orientation="vertical"
            aria-label="Vertical position within the frame"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(value * 100)}
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onKeyDown={handleKeyDown}
            style={{ height: V_TRACK_HEIGHT }}
            className="relative w-6 cursor-grab touch-none rounded-full bg-slate-800 outline-none focus:ring-2 focus:ring-indigo-500 active:cursor-grabbing"
          >
            <div
              style={{ top: value * usable, height: V_THUMB_SIZE, width: V_THUMB_SIZE }}
              className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full border-2 border-indigo-400 bg-slate-950 shadow"
            />
          </div>
          <span>Bottom</span>
        </div>
        <p className="text-[11px] text-slate-500">
          Drag the handle (or use ↑/↓, Shift for bigger steps) to choose which part of a tall screenshot stays
          visible.
        </p>
      </div>
    </div>
  );
}

/** Reads a File's natural pixel dimensions client-side, without uploading it first. */
function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

export function CanvasEditor({
  projectId,
  projectName,
  board: initialBoard,
  isNewBoard: initialIsNewBoard,
  selections,
  backgroundImages: initialBackgroundImages,
  customFrames: initialCustomFrames,
  builtinFrameOverrides: initialBuiltinFrameOverrides,
  watermarkVisible,
  watermarkText,
  watermarkColor,
  watermarkLineWidth,
  watermarkFontSize,
  watermarkOpacity,
  watermarkFontFamily,
}: CanvasEditorProps) {
  const router = useRouter();
  // The board's id and "has this ever actually been saved" both start from
  // props but change over the editor's lifetime (the very first save of a
  // draft board creates it for real and swaps in its real id) — state, not
  // a derived read of the prop, for exactly that reason.
  const [boardId, setBoardId] = useState(initialBoard.id);
  const [isNewBoard, setIsNewBoard] = useState(Boolean(initialIsNewBoard));
  const [name, setName] = useState(initialBoard.name);
  const [background, setBackground] = useState<BoardBackground>(initialBoard.background);
  const [backgroundImageId, setBackgroundImageId] = useState<string | undefined>(initialBoard.backgroundImageId);
  const [backgroundFit, setBackgroundFit] = useState<BackgroundFit>(initialBoard.backgroundFit ?? "cover");
  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>(initialBackgroundImages);
  const [uploadingBackground, setUploadingBackground] = useState(false);
  const [customFrames, setCustomFrames] = useState<CustomFrame[]>(initialCustomFrames);
  // A file the user just picked for a new custom frame, staged for the
  // corner-pin editor — nothing is uploaded to the server until they save.
  const [pendingFrameUpload, setPendingFrameUpload] = useState<{
    file: File;
    url: string;
    width: number;
    height: number;
  } | null>(null);
  const [uploadingFrame, setUploadingFrame] = useState(false);
  const [frameUploadError, setFrameUploadError] = useState<string | null>(null);
  const [builtinFrameOverrides, setBuiltinFrameOverrides] =
    useState<Partial<Record<BuiltinFrameVariant, FrameScreenQuad>>>(initialBuiltinFrameOverrides);
  // The frame (custom or built-in) currently open in the corner-pin editor
  // for correction — separate from `pendingFrameUpload` above, which is
  // only for a brand-new upload's first-time corner-pinning.
  const [editingFrame, setEditingFrame] = useState<{ kind: "custom"; frame: CustomFrame } | { kind: "builtin"; variant: BuiltinFrameVariant } | null>(
    null
  );
  const [editingFrameBusy, setEditingFrameBusy] = useState(false);
  const [editingFrameError, setEditingFrameError] = useState<string | null>(null);
  const [items, setItems] = useState<CanvasItem[]>(initialBoard.items);
  const [pageFilter, setPageFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which text item (if any) is currently being typed into — a text item's
  // content div is only made contentEditable while its id matches this, so
  // a plain click just selects/drags the box like anything else, and a
  // double-click is what commits to editing its text.
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [exportPhase, setExportPhase] = useState<"idle" | "exporting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const textRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const editorWidth = initialBoard.canvasWidth * EDITOR_SCALE;
  const editorHeight = initialBoard.canvasHeight * EDITOR_SCALE;
  const selectionById = new Map(selections.map((s) => [s.id, s]));
  const selectedBackgroundImage = backgroundImageId ? backgroundImages.find((img) => img.id === backgroundImageId) : null;
  const pageOptions = Array.from(new Map(selections.map((s) => [s.pageSlug, s.pageLabel])).entries());
  const visibleSelections = pageFilter === "all" ? selections : selections.filter((s) => s.pageSlug === pageFilter);

  function markDirty() {
    setDirty(true);
    setExportUrl(null);
  }

  function nextZIndex(): number {
    return items.length === 0 ? 1 : Math.max(...items.map((i) => i.zIndex)) + 1;
  }

  function addItem(selection: SelectionWithPage, dropX: number, dropY: number) {
    const frame = defaultFrameForDevice(selection.sourceDevice);
    const width = defaultFrameWidth(frame);
    const height = frameOuterHeight(frame, width);
    const item: ScreenshotItem = {
      kind: "screenshot",
      id: nanoid(12),
      pageSlug: selection.pageSlug,
      selectionId: selection.id,
      x: Math.max(0, Math.round(dropX - width / 2)),
      y: Math.max(0, Math.round(dropY - height / 2)),
      width,
      height,
      zIndex: nextZIndex(),
      frame,
      contentFit: defaultContentFit(frame),
    };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
    markDirty();
  }

  function addTextItem(dropX: number, dropY: number) {
    const width = DEFAULT_TEXT_WIDTH;
    const height = DEFAULT_TEXT_HEIGHT;
    const item: TextItem = {
      kind: "text",
      id: nanoid(12),
      x: Math.max(0, Math.round(dropX - width / 2)),
      y: Math.max(0, Math.round(dropY - height / 2)),
      width,
      height,
      zIndex: nextZIndex(),
      text: "Double-click to edit",
      fontFamily: "Poppins",
      fontSize: 48,
      bold: false,
      italic: false,
      underline: false,
      color: "#ffffff",
      align: "left",
      letterSpacing: 0,
      lineHeight: 1.2,
      textTransform: "none",
      verticalAlign: "top",
      opacity: 1,
      textShadowBlur: 4,
      textShadowOffsetX: 2,
      textShadowOffsetY: 2,
      textStrokeWidth: 1,
    };
    setItems((prev) => [...prev, item]);
    setSelectedId(item.id);
    setEditingTextId(item.id);
    markDirty();
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/json");
    if (!raw) return;
    let payload: { kind: "text" } | { kind: "screenshot"; selectionId: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const dropX = (e.clientX - rect.left) / EDITOR_SCALE;
    const dropY = (e.clientY - rect.top) / EDITOR_SCALE;

    if (payload.kind === "text") {
      addTextItem(dropX, dropY);
      return;
    }
    const selection = selectionById.get(payload.selectionId);
    if (!selection) return;
    addItem(selection, dropX, dropY);
  }

  // A single low-level setter, plus three narrowly-typed wrappers around it.
  // CanvasItem is a discriminated union, so `Partial<CanvasItem>` alone
  // doesn't type-check a spread update safely (nothing stops a screenshot
  // patch leaking a text-only field onto a text item's id, or vice versa) —
  // these three keep each call site checked against the one shape it's
  // actually allowed to touch, while sharing the same underlying state update.
  function patchItem(id: string, patch: Record<string, unknown>) {
    setItems((prev) => prev.map((it) => (it.id === id ? ({ ...it, ...patch } as CanvasItem) : it)));
    markDirty();
  }

  function updateItem(id: string, patch: Partial<ScreenshotItem>) {
    patchItem(id, patch);
  }

  function updateTextItem(id: string, patch: Partial<TextItem>) {
    patchItem(id, patch);
  }

  // Position/size/layer — the fields every item kind has in common.
  function updatePosition(id: string, patch: { x?: number; y?: number; width?: number; height?: number; zIndex?: number }) {
    patchItem(id, patch);
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
    if (selectedId === id) setSelectedId(null);
    markDirty();
  }

  function bringToFront(id: string) {
    const maxZ = items.length === 0 ? 0 : Math.max(...items.map((i) => i.zIndex));
    updatePosition(id, { zIndex: maxZ + 1 });
  }

  function sendToBack(id: string) {
    const minZ = items.length === 0 ? 0 : Math.min(...items.map((i) => i.zIndex));
    updatePosition(id, { zIndex: minZ - 1 });
  }

  function changeFrame(id: string, frame: FrameVariant, customFrameId?: string) {
    const item = items.find((it) => it.id === id);
    if (!item || item.kind !== "screenshot") return;
    // Re-defaults the content fit for the new frame type each time (rather
    // than carrying over an explicit choice from a different frame shape) —
    // simple and predictable; re-pick it afterward if needed.
    const contentFit = defaultContentFit(frame);

    if (frame === "none") {
      // Show the crop exactly as captured — reset to the screenshot's own
      // aspect ratio instead of leaving behind whatever device-frame shape
      // (e.g. a phone's narrow screen) the box previously had, which would
      // otherwise still crop the sides via object-fit: cover even with no
      // frame selected.
      const selection = selectionById.get(item.selectionId);
      const height =
        selection && selection.width > 0
          ? Math.round(item.width * (selection.height / selection.width))
          : item.height;
      updateItem(id, { frame, customFrameId: undefined, height, contentFit });
      return;
    }

    if (frame === "custom") {
      const customFrame = customFrames.find((f) => f.id === customFrameId);
      const height = customFrame
        ? Math.round(item.width * (customFrame.imageHeight / customFrame.imageWidth))
        : item.height;
      updateItem(id, { frame, customFrameId, height, contentFit });
      return;
    }

    updateItem(id, { frame, customFrameId: undefined, height: frameOuterHeight(frame, item.width), contentFit });
  }

  function changeContentFit(id: string, contentFit: CropFit) {
    updateItem(id, { contentFit });
  }

  function changeContentFitColor(id: string, contentFitColor: string) {
    updateItem(id, { contentFitColor });
  }

  function changeContentY(id: string, contentY: number) {
    updateItem(id, { contentY: Math.min(1, Math.max(0, contentY)) });
  }

  function changeCornerRadius(id: string, cornerRadiusPct: number) {
    updateItem(id, { cornerRadiusPct: Math.min(0.5, Math.max(0, cornerRadiusPct)) });
  }

  function selectImageBackground(imageId: string) {
    setBackground("image");
    setBackgroundImageId(imageId);
    markDirty();
  }

  async function handleUploadBackground(file: File) {
    setUploadingBackground(true);
    setError(null);
    try {
      const { width, height } = await readImageDimensions(file);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("width", String(width));
      formData.append("height", String(height));
      formData.append("name", file.name);
      const res = await fetch("/api/backgrounds", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not upload that image.");
      setBackgroundImages((prev) => [data.image as BackgroundImage, ...prev]);
      selectImageBackground(data.image.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that image.");
    } finally {
      setUploadingBackground(false);
    }
  }

  async function handleDeleteBackgroundImage(imageId: string) {
    let confirmMessage = "Remove this background image from the library? This can't be undone.";
    try {
      const usageRes = await fetch(`/api/backgrounds/${imageId}/usage`);
      if (usageRes.ok) {
        const usage = await usageRes.json();
        if (usage.boards > 0) {
          confirmMessage =
            `This background is used on ${usage.boards} board${usage.boards === 1 ? "" : "s"}. Removing it will ` +
            `change those boards back to the default dark background. This can't be undone.`;
        }
      }
    } catch {
      // Usage check failed — fall back to the generic message rather than blocking deletion on it.
    }
    if (!window.confirm(confirmMessage)) return;

    setError(null);
    try {
      const res = await fetch(`/api/backgrounds/${imageId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not remove that image.");
      setBackgroundImages((prev) => prev.filter((img) => img.id !== imageId));
      if (backgroundImageId === imageId) {
        setBackground("dark");
        setBackgroundImageId(undefined);
        markDirty();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove that image.");
    }
  }

  async function handleDeleteCustomFrame(frameId: string) {
    let confirmMessage = "Delete this frame? This can't be undone.";
    try {
      const usageRes = await fetch(`/api/frames/${frameId}/usage`);
      if (usageRes.ok) {
        const usage = await usageRes.json();
        if (usage.items > 0) {
          confirmMessage =
            `This frame is used on ${usage.items} item${usage.items === 1 ? "" : "s"} across ${usage.boards} ` +
            `board${usage.boards === 1 ? "" : "s"}. Deleting it will change those items to frameless (no frame). ` +
            `This can't be undone.`;
        }
      }
    } catch {
      // Usage check failed — fall back to the generic message rather than blocking deletion on it.
    }
    if (!window.confirm(confirmMessage)) return;

    setError(null);
    try {
      const res = await fetch(`/api/frames/${frameId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not delete that frame.");
      setCustomFrames((prev) => prev.filter((f) => f.id !== frameId));
      // Any item on *this* board using the deleted frame falls back to
      // frameless immediately too, matching what just happened on disk —
      // otherwise it'd keep rendering (as frameless, since Phase 4's real
      // rendering isn't built yet either way) with a dangling customFrameId
      // until the next full page load.
      setItems((prev) =>
        prev.map((item) =>
          item.kind === "screenshot" && item.frame === "custom" && item.customFrameId === frameId
            ? { ...item, frame: "none", customFrameId: undefined }
            : item
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete that frame.");
    }
  }

  async function handleFrameFileSelected(file: File) {
    setFrameUploadError(null);
    try {
      const { width, height } = await readImageDimensions(file);
      setPendingFrameUpload({ file, url: URL.createObjectURL(file), width, height });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that image.");
    }
  }

  function closePendingFrameUpload() {
    if (pendingFrameUpload) URL.revokeObjectURL(pendingFrameUpload.url);
    setPendingFrameUpload(null);
    setFrameUploadError(null);
  }

  async function handleSaveCustomFrame(quad: FrameScreenQuad, name: string) {
    if (!pendingFrameUpload) return;
    setUploadingFrame(true);
    setFrameUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", pendingFrameUpload.file);
      formData.append("width", String(pendingFrameUpload.width));
      formData.append("height", String(pendingFrameUpload.height));
      formData.append("name", name);
      formData.append("quad", JSON.stringify(quad));
      const res = await fetch("/api/frames", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save that frame.");
      setCustomFrames((prev) => [data.frame as CustomFrame, ...prev]);
      closePendingFrameUpload();
    } catch (err) {
      setFrameUploadError(err instanceof Error ? err.message : "Could not save that frame.");
    } finally {
      setUploadingFrame(false);
    }
  }

  async function handleResetBuiltinFrame(variant: BuiltinFrameVariant) {
    if (!window.confirm(`Reset ${BUILTIN_FRAME_LABELS[variant]}'s screen corners back to the built-in default?`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/frames/builtin/${variant}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not reset that frame.");
      setBuiltinFrameOverrides((prev) => {
        const next = { ...prev };
        delete next[variant];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset that frame.");
    }
  }

  function openEditCustomFrame(frame: CustomFrame) {
    setEditingFrameError(null);
    setEditingFrame({ kind: "custom", frame });
  }

  function openEditBuiltinFrame(variant: BuiltinFrameVariant) {
    setEditingFrameError(null);
    setEditingFrame({ kind: "builtin", variant });
  }

  function closeEditFrame() {
    setEditingFrame(null);
    setEditingFrameError(null);
  }

  async function handleSaveFrameEdit(quad: FrameScreenQuad, name: string) {
    if (!editingFrame) return;
    setEditingFrameBusy(true);
    setEditingFrameError(null);
    try {
      if (editingFrame.kind === "custom") {
        const res = await fetch(`/api/frames/${editingFrame.frame.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quad, name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not save that correction.");
        const updated = data.frame as CustomFrame;
        setCustomFrames((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      } else {
        const res = await fetch(`/api/frames/builtin/${editingFrame.variant}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quad }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Could not save that correction.");
        setBuiltinFrameOverrides((prev) => ({ ...prev, [editingFrame.variant]: quad }));
      }
      closeEditFrame();
    } catch (err) {
      setEditingFrameError(err instanceof Error ? err.message : "Could not save that correction.");
    } finally {
      setEditingFrameBusy(false);
    }
  }

  // Arrow-key nudging for the selected item — a precise alternative to mouse
  // dragging (1 screen-px per press, ~10 screen-px with Shift, converted to
  // native/export pixel units). Skipped while typing in a text field so it
  // doesn't fight the board-name input or anything else.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedId || editingTextId) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "ArrowUp" && e.key !== "ArrowDown") return;

      const activeTag = document.activeElement?.tagName;
      if (activeTag === "INPUT" || activeTag === "TEXTAREA" || activeTag === "SELECT") return;

      e.preventDefault();
      const step = Math.max(1, Math.round((e.shiftKey ? 10 : 1) / EDITOR_SCALE));
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;

      setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, x: Math.max(0, it.x + dx), y: Math.max(0, it.y + dy) } : it)));
      setDirty(true);
      setExportUrl(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, editingTextId]);

  // Warns before closing the tab, refreshing, or typing a new URL while
  // there are unsaved changes — `dirty` only ever becomes true from an
  // actual edit (see markDirty()), never just from opening the editor, so
  // an untouched or already-saved board never prompts. Browsers ignore any
  // custom message text on this event and show their own fixed wording;
  // only whether it fires at all is under our control here.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Same guard for the in-app navigation links below (Next's client-side
  // routing doesn't trigger beforeunload at all, since the page never
  // actually unloads) — attach to any Link that leaves this editor.
  function confirmLeaveIfDirty(e: React.MouseEvent) {
    if (!dirty) return;
    if (!window.confirm("You have unsaved changes on this board. Leave without saving?")) {
      e.preventDefault();
    }
  }

  // Entering edit mode on a text item doesn't hand the browser focus (or a
  // cursor position) automatically — a contentEditable div only gets that
  // via an explicit imperative focus() + Selection/Range call, done here
  // right after the div renders as editable.
  useEffect(() => {
    if (!editingTextId) return;
    const el = textRefs.current[editingTextId];
    if (!el) return;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editingTextId]);

  // Returns the board's id on success (so a caller that just triggered the
  // very first save of a draft board — which creates it and swaps in a
  // real id — can use that id immediately, without waiting a render for
  // the `boardId` state update to land), or null on failure.
  async function handleSave(): Promise<string | null> {
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name,
        background,
        backgroundImageId: background === "image" ? (backgroundImageId ?? null) : null,
        backgroundFit: background === "image" ? backgroundFit : "cover",
        items,
      };

      let targetBoardId = boardId;
      if (isNewBoard) {
        // First save of a draft board: create it for real first (whatever
        // the user's already configured — background, items — may already
        // differ from the bare defaults draftBoard() seeded, so this is
        // immediately followed by the same PATCH an existing board gets).
        const createRes = await fetch(`/api/projects/${projectId}/boards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.error ?? "Could not create the board.");
        targetBoardId = createData.board.id;
      }

      const res = await fetch(`/api/projects/${projectId}/boards/${targetBoardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save the board.");

      if (isNewBoard) {
        setBoardId(targetBoardId);
        setIsNewBoard(false);
        router.replace(`/projects/${projectId}/boards/${targetBoardId}`);
      }
      setDirty(false);
      return targetBoardId;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the board.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExportPhase("exporting");
    setError(null);
    const savedBoardId = await handleSave();
    if (!savedBoardId) {
      setExportPhase("error");
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/boards/${savedBoardId}/export`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Export failed.");
      setExportUrl(data.url);
      setExportPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
      setExportPhase("error");
    }
  }

  const selectedItem = items.find((it) => it.id === selectedId) ?? null;
  const canvasBackgroundImageUrl = selectedBackgroundImage ? backgroundImageSrc(selectedBackgroundImage.filename) : null;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 lg:h-screen">
      {/* Shown only on touch-primary devices (see .touch-notice in
          globals.css) — pure CSS, no JS/hydration risk. Precise drag/
          resize/layer composition genuinely doesn't work well on touch
          (placing a screenshot from the library uses the native HTML5
          drag-and-drop API, which no mobile browser fires from a touch
          gesture at all) — this sets expectations instead of letting
          someone think the editor is just broken. */}
      <div className="touch-notice shrink-0 border-b border-amber-900/60 bg-amber-950/40 px-6 py-3 text-sm text-amber-200">
        This editor is built for a desktop browser with a mouse — some interactions (like dragging a screenshot
        onto the canvas) need precise pointer control that touch screens can&apos;t provide yet. For now, build
        boards on a desktop; touch support may come later.
      </div>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-slate-800 px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href={`/projects/${projectId}`} onClick={confirmLeaveIfDirty} className="text-xs text-slate-400 hover:text-slate-100">
            ← Back to {projectName}
          </Link>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              markDirty();
            }}
            className="rounded border border-transparent bg-transparent px-2 py-1 text-lg font-semibold outline-none hover:border-slate-700 focus:border-indigo-500"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1">
            <button
              onClick={() => {
                setBackground("dark");
                markDirty();
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs ${background === "dark" ? "border-indigo-500 text-indigo-300" : "border-slate-700 text-slate-400"}`}
            >
              Dark
            </button>
            <button
              onClick={() => {
                setBackground("light");
                markDirty();
              }}
              className={`rounded-lg border px-3 py-1.5 text-xs ${background === "light" ? "border-indigo-500 text-indigo-300" : "border-slate-700 text-slate-400"}`}
            >
              Light
            </button>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Saving…" : dirty || isNewBoard ? "Save" : "Saved"}
          </button>
          <button
            onClick={handleExport}
            disabled={exportPhase === "exporting" || items.length === 0}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exportPhase === "exporting"
              ? "Exporting…"
              : `Export PNG (${initialBoard.canvasWidth * EXPORT_SCALE_FACTOR}×${initialBoard.canvasHeight * EXPORT_SCALE_FACTOR})`}
          </button>
          {exportUrl && (
            <a href={exportUrl} target="_blank" rel="noreferrer" className="text-sm text-emerald-400 underline underline-offset-4">
              Open PNG
            </a>
          )}
        </div>
      </header>

      {error && (
        <div className="border-b border-red-800 bg-red-950/50 px-6 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="flex items-center gap-3 overflow-x-auto border-b border-slate-800 bg-slate-900/40 px-6 py-2.5">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Background image
        </span>
        <div className="flex items-center gap-2">
          {backgroundImages.map((img) => (
            <div key={img.id} className="group relative shrink-0">
              <button
                onClick={() => selectImageBackground(img.id)}
                title={img.originalName}
                className={`block h-11 w-16 overflow-hidden rounded border-2 bg-slate-800 ${
                  background === "image" && backgroundImageId === img.id
                    ? "border-indigo-500"
                    : "border-slate-700 hover:border-slate-500"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={backgroundImageSrc(img.filename)}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                onClick={() => handleDeleteBackgroundImage(img.id)}
                title="Remove from library"
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] leading-none text-white hover:bg-red-500 group-hover:flex"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label
          className={`shrink-0 cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500 ${uploadingBackground ? "opacity-50" : ""}`}
        >
          {uploadingBackground ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={uploadingBackground}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleUploadBackground(file);
            }}
          />
        </label>
        {background === "image" && (
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="text-xs text-slate-400">Fit</span>
            <select
              value={backgroundFit}
              onChange={(e) => {
                setBackgroundFit(e.target.value as BackgroundFit);
                markDirty();
              }}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
            >
              {BACKGROUND_FIT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 overflow-x-auto border-b border-slate-800 bg-slate-900/40 px-6 py-2.5">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Inbuilt frames
          <InfoTooltip
            content={
              <>
                The 4 built-in frames. Their screen corners are hand-measured and occasionally slightly off — hover
                one and hit ✎ to drag them onto the true edges; the correction applies everywhere this frame is
                used, across every project.
              </>
            }
          />
        </span>
        <div className="flex items-center gap-2">
          {BUILTIN_FRAME_VARIANTS.map((variant) => (
            <div key={variant} className="group relative shrink-0" title={BUILTIN_FRAME_LABELS[variant]}>
              <div className="block h-11 w-16 overflow-hidden rounded border-2 border-slate-700 bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={builtinFrameImageInfo(variant).src}
                  alt=""
                  draggable={false}
                  className="h-full w-full object-contain"
                />
              </div>
              <button
                onClick={() => openEditBuiltinFrame(variant)}
                title="Edit screen corners"
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] leading-none text-white hover:bg-indigo-500 group-hover:flex"
              >
                ✎
              </button>
              {builtinFrameOverrides[variant] && (
                <button
                  onClick={() => handleResetBuiltinFrame(variant)}
                  title="Reset to the built-in default corners"
                  className="absolute -left-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-amber-600 text-[10px] leading-none text-white hover:bg-amber-500 group-hover:flex"
                >
                  ↺
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 overflow-x-auto border-b border-slate-800 bg-slate-900/40 px-6 py-2.5">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Custom frames
          <InfoTooltip
            content={
              <>
                Upload a PNG or WebP with a genuinely <strong>transparent</strong> area where the screen goes — JPG
                isn&apos;t accepted, since it has no transparency at all and would show a solid box instead of your
                screenshot.
              </>
            }
          />
        </span>
        <div className="flex items-center gap-2">
          {customFrames.map((f) => (
            <div key={f.id} className="group relative shrink-0" title={f.name}>
              <div className="block h-11 w-16 overflow-hidden rounded border-2 border-slate-700 bg-slate-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={customFrameSrc(f.filename)} alt="" draggable={false} className="h-full w-full object-contain" />
              </div>
              <button
                onClick={() => openEditCustomFrame(f)}
                title="Edit screen corners"
                className="absolute -left-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-indigo-600 text-[10px] leading-none text-white hover:bg-indigo-500 group-hover:flex"
              >
                ✎
              </button>
              <button
                onClick={() => handleDeleteCustomFrame(f.id)}
                title="Delete frame"
                className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] leading-none text-white hover:bg-red-500 group-hover:flex"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <label
          title="PNG or WebP only, with a transparent screen area"
          className={`shrink-0 cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500 ${uploadingFrame ? "opacity-50" : ""}`}
        >
          Upload frame
          <input
            type="file"
            accept="image/png,image/webp"
            className="hidden"
            disabled={uploadingFrame}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void handleFrameFileSelected(file);
            }}
          />
        </label>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside className="w-full shrink-0 overflow-y-auto border-b border-slate-800 p-4 lg:w-72 lg:border-r lg:border-b-0">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Text</h2>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/json", JSON.stringify({ kind: "text" }));
            }}
            className="mb-4 cursor-grab rounded-lg border border-dashed border-slate-700 px-3 py-3 text-center hover:border-indigo-500"
            title="Drag onto the canvas to add a text box"
          >
            <p className="text-lg font-bold leading-none">T</p>
            <p className="mt-1 text-[11px] text-slate-500">Drag onto canvas to add text</p>
          </div>

          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Cropped screenshots — drag onto the canvas
          </h2>
          {pageOptions.length > 1 && (
            <select
              value={pageFilter}
              onChange={(e) => setPageFilter(e.target.value)}
              className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs outline-none focus:border-indigo-500"
            >
              <option value="all">All pages</option>
              {pageOptions.map(([slug, label]) => (
                <option key={slug} value={slug}>
                  {label}
                </option>
              ))}
            </select>
          )}
          {selections.length === 0 ? (
            <p className="text-sm text-slate-400">
              No cropped sections yet.{" "}
              <Link href={`/projects/${projectId}/review`} onClick={confirmLeaveIfDirty} className="text-indigo-400 hover:text-indigo-300">
                Go crop some →
              </Link>
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {visibleSelections.map((s) => {
                const frame = defaultFrameForDevice(s.sourceDevice);
                const thumbWidth = 110;
                return (
                  <div
                    key={s.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/json", JSON.stringify({ kind: "screenshot", selectionId: s.id }));
                    }}
                    className="cursor-grab space-y-1 rounded-lg border border-slate-800 p-2 hover:border-slate-600"
                    title={`${s.pageLabel} — ${s.label}`}
                  >
                    <div style={{ position: "relative", height: frameOuterHeight(frame, thumbWidth) }}>
                      {/* frame is always one of the 4 device literals here — defaultFrameForDevice
                          derives it straight from the capture device, never "none" or "custom". */}
                      <DeviceFrame
                        variant={frame}
                        src={mediaSrc(projectId, s.filename)}
                        crop={{ ...DEFAULT_CROP, fit: defaultContentFit(frame) }}
                        width={thumbWidth}
                        screenQuadOverride={builtinFrameOverrides[frame]}
                        style={{ left: 0, top: 0 }}
                      />
                    </div>
                    <p className="truncate text-[11px] text-slate-400">{s.pageLabel}</p>
                    <p className="truncate text-[11px] text-slate-500">{s.label}</p>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        {/* min-w-0/min-h-0 override flex's default min-width/height: auto —
            without them, this item won't shrink below the fixed-pixel-width
            board canvas inside it, which is what was actually forcing the
            whole page wider than the viewport on narrow screens. With them,
            the board itself (still its real export pixel size, unscaled)
            just scrolls within this box instead — not editable via touch,
            but contained, not broken-looking. */}
        <main className="flex min-h-[60vh] min-w-0 flex-1 items-center justify-center overflow-auto p-8 lg:min-h-0">
          <div
            ref={canvasRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={(e) => {
              if (e.target === canvasRef.current) setSelectedId(null);
            }}
            style={{
              position: "relative",
              width: editorWidth,
              height: editorHeight,
              ...backgroundStyleFor(
                background,
                canvasBackgroundImageUrl,
                backgroundFit,
                selectedBackgroundImage ? { width: selectedBackgroundImage.width, height: selectedBackgroundImage.height } : undefined,
                EDITOR_SCALE
              ),
              boxShadow: "0 0 0 1px rgba(148,163,184,0.25), 0 30px 60px -20px rgba(0,0,0,0.6)",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            {items.length === 0 && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                Drag a screenshot or a text box here to get started
              </p>
            )}
            {items.map((item) => (
              <Rnd
                key={item.id}
                size={{ width: item.width * EDITOR_SCALE, height: item.height * EDITOR_SCALE }}
                position={{ x: item.x * EDITOR_SCALE, y: item.y * EDITOR_SCALE }}
                lockAspectRatio={item.kind === "screenshot" && item.frame !== "none"}
                minWidth={40}
                minHeight={40}
                bounds="parent"
                disableDragging={item.kind === "text" && editingTextId === item.id}
                style={{ zIndex: item.zIndex, outline: selectedId === item.id ? "2px solid #6366f1" : "none" }}
                onDragStart={() => setSelectedId(item.id)}
                onDragStop={(_e, d) => updatePosition(item.id, { x: Math.round(d.x / EDITOR_SCALE), y: Math.round(d.y / EDITOR_SCALE) })}
                onResizeStop={(_e, _dir, ref, _delta, position) =>
                  updatePosition(item.id, {
                    width: Math.round(ref.offsetWidth / EDITOR_SCALE),
                    height: Math.round(ref.offsetHeight / EDITOR_SCALE),
                    x: Math.round(position.x / EDITOR_SCALE),
                    y: Math.round(position.y / EDITOR_SCALE),
                  })
                }
                onClick={() => setSelectedId(item.id)}
              >
                <div style={{ width: "100%", height: "100%", overflow: item.kind === "text" ? "visible" : "hidden" }}>
                  <div style={{ transform: `scale(${EDITOR_SCALE})`, transformOrigin: "top left", width: item.width, height: item.height }}>
                    {item.kind === "text" ? (
                      <div style={textBoxStyle(item)} onDoubleClick={() => setEditingTextId(item.id)}>
                        <div
                          ref={(el) => {
                            textRefs.current[item.id] = el;
                          }}
                          contentEditable={editingTextId === item.id}
                          suppressContentEditableWarning
                          onDoubleClick={() => setEditingTextId(item.id)}
                          onBlur={(e) => {
                            if (editingTextId !== item.id) return;
                            updateTextItem(item.id, { text: e.currentTarget.innerText });
                            setEditingTextId(null);
                          }}
                          style={{ ...textContentStyle(item), cursor: editingTextId === item.id ? "text" : "inherit" }}
                        >
                          {item.text}
                        </div>
                      </div>
                    ) : (
                      (() => {
                        const selection = selectionById.get(item.selectionId);
                        const src = selection ? mediaSrc(projectId, selection.filename) : null;
                        const crop = {
                          ...DEFAULT_CROP,
                          fit: item.contentFit ?? defaultContentFit(item.frame),
                          y: item.contentY ?? 0.5,
                        };
                        const contentBackground = item.contentFitColor ?? "#ffffff";
                        if (item.frame === "none") {
                          return (
                            <PlainFrame
                              src={src}
                              crop={crop}
                              width={item.width}
                              height={item.height}
                              contentBackground={contentBackground}
                              style={{ left: 0, top: 0 }}
                            />
                          );
                        }
                        if (item.frame === "custom") {
                          const customFrame = customFrames.find((f) => f.id === item.customFrameId);
                          // Frame was deleted from the library after this item was set to use
                          // it (unusual — deleting resets every item on disk to frame: "none",
                          // but the client-side board state here might be stale mid-session) —
                          // fall back to frameless rather than rendering nothing.
                          if (!customFrame) {
                            return (
                              <PlainFrame
                                src={src}
                                crop={crop}
                                width={item.width}
                                height={item.height}
                                contentBackground={contentBackground}
                                style={{ left: 0, top: 0 }}
                              />
                            );
                          }
                          return (
                            <CustomDeviceFrame
                              frame={customFrame}
                              frameSrc={customFrameSrc(customFrame.filename)}
                              src={src}
                              crop={crop}
                              width={item.width}
                              contentBackground={contentBackground}
                              cornerRadiusPct={item.cornerRadiusPct ?? 0}
                              style={{ left: 0, top: 0 }}
                            />
                          );
                        }
                        return (
                          <DeviceFrame
                            variant={item.frame}
                            src={src}
                            crop={crop}
                            width={item.width}
                            contentBackground={contentBackground}
                            cornerRadiusPct={item.cornerRadiusPct}
                            screenQuadOverride={builtinFrameOverrides[item.frame]}
                            style={{ left: 0, top: 0 }}
                          />
                        );
                      })()
                    )}
                  </div>
                </div>
              </Rnd>
            ))}
            {watermarkVisible && watermarkText.trim().length > 0 && (
              <WatermarkOverlay
                canvasWidth={editorWidth}
                canvasHeight={editorHeight}
                text={watermarkText}
                color={watermarkColor}
                lineWidth={watermarkLineWidth}
                fontSize={watermarkFontSize}
                opacity={watermarkOpacity}
                fontFamily={watermarkFontFamily}
                tileScale={EDITOR_SCALE}
              />
            )}
          </div>
        </main>

        <aside className="w-full shrink-0 space-y-4 overflow-y-auto border-t border-slate-800 p-4 lg:w-64 lg:border-t-0 lg:border-l">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected item</h2>
          {selectedItem ? (
            <>
              <p className="text-sm text-slate-400">
                {selectedItem.kind === "text"
                  ? "Double-click the text on the canvas to edit its content."
                  : "Use the arrow keys to nudge position (hold Shift for bigger steps) — handy if dragging feels imprecise."}
              </p>
              {selectedItem.kind === "text" ? (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Font family</label>
                    <select
                      value={selectedItem.fontFamily}
                      onChange={(e) => updateTextItem(selectedItem.id, { fontFamily: e.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    >
                      {FONT_FAMILY_NAMES.map((f) => (
                        <option key={f} value={f} style={{ fontFamily: cssFontFamily(f) }}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Size (px)</label>
                      <input
                        type="number"
                        min={1}
                        value={selectedItem.fontSize}
                        onChange={(e) => updateTextItem(selectedItem.id, { fontSize: Math.max(1, Number(e.target.value)) })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Color</label>
                      <input
                        type="color"
                        value={selectedItem.color}
                        onChange={(e) => updateTextItem(selectedItem.id, { color: e.target.value })}
                        className="h-9 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-0.5"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => updateTextItem(selectedItem.id, { bold: !selectedItem.bold })}
                      title="Bold"
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-bold ${
                        selectedItem.bold ? "border-indigo-500 bg-indigo-500/10 text-indigo-300" : "border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      B
                    </button>
                    <button
                      onClick={() => updateTextItem(selectedItem.id, { italic: !selectedItem.italic })}
                      title="Italic"
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs italic ${
                        selectedItem.italic ? "border-indigo-500 bg-indigo-500/10 text-indigo-300" : "border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      I
                    </button>
                    <button
                      onClick={() => updateTextItem(selectedItem.id, { underline: !selectedItem.underline })}
                      title="Underline"
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs underline ${
                        selectedItem.underline
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                          : "border-slate-700 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      U
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Alignment</label>
                    <div className="flex gap-1.5">
                      {TEXT_ALIGN_OPTIONS.map((a) => (
                        <button
                          key={a}
                          onClick={() => updateTextItem(selectedItem.id, { align: a })}
                          className={`flex-1 rounded-lg border px-3 py-2 text-xs capitalize ${
                            selectedItem.align === a
                              ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                              : "border-slate-700 text-slate-400 hover:border-slate-500"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Letter spacing</label>
                      <input
                        type="number"
                        step={0.5}
                        value={selectedItem.letterSpacing}
                        onChange={(e) => updateTextItem(selectedItem.id, { letterSpacing: Number(e.target.value) })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Line height</label>
                      <input
                        type="number"
                        step={0.1}
                        min={0.1}
                        value={selectedItem.lineHeight}
                        onChange={(e) => updateTextItem(selectedItem.id, { lineHeight: Math.max(0.1, Number(e.target.value)) })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Text case</label>
                    <select
                      value={selectedItem.textTransform}
                      onChange={(e) => updateTextItem(selectedItem.id, { textTransform: e.target.value as TextTransform })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    >
                      {TEXT_TRANSFORM_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Vertical align</label>
                    <div className="flex gap-1.5">
                      {VERTICAL_ALIGN_OPTIONS.map((v) => (
                        <button
                          key={v}
                          onClick={() => updateTextItem(selectedItem.id, { verticalAlign: v })}
                          className={`flex-1 rounded-lg border px-3 py-2 text-xs capitalize ${
                            selectedItem.verticalAlign === v
                              ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                              : "border-slate-700 text-slate-400 hover:border-slate-500"
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-500">
                      Where the text sits if you resize the box taller than the text itself needs.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400">Opacity (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(selectedItem.opacity * 100)}
                        onChange={(e) =>
                          updateTextItem(selectedItem.id, { opacity: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-slate-400">Background</label>
                        {selectedItem.backgroundColor && (
                          <button
                            onClick={() => updateTextItem(selectedItem.id, { backgroundColor: undefined })}
                            className="text-[11px] text-slate-500 hover:text-slate-300"
                          >
                            None
                          </button>
                        )}
                      </div>
                      <input
                        type="color"
                        value={selectedItem.backgroundColor ?? "#000000"}
                        onChange={(e) => updateTextItem(selectedItem.id, { backgroundColor: e.target.value })}
                        title={selectedItem.backgroundColor ? undefined : "Pick a color to add a background plate behind the text"}
                        className="h-9 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-0.5"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-400">Shadow</label>
                      {selectedItem.textShadowColor && (
                        <button
                          onClick={() => updateTextItem(selectedItem.id, { textShadowColor: undefined })}
                          className="text-[11px] text-slate-500 hover:text-slate-300"
                        >
                          None
                        </button>
                      )}
                    </div>
                    <input
                      type="color"
                      value={selectedItem.textShadowColor ?? "#000000"}
                      onChange={(e) => updateTextItem(selectedItem.id, { textShadowColor: e.target.value })}
                      title={selectedItem.textShadowColor ? undefined : "Pick a color to add a drop shadow behind the text"}
                      className="h-9 w-full cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-0.5"
                    />
                    {selectedItem.textShadowColor && (
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">Blur</label>
                          <input
                            type="number"
                            min={0}
                            value={selectedItem.textShadowBlur}
                            onChange={(e) => updateTextItem(selectedItem.id, { textShadowBlur: Math.max(0, Number(e.target.value)) })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">Offset X</label>
                          <input
                            type="number"
                            value={selectedItem.textShadowOffsetX}
                            onChange={(e) => updateTextItem(selectedItem.id, { textShadowOffsetX: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] text-slate-500">Offset Y</label>
                          <input
                            type="number"
                            value={selectedItem.textShadowOffsetY}
                            onChange={(e) => updateTextItem(selectedItem.id, { textShadowOffsetY: Number(e.target.value) })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs text-slate-400">Outline</label>
                      {selectedItem.textStrokeColor && (
                        <button
                          onClick={() => updateTextItem(selectedItem.id, { textStrokeColor: undefined })}
                          className="text-[11px] text-slate-500 hover:text-slate-300"
                        >
                          None
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={selectedItem.textStrokeColor ?? "#000000"}
                        onChange={(e) => updateTextItem(selectedItem.id, { textStrokeColor: e.target.value })}
                        title={selectedItem.textStrokeColor ? undefined : "Pick a color to add an outline around the text"}
                        className="h-9 w-16 shrink-0 cursor-pointer rounded-lg border border-slate-700 bg-slate-900 p-0.5"
                      />
                      {selectedItem.textStrokeColor && (
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={selectedItem.textStrokeWidth}
                          onChange={(e) => updateTextItem(selectedItem.id, { textStrokeWidth: Math.max(0, Number(e.target.value)) })}
                          title="Outline width (px)"
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                        />
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Frame</label>
                    <select
                      value={selectedItem.frame === "custom" ? `custom:${selectedItem.customFrameId}` : selectedItem.frame}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (value.startsWith("custom:")) {
                          changeFrame(selectedItem.id, "custom", value.slice("custom:".length));
                        } else {
                          changeFrame(selectedItem.id, value as FrameVariant);
                        }
                      }}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    >
                      {FRAME_OPTIONS.map((f) => (
                        <option key={f} value={f}>
                          {f === "none" ? "No frame" : f[0].toUpperCase() + f.slice(1)}
                        </option>
                      ))}
                      {customFrames.length > 0 && (
                        <optgroup label="Custom frames">
                          {customFrames.map((f) => (
                            <option key={f.id} value={`custom:${f.id}`}>
                              {f.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Content fit</label>
                    <select
                      value={selectedItem.contentFit ?? defaultContentFit(selectedItem.frame)}
                      onChange={(e) => changeContentFit(selectedItem.id, e.target.value as CropFit)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-indigo-500"
                    >
                      {CONTENT_FIT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-slate-500">
                      {CONTENT_FIT_OPTIONS.find((opt) => opt.value === (selectedItem.contentFit ?? defaultContentFit(selectedItem.frame)))
                        ?.description}
                    </p>
                    {(selectedItem.contentFit ?? defaultContentFit(selectedItem.frame)) === "fit" && (
                      <div className="flex items-center gap-2 pt-1">
                        <label className="text-xs text-slate-400">Gap color</label>
                        <input
                          type="color"
                          value={selectedItem.contentFitColor ?? "#ffffff"}
                          onChange={(e) => changeContentFitColor(selectedItem.id, e.target.value)}
                          className="h-7 w-10 cursor-pointer rounded border border-slate-700 bg-slate-900 p-0.5"
                          title="Fill color for the empty space Fit mode can leave around the screenshot"
                        />
                        <span className="text-xs text-slate-500">{selectedItem.contentFitColor ?? "#ffffff"}</span>
                        {selectedItem.contentFitColor && selectedItem.contentFitColor !== "#ffffff" && (
                          <button
                            onClick={() => changeContentFitColor(selectedItem.id, "#ffffff")}
                            className="ml-auto text-xs text-slate-500 hover:text-slate-300"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  {(selectedItem.contentFit ?? defaultContentFit(selectedItem.frame)) !== "stretch" && (
                    <VerticalPositionControl
                      value={selectedItem.contentY ?? 0.5}
                      onChange={(y) => changeContentY(selectedItem.id, y)}
                    />
                  )}
                  {selectedItem.frame !== "none" && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="item-corner-radius" className="text-xs text-slate-400">
                          Corner rounding
                        </label>
                        <span className="text-[11px] text-slate-500">
                          {Math.round((selectedItem.cornerRadiusPct ?? defaultCornerRadiusPct(selectedItem.frame)) * 100)}%
                        </span>
                      </div>
                      <input
                        id="item-corner-radius"
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.01}
                        value={selectedItem.cornerRadiusPct ?? defaultCornerRadiusPct(selectedItem.frame)}
                        onChange={(e) => changeCornerRadius(selectedItem.id, Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                      <p className="text-[11px] text-slate-500">
                        A real screen&apos;s rounded corners recess past this frame&apos;s screen cutout, so the
                        screenshot&apos;s square corners can poke past the curve. Round them off to tuck them back
                        inside.
                      </p>
                    </div>
                  )}
                </>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => bringToFront(selectedItem.id)}
                  className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500"
                >
                  Bring to front
                </button>
                <button
                  onClick={() => sendToBack(selectedItem.id)}
                  className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-xs hover:border-slate-500"
                >
                  Send to back
                </button>
              </div>
              <button
                onClick={() => removeItem(selectedItem.id)}
                className="w-full rounded-lg border border-red-800 px-3 py-2 text-xs text-red-400 hover:border-red-600"
              >
                Remove from canvas
              </button>
            </>
          ) : (
            <p className="text-sm text-slate-400">Click an item on the canvas to edit its frame and layering.</p>
          )}
        </aside>
      </div>
      {pendingFrameUpload && (
        <CornerPinEditor
          initialName={pendingFrameUpload.file.name.replace(/\.[^.]+$/, "")}
          imageUrl={pendingFrameUpload.url}
          imageWidth={pendingFrameUpload.width}
          imageHeight={pendingFrameUpload.height}
          busy={uploadingFrame}
          error={frameUploadError}
          onCancel={closePendingFrameUpload}
          onSave={handleSaveCustomFrame}
        />
      )}
      {editingFrame && editingFrame.kind === "custom" && (
        <CornerPinEditor
          title="Edit screen corners"
          description="Drag each of the 4 handles to correct this frame's screen area. Every board item already using this frame will pick up the correction."
          saveLabel="Save correction"
          initialName={editingFrame.frame.name}
          initialQuad={editingFrame.frame.screenQuad}
          imageUrl={customFrameSrc(editingFrame.frame.filename)}
          imageWidth={editingFrame.frame.imageWidth}
          imageHeight={editingFrame.frame.imageHeight}
          busy={editingFrameBusy}
          error={editingFrameError}
          onCancel={closeEditFrame}
          onSave={handleSaveFrameEdit}
        />
      )}
      {editingFrame && editingFrame.kind === "builtin" && (
        <CornerPinEditor
          title={`Edit ${BUILTIN_FRAME_LABELS[editingFrame.variant]} screen corners`}
          description="Drag each of the 4 handles to correct this frame's screen area. Every board item using this device frame — across every project — will pick up the correction."
          saveLabel="Save correction"
          showNameField={false}
          initialName={BUILTIN_FRAME_LABELS[editingFrame.variant]}
          initialQuad={builtinFrameOverrides[editingFrame.variant] ?? defaultScreenQuad(editingFrame.variant)}
          imageUrl={builtinFrameImageInfo(editingFrame.variant).src}
          imageWidth={builtinFrameImageInfo(editingFrame.variant).imageWidth}
          imageHeight={builtinFrameImageInfo(editingFrame.variant).imageHeight}
          busy={editingFrameBusy}
          error={editingFrameError}
          onCancel={closeEditFrame}
          onSave={handleSaveFrameEdit}
        />
      )}
    </div>
  );
}
