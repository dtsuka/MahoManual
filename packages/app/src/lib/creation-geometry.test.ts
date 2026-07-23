import { describe, expect, it } from "vitest";
import { resolveLineDraftPoint, roundCreationPct } from "./creation-geometry.js";
import { snapAngle } from "./geometry.js";

describe("resolveLineDraftPoint", () => {
  const previous = { x: 20, y: 20 };

  it("returns the rounded point when Shift is not held", () => {
    expect(resolveLineDraftPoint({ x: 30.2, y: 21.1 }, previous, { shiftKey: false })).toEqual({
      x: roundCreationPct(30.2),
      y: roundCreationPct(21.1),
    });
  });

  it("does not snap the first point even when Shift is held", () => {
    expect(resolveLineDraftPoint({ x: 30.2, y: 21.1 }, undefined, { shiftKey: true })).toEqual({
      x: roundCreationPct(30.2),
      y: roundCreationPct(21.1),
    });
  });

  it("snaps nearly horizontal placement to exactly horizontal when Shift is held", () => {
    const snapped = resolveLineDraftPoint({ x: 30, y: 21 }, previous, { shiftKey: true });
    expect(snapped.y).toBe(20);
    expect(snapped.x).toBeGreaterThan(20);
  });

  it("snaps to the 45deg diagonal when Shift is held", () => {
    const snapped = resolveLineDraftPoint({ x: 30, y: 29 }, previous, { shiftKey: true });
    expect(snapped.x - previous.x).toBeCloseTo(snapped.y - previous.y, 5);
  });

  it("keeps unrounded coordinates for hover preview", () => {
    const pointer = { x: 30, y: 21 };
    expect(
      resolveLineDraftPoint(pointer, previous, { shiftKey: true, round: false }),
    ).toEqual(snapAngle(pointer, previous));
  });
});
