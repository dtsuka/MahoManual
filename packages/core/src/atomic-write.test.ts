import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeAnnotationFileAtomic, writeFileAtomic } from "./atomic-write.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "mahomanual-atomic-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("writeFileAtomic", () => {
  it("replaces the file content and leaves no temporary file", () => {
    const path = join(dir, "manual.md");
    writeFileAtomic(path, "first");
    writeFileAtomic(path, "second");
    expect(readFileSync(path, "utf8")).toBe("second");
    expect(readdirSync(dir)).toEqual(["manual.md"]);
  });

  it("removes the temporary file when the rename fails", () => {
    const path = join(dir, "target");
    mkdirSync(join(path, "child"), { recursive: true });
    expect(() => writeFileAtomic(path, "x")).toThrow();
    expect(readdirSync(dir)).toEqual(["target"]);
  });
});

describe("writeAnnotationFileAtomic", () => {
  it("validates and writes the annotation in the same format as writeAnnotationFile", () => {
    const annotation = { version: 1 as const, canvas: { width: 10, height: 10 }, objects: [] };
    writeAnnotationFileAtomic(dir, "a1", annotation);
    expect(readFileSync(join(dir, "annotations/a1.json"), "utf8")).toBe(
      `${JSON.stringify(annotation, null, 2)}\n`,
    );
  });

  it("rejects invalid annotations and unsafe ids without writing", () => {
    expect(() =>
      writeAnnotationFileAtomic(dir, "a1", { version: 2 } as never),
    ).toThrow();
    expect(() =>
      writeAnnotationFileAtomic(dir, "../a1", { version: 1, canvas: { width: 1, height: 1 }, objects: [] }),
    ).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});
