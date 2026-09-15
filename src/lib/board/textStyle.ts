import type { CSSProperties } from "react";
import type { TextItem } from "@/types/board";
import { cssFontFamily } from "@/lib/fonts";

/**
 * The outer box for a text item — a flex container so verticalAlign can
 * position the text within a box taller than the text itself, plus the
 * optional background plate and overall opacity (both apply to the box as
 * a whole, not just the text). Split from textContentStyle so the plate
 * spans the full declared box even when the text itself is shorter/narrower
 * than it, matching how a caption/banner background would actually be used.
 */
export function textBoxStyle(item: TextItem): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: item.verticalAlign === "middle" ? "center" : item.verticalAlign === "bottom" ? "flex-end" : "flex-start",
    backgroundColor: item.backgroundColor ?? "transparent",
    padding: item.backgroundColor ? "0.15em 0.3em" : 0,
    opacity: item.opacity,
  };
}

/**
 * The actual text styling — shared between the live editor (applied to a
 * contentEditable div nested inside textBoxStyle's container) and the
 * export/render route (applied the same way inside TextBox), so what you
 * see while editing and what actually gets exported can never drift apart.
 * Overflow is left at its CSS default (visible) rather than clipped: a text
 * box that doesn't fit its own width/height should look like it needs
 * resizing, not silently lose content.
 */
export function textContentStyle(item: TextItem): CSSProperties {
  return {
    width: "100%",
    fontFamily: cssFontFamily(item.fontFamily),
    fontSize: item.fontSize,
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic ? "italic" : "normal",
    textDecoration: item.underline ? "underline" : "none",
    textTransform: item.textTransform,
    color: item.color,
    textAlign: item.align,
    letterSpacing: item.letterSpacing,
    lineHeight: item.lineHeight,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    outline: "none",
    textShadow: item.textShadowColor
      ? `${item.textShadowOffsetX}px ${item.textShadowOffsetY}px ${item.textShadowBlur}px ${item.textShadowColor}`
      : "none",
    WebkitTextStrokeWidth: item.textStrokeColor ? `${item.textStrokeWidth}px` : undefined,
    WebkitTextStrokeColor: item.textStrokeColor,
  };
}
