import { describe, expect, it } from "vitest";
import { renumberBadges } from "./project.js";

describe("renumberBadges", () => {
  it("renumbers badges in array order starting from 1", () => {
    const result = renumberBadges({
      version: 1,
      canvas: { width: 100, height: 100 },
      objects: [
        { id: "b1", type: "badge", source: "manual", n: 5, at: { x: 10, y: 10 } },
        { id: "t1", type: "text", source: "manual", content: "x", at: { x: 20, y: 20 } },
        { id: "b2", type: "badge", source: "manual", n: 2, at: { x: 30, y: 30 } },
        { id: "b3", type: "badge", source: "manual", n: 9, at: { x: 40, y: 40 } },
      ],
    });

    const badges = result.objects.filter((obj) => obj.type === "badge");
    expect(badges.map((obj) => obj.n)).toEqual([1, 2, 3]);
  });
});
