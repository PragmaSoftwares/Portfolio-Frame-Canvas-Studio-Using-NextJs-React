import type { CSSProperties } from "react";
import type { TextItem } from "@/types/board";
import { textBoxStyle, textContentStyle } from "@/lib/board/textStyle";

interface TextBoxProps {
  item: TextItem;
  style?: CSSProperties;
}

/**
 * A plain (non-editable) rendering of a text item — used by the bare render
 * route Playwright screenshots for export. The live editor renders the same
 * two-level styling (see textBoxStyle/textContentStyle) but with the inner
 * div made contentEditable instead, so an export always matches what was
 * last seen on the canvas.
 */
export function TextBox({ item, style }: TextBoxProps) {
  return (
    <div
      style={{
        position: "absolute",
        width: item.width,
        height: item.height,
        ...style,
      }}
    >
      <div style={textBoxStyle(item)}>
        <div style={textContentStyle(item)}>{item.text}</div>
      </div>
    </div>
  );
}
