import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { repoRoot } from "../server/paths.js";

// サーバーのテストはリポジトリの projects/ を使わず、一時フォルダにプロジェクトを作る
export function createTempProjectsDir(): string {
  return mkdtempSync(join(tmpdir(), "mahomanual-app-"));
}

export function setupTestProject(projectsDir: string, name: string, annotationId = "test-1"): string {
  const root = join(projectsDir, name);
  mkdirSync(join(root, "annotations"), { recursive: true });
  mkdirSync(join(root, "img", "raw"), { recursive: true });
  writeFileSync(
    join(root, "manual.md"),
    `# Test Manual\n\n## Section\n\n\`\`\`annotated-image\nsrc: ${annotationId}\n\`\`\`\n`,
    "utf8",
  );
  const exampleImage = join(repoRoot, "packages/core/tests/fixtures/projects/demo/img/demo.png");
  copyFileSync(exampleImage, join(root, `img/raw/${annotationId}.png`));
  copyFileSync(exampleImage, join(root, `img/${annotationId}.png`));
  writeFileSync(
    join(root, `annotations/${annotationId}.json`),
    JSON.stringify(
      {
        version: 1,
        canvas: { width: 800, height: 600 },
        objects: [
          {
            id: "img-main",
            type: "image",
            source: "manual",
            src: `img/raw/${annotationId}.png`,
            rect: { x: 0, y: 0, w: 100, h: 100 },
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
  return root;
}

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

/** 指定サイズの単色(黒)PNG */
export function makePng(width: number, height: number): Buffer {
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

export function pngDataUrl(width: number, height: number): string {
  return `data:image/png;base64,${makePng(width, height).toString("base64")}`;
}

export function jsonInit(method: string, body: unknown, headers: Record<string, string> = {}): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}
