import { describe, expect, it } from "vitest";
import {
  classifyTextPointerDown,
  rememberTextPointerClick,
} from "./text-edit-gesture.js";

describe("classifyTextPointerDown", () => {
  it("opens edit on a second click within the double-click window", () => {
    const memory = rememberTextPointerClick("t1", 1000);
    expect(classifyTextPointerDown(memory, "t1", 1400)).toEqual({ openEdit: true });
  });

  it("does not open edit when the second click is too late or on another object", () => {
    const memory = rememberTextPointerClick("t1", 1000);
    expect(classifyTextPointerDown(memory, "t1", 1600)).toEqual({ openEdit: false });
    expect(classifyTextPointerDown(memory, "t2", 1200)).toEqual({ openEdit: false });
  });
});
