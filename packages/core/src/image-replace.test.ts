import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ImageOperationError, importPastedImage, replaceImageObject } from "./image-replace.js";

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

// 指定サイズの単色(黒)PNG を作る
function makePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let root: string;

function writeAnnotation(id: string, annotation: unknown): void {
  writeFileSync(join(root, "annotations", `${id}.json`), `${JSON.stringify(annotation, null, 2)}\n`);
}

function readJson(id: string): string {
  return readFileSync(join(root, "annotations", `${id}.json`), "utf8");
}

const baseAnnotation = (locked?: boolean) => ({
  version: 1,
  canvas: { width: 800, height: 600 },
  objects: [
    {
      id: "img-main",
      type: "image",
      source: "manual",
      ...(locked === undefined ? {} : { locked }),
      src: "img/raw/a1.png",
      rect: { x: 0, y: 0, w: 100, h: 100 },
    },
    { id: "b1", type: "badge", source: "manual", n: 1, at: { x: 10, y: 10 } },
  ],
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "mahomanual-image-"));
  mkdirSync(join(root, "annotations"), { recursive: true });
  mkdirSync(join(root, "img", "raw"), { recursive: true });
  writeFileSync(join(root, "manual.md"), "# T\n");
  writeFileSync(join(root, "img/raw/a1.png"), makePng(8, 6));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("replaceImageObject", () => {
  it("replaces the image file and updates crop and canvas from the new size", () => {
    writeAnnotation("a1", baseAnnotation(false));
    const next = makePng(320, 200);
    const updated = replaceImageObject(root, "a1", "img-main", next, { width: 320, height: 200 });
    expect(updated.canvas).toEqual({ width: 320, height: 200 });
    expect(updated.objects.find((obj) => obj.id === "img-main")).toMatchObject({
      crop: { x: 0, y: 0, w: 320, h: 200 },
    });
    expect(updated.objects.find((obj) => obj.id === "b1")).toBeDefined();
    expect(readFileSync(join(root, "img/raw/a1.png")).equals(next)).toBe(true);
    expect(JSON.parse(readJson("a1")).canvas).toEqual({ width: 320, height: 200 });
  });

  it("refuses to replace a locked image and leaves the files unchanged", () => {
    // locked 省略のベース画像は既定でロック扱い(SPEC §11)
    for (const locked of [true, undefined]) {
      writeAnnotation("a1", baseAnnotation(locked));
      const beforeJson = readJson("a1");
      const beforeImage = readFileSync(join(root, "img/raw/a1.png"));
      let error: unknown;
      try {
        replaceImageObject(root, "a1", "img-main", makePng(4, 4), { width: 4, height: 4 });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ImageOperationError);
      expect((error as ImageOperationError).reason).toBe("locked");
      expect(readJson("a1")).toBe(beforeJson);
      expect(readFileSync(join(root, "img/raw/a1.png")).equals(beforeImage)).toBe(true);
    }
  });

  it("reports a missing annotation or image object as not-found", () => {
    writeAnnotation("a1", baseAnnotation(false));
    for (const [annotationId, objectId] of [
      ["missing", "img-main"],
      ["a1", "missing"],
      ["a1", "b1"],
    ] as const) {
      expect(() =>
        replaceImageObject(root, annotationId, objectId, makePng(4, 4), { width: 4, height: 4 }),
      ).toThrow(expect.objectContaining({ reason: "not-found" }));
    }
  });

  it("validates the new annotation before writing anything", () => {
    writeAnnotation("a1", baseAnnotation(false));
    const beforeJson = readJson("a1");
    const beforeImage = readFileSync(join(root, "img/raw/a1.png"));
    for (const size of [
      { width: 0, height: 10 },
      { width: -5, height: 10 },
      { width: Number.NaN, height: 10 },
    ]) {
      expect(() => replaceImageObject(root, "a1", "img-main", makePng(4, 4), size)).toThrow(
        expect.objectContaining({ reason: "invalid" }),
      );
    }
    expect(readJson("a1")).toBe(beforeJson);
    expect(readFileSync(join(root, "img/raw/a1.png")).equals(beforeImage)).toBe(true);
  });

  it("leaves the annotation unchanged when the image cannot be written", () => {
    const annotation = baseAnnotation(false);
    annotation.objects[0] = { ...annotation.objects[0]!, src: "img/raw/folder.png" } as never;
    mkdirSync(join(root, "img/raw/folder.png"));
    writeAnnotation("a1", annotation);
    const beforeJson = readJson("a1");
    expect(() =>
      replaceImageObject(root, "a1", "img-main", makePng(4, 4), { width: 4, height: 4 }),
    ).toThrow();
    expect(readJson("a1")).toBe(beforeJson);
    expect(readdirSync(join(root, "img/raw")).sort()).toEqual(["a1.png", "folder.png"]);
    expect(readdirSync(join(root, "annotations"))).toEqual(["a1.json"]);
  });
});

describe("importPastedImage", () => {
  it("saves the image and creates the annotation skeleton", () => {
    const png = makePng(40, 30);
    const result = importPastedImage(root, "p1", png, { width: 40, height: 30 });
    expect(result.annotation.canvas).toEqual({ width: 40, height: 30 });
    expect(readFileSync(join(root, "img/raw/p1.png")).equals(png)).toBe(true);
    expect(existsSync(join(root, "annotations/p1.json"))).toBe(true);
  });

  it("rejects an existing annotation id without touching any file", () => {
    writeAnnotation("a1", baseAnnotation());
    const beforeJson = readJson("a1");
    const beforeImage = readFileSync(join(root, "img/raw/a1.png"));
    expect(() => importPastedImage(root, "a1", makePng(4, 4), { width: 4, height: 4 })).toThrow(
      expect.objectContaining({ reason: "conflict" }),
    );
    expect(readJson("a1")).toBe(beforeJson);
    expect(readFileSync(join(root, "img/raw/a1.png")).equals(beforeImage)).toBe(true);
  });

  it("does not leave image files behind when the canvas size is invalid", () => {
    expect(() => importPastedImage(root, "neg", makePng(4, 4), { width: -5, height: 10 })).toThrow(
      expect.objectContaining({ reason: "invalid" }),
    );
    expect(existsSync(join(root, "img/raw/neg.png"))).toBe(false);
    expect(existsSync(join(root, "img/neg.png"))).toBe(false);
    expect(existsSync(join(root, "annotations/neg.json"))).toBe(false);
  });

  it("rejects unsafe ids", () => {
    expect(() => importPastedImage(root, "../evil", makePng(4, 4), { width: 4, height: 4 })).toThrow();
    expect(existsSync(join(root, "img/evil.png"))).toBe(false);
  });
});
