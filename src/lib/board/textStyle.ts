import type { CSSProperties } from "react";
import type { TextItem } from "@/types/board";
import { cssFontFamily } from "@/lib/fonts";

/**
 * The CSS for a text item's own content box — shared between the live
 * editor (applied to a contentEditable div) and the export/render route
 * (applied to a plain TextBox div), so what you see while editing and what
 * actually gets exported can never drift apart. Overflow is deliberately
 * visible rather than clipped: a text box that doesn't fit its own
 * width/height should look like it needs resizing, not silently lose
 * content.
 */
export function textItemStyle(item: TextItem): CSSProperties {
  return {
    width: "100%",
    height: "100%",
    fontFamily: cssFontFamily(item.fontFamily),
    fontSize: item.fontSize,
    fontWeight: item.bold ? 700 : 400,
    fontStyle: item.italic ? "italic" : "normal",
    textDecoration: item.underline ? "underline" : "none",
    color: item.color,
    textAlign: item.align,
    letterSpacing: item.letterSpacing,
    lineHeight: item.lineHeight,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflow: "visible",
    outline: "none",
  };
}
