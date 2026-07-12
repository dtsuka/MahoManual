import { describe, expect, it } from "vitest";
import {
  classifySelectPointerGesture,
  resolveCanvasObjectElement,
  resolveCanvasObjectTargets,
  type CanvasObjectTargets,
} from "../src/lib/canvas-hit-test.js";

function fakeElement(options: {
  id?: string;
  classes?: string[];
  closestId?: string;
  closestClasses?: string[];
}): HTMLElement {
  const classes = new Set(options.classes ?? []);
  const closestClasses = new Set(options.closestClasses ?? options.classes ?? []);
  const closestId = options.closestId ?? options.id;
  return {
    classList: {
      contains: (name: string) => classes.has(name),
    },
    matches: (selector: string) => {
      if (selector === ".mm-badge, .mm-text, .mm-cursor") {
        return classes.has("mm-badge") || classes.has("mm-text") || classes.has("mm-cursor");
      }
      return false;
    },
    dataset: { mmId: options.id },
    closest: (selector: string) => {
      if (selector !== "[data-mm-id]" || !closestId) {
        return null;
      }
      return fakeElement({
        id: closestId,
        classes: [...closestClasses],
      });
    },
  } as unknown as HTMLElement;
}

describe("resolveCanvasObjectTargets", () => {
  it("returns the direct target when it is not a frame", () => {
    const badge = fakeElement({ id: "b1", classes: ["mm-badge"] });
    const targets = resolveCanvasObjectTargets({
      clientX: 10,
      clientY: 20,
      target: badge,
    });
    expect(targets.direct?.dataset.mmId).toBe("b1");
    expect(targets.point?.dataset.mmId).toBe("b1");
  });

  it("looks under a frame for point objects via elementsFromPoint", () => {
    const frame = fakeElement({ id: "f1", classes: ["mm-frame"] });
    const badge = fakeElement({ id: "b1", classes: ["mm-badge"] });
    const targets = resolveCanvasObjectTargets(
      { clientX: 10, clientY: 20, target: frame },
      () => [frame, badge],
    );
    expect(targets.direct?.dataset.mmId).toBe("f1");
    expect(targets.point?.dataset.mmId).toBe("b1");
  });

  it("prefers the point under a frame for resolveCanvasObjectElement", () => {
    const frame = fakeElement({ id: "f1", classes: ["mm-frame"] });
    const badge = fakeElement({ id: "b1", classes: ["mm-badge"] });
    const element = resolveCanvasObjectElement(
      { clientX: 10, clientY: 20, target: frame },
      () => [frame, badge],
    );
    expect(element?.dataset.mmId).toBe("b1");
  });
});

describe("classifySelectPointerGesture", () => {
  const frameAndPoint: CanvasObjectTargets = {
    direct: fakeElement({ id: "f1", classes: ["mm-frame"] }),
    point: fakeElement({ id: "b1", classes: ["mm-badge"] }),
  };

  it("defers click-through when an editable frame covers a point in select mode", () => {
    expect(classifySelectPointerGesture(frameAndPoint, {
      isSelectMode: true,
      isEditableFrame: () => true,
    })).toEqual({
      kind: "drag",
      objectId: "f1",
      clickThroughId: "b1",
    });
  });

  it("does not defer when the frame is locked", () => {
    expect(classifySelectPointerGesture(frameAndPoint, {
      isSelectMode: true,
      isEditableFrame: () => false,
    })).toEqual({ kind: "drag", objectId: "b1" });
  });

  it("does not defer outside select mode", () => {
    expect(classifySelectPointerGesture(frameAndPoint, {
      isSelectMode: false,
      isEditableFrame: () => true,
    })).toEqual({ kind: "drag", objectId: "b1" });
  });

  it("returns none when nothing is hit", () => {
    expect(classifySelectPointerGesture(
      { direct: null, point: null },
      { isSelectMode: true, isEditableFrame: () => true },
    )).toEqual({ kind: "none" });
  });
});
