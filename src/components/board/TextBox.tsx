import type { CSSProperties } from "react";
import type { TextItem } from "@/types/board";
import { textItemStyle } from "@/lib/board/textStyle";

interface TextBoxProps {
  item: TextItem;
  style?: CSSProperties;
}

/**
 * A plain (non-editable) rendering of a text item — used by the bare render
 * route Playwright screenshots for export. The live editor renders the same
 * styling (see textItemStyle) but on a contentEditable div instead, so an
 * export always matches what was last seen on the canvas.
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
      <div style={textItemStyle(item)}>{item.text}</div>
    </div>
  );
}
