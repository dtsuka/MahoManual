import { describe, expect, it } from "vitest";
import {
  allowsObjectDrag,
  isEditingPlacedBadge,
  isRectCreationTool,
} from "./editor-tool.js";

describe("editor-tool", () => {
  it("isRectCreationTool identifies frame and mosaic", () => {
    expect(isRectCreationTool("frame")).toBe(true);
    expect(isRectCreationTool("mosaic")).toBe(true);
    expect(isRectCreationTool("badge")).toBe(false);
    expect(isRectCreationTool("select")).toBe(false);
  });

  it("isEditingPlacedBadge is true only for selected badge under badge tool", () => {
    expect(isEditingPlacedBadge("badge", "b1", ["b1"])).toBe(true);
    expect(isEditingPlacedBadge("badge", "b1", ["b2"])).toBe(false);
    expect(isEditingPlacedBadge("select", "b1", ["b1"])).toBe(false);
  });

  it("allowsObjectDrag permits select and editing placed badge", () => {
    expect(allowsObjectDrag("select", undefined, [])).toBe(true);
    expect(allowsObjectDrag("badge", "b1", ["b1"])).toBe(true);
    expect(allowsObjectDrag("text", "b1", ["b1"])).toBe(false);
  });
});
