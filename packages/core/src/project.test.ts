import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readAnnotationFile, renumberAllBadgesFiles, renumberBadges } from "./project.js";

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

describe("renumberAllBadgesFiles", () => {
  it("renumbers every annotation file and returns total badge count", () => {
    const root = mkdtempSync(join(tmpdir(), "mahomanual-renumber-all-"));
    try {
      mkdirSync(join(root, "annotations"), { recursive: true });
      writeFileSync(join(root, "manual.md"), "# t\n\n①②③\n", "utf8");
      const annotation = (badgeNs: number[]) => ({
        version: 1,
        canvas: { width: 100, height: 100 },
        objects: badgeNs.map((n, i) => ({
          id: `b${i}`,
          type: "badge",
          source: "manual",
          n,
          at: { x: 10, y: 10 },
        })),
      });
      writeFileSync(join(root, "annotations/a.json"), JSON.stringify(annotation([7, 3])), "utf8");
      writeFileSync(join(root, "annotations/b.json"), JSON.stringify(annotation([9])), "utf8");

      const result = renumberAllBadgesFiles(root);

      expect(result.totalBadges).toBe(3);
      const a = readAnnotationFile(root, "a");
      const b = readAnnotationFile(root, "b");
      expect(a.objects.map((o) => (o.type === "badge" ? o.n : -1))).toEqual([1, 2]);
      expect(b.objects.map((o) => (o.type === "badge" ? o.n : -1))).toEqual([1]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
