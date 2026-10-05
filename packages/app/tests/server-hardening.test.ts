import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../server/app.js";
import { closeAllWatchers } from "../server/watch.js";
import {
  createTempProjectsDir,
  jsonInit,
  makePng,
  pngDataUrl,
  setupTestProject,
} from "./server-fixtures.js";

const projectsDir = createTempProjectsDir();
const app = createApp({ projectsDir });
const P = "hardening";
let root = "";

function annotationJson(id = "test-1"): string {
  return readFileSync(join(root, "annotations", `${id}.json`), "utf8");
}

function unlockBaseImage(id = "test-1"): void {
  const annotation = JSON.parse(annotationJson(id)) as { objects: Array<{ id: string; locked?: boolean }> };
  annotation.objects = annotation.objects.map((obj) => (obj.id === "img-main" ? { ...obj, locked: false } : obj));
  writeFileSync(join(root, "annotations", `${id}.json`), `${JSON.stringify(annotation, null, 2)}\n`);
}

async function expectJsonError(response: Response, status: number): Promise<void> {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  const payload = (await response.json()) as { error?: unknown };
  expect(typeof payload.error).toBe("string");
}

beforeEach(() => {
  rmSync(join(projectsDir, P), { recursive: true, force: true });
  root = setupTestProject(projectsDir, P);
});

afterAll(async () => {
  await closeAllWatchers();
  rmSync(projectsDir, { recursive: true, force: true });
});

describe("cross-site requests and DNS rebinding", () => {
  it("rejects requests whose Host is not a local address", async () => {
    for (const host of ["evil.example", "evil.example:5173", "192.168.0.10:3000", "localhost.evil.example"]) {
      const response = await app.request("/api/projects", { headers: { Host: host } });
      await expectJsonError(response, 403);
    }
    const files = await app.request(`/api/projects/${P}/files/img/raw/test-1.png`, {
      headers: { Host: "evil.example:3000" },
    });
    expect(files.status).toBe(403);
  });

  it("accepts local Host headers on any port", async () => {
    for (const host of ["localhost", "localhost:5173", "127.0.0.1:3000", "[::1]:5173"]) {
      const response = await app.request("/api/projects", { headers: { Host: host } });
      expect(response.status, host).toBe(200);
    }
  });

  it("rejects writes from a non-local Origin", async () => {
    const response = await app.request(
      "/api/projects",
      jsonInit("POST", { id: "csrf-created", title: "pwned" }, { Origin: "https://evil.example" }),
    );
    await expectJsonError(response, 403);
    expect(existsSync(join(projectsDir, "csrf-created"))).toBe(false);

    const nullOrigin = await app.request(
      `/api/projects/${P}/manual`,
      jsonInit("PUT", { body: "pwned" }, { Origin: "null" }),
    );
    expect(nullOrigin.status).toBe(403);

    const renumber = await app.request(`/api/projects/${P}/renumber`, {
      method: "POST",
      headers: { Origin: "http://localhost.evil.example:5173" },
    });
    expect(renumber.status).toBe(403);
    expect(readFileSync(join(root, "manual.md"), "utf8")).not.toContain("pwned");
  });

  it("rejects writes marked as cross-site by Sec-Fetch-Site", async () => {
    const response = await app.request(
      `/api/projects/${P}/manual`,
      jsonInit("PUT", { body: "pwned" }, { "Sec-Fetch-Site": "cross-site" }),
    );
    await expectJsonError(response, 403);
    expect(readFileSync(join(root, "manual.md"), "utf8")).not.toContain("pwned");
  });

  it("accepts writes from local origins", async () => {
    for (const origin of ["http://127.0.0.1:5173", "http://localhost:3000", "http://[::1]:5173"]) {
      const response = await app.request(
        `/api/projects/${P}/manual`,
        jsonInit("PUT", { body: `# ok ${origin}\n` }, { Origin: origin, "Sec-Fetch-Site": "same-origin" }),
      );
      expect(response.status, origin).toBe(200);
    }
  });

  it("requires a JSON Content-Type for request bodies", async () => {
    const response = await app.request("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ id: "plain-created", title: "x" }),
    });
    await expectJsonError(response, 415);
    expect(existsSync(join(projectsDir, "plain-created"))).toBe(false);

    const missing = await app.request(`/api/projects/${P}/manual`, {
      method: "PUT",
      body: JSON.stringify({ body: "no content type" }),
    });
    expect(missing.status).toBe(415);

    const withCharset = await app.request(`/api/projects/${P}/manual`, {
      method: "PUT",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ body: "# charset ok\n" }),
    });
    expect(withCharset.status).toBe(200);
  });
});

describe("JSON request bodies", () => {
  const writeEndpoints = (): Array<[string, string]> => [
    ["POST", "/api/projects"],
    ["PUT", `/api/projects/${P}/output`],
    ["PUT", `/api/projects/${P}/title`],
    ["PUT", `/api/projects/${P}/manual`],
    ["PUT", `/api/projects/${P}/theme`],
    ["PUT", `/api/projects/${P}/annotations/test-1`],
    ["PATCH", `/api/projects/${P}/annotations/test-1/id`],
    ["POST", `/api/projects/${P}/images`],
    ["POST", `/api/projects/${P}/annotations/test-1/images`],
    ["PUT", `/api/projects/${P}/annotations/test-1/images/img-main`],
    ["POST", `/api/projects/${P}/preview`],
  ];

  it("returns 400 with a JSON error for malformed JSON, null and non-object bodies", async () => {
    const before = annotationJson();
    for (const [method, path] of writeEndpoints()) {
      for (const body of ["{bad", "null", "[]", '"text"', "42", ""]) {
        const response = await app.request(path, jsonInit(method, body));
        expect(response.status, `${method} ${path} ${body}`).toBe(400);
        expect(response.headers.get("content-type")).toContain("application/json");
      }
    }
    expect(annotationJson()).toBe(before);
  });

  it("returns 400 when string fields have other types", async () => {
    const rename = await app.request(
      `/api/projects/${P}/annotations/test-1/id`,
      jsonInit("PATCH", { id: 5 }),
    );
    await expectJsonError(rename, 400);

    for (const body of [{ id: 5 }, { id: "ok-id", title: 5 }]) {
      const created = await app.request("/api/projects", jsonInit("POST", body));
      await expectJsonError(created, 400);
    }
    expect(existsSync(join(projectsDir, "ok-id"))).toBe(false);

    const images = await app.request(`/api/projects/${P}/images`, jsonInit("POST", { id: 5, data: 5 }));
    await expectJsonError(images, 400);
  });

  it("POST /api/projects returns the stored (normalized) title", async () => {
    const response = await app.request(
      "/api/projects",
      jsonInit("POST", { id: "normalized-title", title: "  一行目\n二行目  " }),
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "normalized-title", title: "一行目 二行目" });

    const fallback = await app.request("/api/projects", jsonInit("POST", { id: "no-title" }));
    expect(fallback.status).toBe(201);
    expect(await fallback.json()).toEqual({ id: "no-title", title: "no-title" });
  });

  it("returns a JSON error when project.yaml cannot be parsed", async () => {
    writeFileSync(join(root, "project.yaml"), "title: [unclosed\n");
    const response = await app.request(`/api/projects/${P}/title`);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(typeof ((await response.json()) as { error?: unknown }).error).toBe("string");
  });
});

describe("GET /api/watch/:project", () => {
  it("rejects unsafe or unknown project names before watching", async () => {
    for (const name of [encodeURIComponent("../../.."), "does-not-exist", encodeURIComponent("..")]) {
      const response = await app.request(`/api/watch/${name}`);
      await expectJsonError(response, 404);
    }
  });
});

describe("files endpoint", () => {
  it("does not serve paths with segments starting with a dot", async () => {
    mkdirSync(join(root, ".auth"), { recursive: true });
    writeFileSync(join(root, ".auth/state.json"), '{"cookies":"SECRET"}');
    writeFileSync(join(root, "img/.hidden.png"), makePng(1, 1));
    for (const path of [".auth/state.json", "img/.hidden.png", `${encodeURIComponent(".auth")}/state.json`]) {
      const response = await app.request(`/api/projects/${P}/files/${path}`);
      expect(response.status, path).toBe(404);
    }
  });

  it("returns 404 for directories instead of failing", async () => {
    for (const path of ["img", "img/raw", "annotations"]) {
      const response = await app.request(`/api/projects/${P}/files/${path}`);
      expect(response.status, path).toBe(404);
    }
  });

  it("does not follow symbolic links that leave the project", async () => {
    const outside = join(projectsDir, "outside-secret.png");
    writeFileSync(outside, makePng(2, 2));
    symlinkSync(outside, join(root, "img/link.png"));
    symlinkSync(projectsDir, join(root, "img/linkdir"));
    for (const path of ["img/link.png", "img/linkdir/outside-secret.png"]) {
      const response = await app.request(`/api/projects/${P}/files/${path}`);
      expect(response.status, path).toBe(404);
    }
  });

  it("serves image files whose names contain % or Japanese characters", async () => {
    writeFileSync(join(root, "img/raw/100%.png"), makePng(1, 1));
    writeFileSync(join(root, "img/raw/画面.png"), makePng(1, 1));
    for (const name of ["100%.png", "画面.png"]) {
      const response = await app.request(`/api/projects/${P}/files/img/raw/${encodeURIComponent(name)}`);
      expect(response.status, name).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/png");
    }
  });
});

describe("image uploads", () => {
  it("rejects request bodies larger than the upload limit", async () => {
    const big = `data:image/png;base64,${"A".repeat(31 * 1024 * 1024)}`;
    const response = await app.request(`/api/projects/${P}/images`, jsonInit("POST", { id: "big", data: big }));
    await expectJsonError(response, 413);
    expect(existsSync(join(root, "img/raw/big.png"))).toBe(false);
  });

  it("rejects data that is not a PNG/JPEG/WebP/GIF image and writes nothing", async () => {
    const garbage = `data:image/png;base64,${Buffer.from("hello world, not an image").toString("base64")}`;
    const svg = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>').toString("base64")}`;
    const svgAsPng = `data:image/png;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>').toString("base64")}`;
    const rawBase64 = makePng(4, 4).toString("base64");
    const beforeJson = annotationJson();
    for (const data of [garbage, svg, svgAsPng, rawBase64, "", "data:image/png;base64,"]) {
      const pasted = await app.request(
        `/api/projects/${P}/images`,
        jsonInit("POST", { id: "bad-image", data, width: 100, height: 100 }),
      );
      await expectJsonError(pasted, 400);

      const added = await app.request(
        `/api/projects/${P}/annotations/test-1/images`,
        jsonInit("POST", { objectId: "bad-extra", data, width: 100, height: 100 }),
      );
      await expectJsonError(added, 400);
    }
    expect(existsSync(join(root, "img/raw/bad-image.png"))).toBe(false);
    expect(existsSync(join(root, "img/bad-image.png"))).toBe(false);
    expect(existsSync(join(root, "annotations/bad-image.json"))).toBe(false);
    expect(existsSync(join(root, "img/raw/test-1-bad-extra.png"))).toBe(false);
    expect(annotationJson()).toBe(beforeJson);
  });

  it("uses the decoded image size instead of the size sent by the client", async () => {
    const pasted = await app.request(
      `/api/projects/${P}/images`,
      jsonInit("POST", { id: "sized", data: pngDataUrl(40, 30), width: 5000, height: -1 }),
    );
    expect(pasted.status).toBe(200);
    const payload = (await pasted.json()) as { annotation: { canvas: unknown } };
    expect(payload.annotation.canvas).toEqual({ width: 40, height: 30 });

    const noSize = await app.request(
      `/api/projects/${P}/images`,
      jsonInit("POST", { id: "no-size", data: pngDataUrl(24, 12) }),
    );
    expect(noSize.status).toBe(200);
    expect(((await noSize.json()) as { annotation: { canvas: unknown } }).annotation.canvas).toEqual({
      width: 24,
      height: 12,
    });

    const added = await app.request(
      `/api/projects/${P}/annotations/test-1/images`,
      jsonInit("POST", { objectId: "img-sized", data: pngDataUrl(400, 200), width: "abc", height: 1 }),
    );
    expect(added.status).toBe(201);
    const addedPayload = (await added.json()) as {
      annotation: { objects: Array<{ id: string; crop?: unknown }> };
    };
    expect(addedPayload.annotation.objects.find((obj) => obj.id === "img-sized")?.crop).toEqual({
      x: 0,
      y: 0,
      w: 400,
      h: 200,
    });
  });

  it("includes theme and creation defaults in the add-image response", async () => {
    writeFileSync(
      join(root, "project.yaml"),
      'title: t\nannotation:\n  color: "#336699"\n  defaults:\n    badge:\n      size: 30\n',
    );
    const response = await app.request(
      `/api/projects/${P}/annotations/test-1/images`,
      jsonInit("POST", { objectId: "img-extra", data: pngDataUrl(10, 10) }),
    );
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { theme?: unknown; defaults?: unknown };
    expect(payload.theme).toEqual({ color: "#336699" });
    expect(payload.defaults).toEqual({ badge: { size: 30 } });
  });
});

describe("image replace", () => {
  it("refuses to replace a locked image and changes no file", async () => {
    // img-main は locked 省略のベース画像なので既定でロック扱い
    const beforeJson = annotationJson();
    const beforeImage = readFileSync(join(root, "img/raw/test-1.png"));
    const response = await app.request(
      `/api/projects/${P}/annotations/test-1/images/img-main`,
      jsonInit("PUT", { data: pngDataUrl(20, 10) }),
    );
    await expectJsonError(response, 409);
    expect(annotationJson()).toBe(beforeJson);
    expect(readFileSync(join(root, "img/raw/test-1.png")).equals(beforeImage)).toBe(true);
  });

  it("changes no file when the uploaded image is invalid", async () => {
    unlockBaseImage();
    const beforeJson = annotationJson();
    const beforeImage = readFileSync(join(root, "img/raw/test-1.png"));
    for (const body of [
      { data: `data:image/png;base64,${Buffer.from("not an image").toString("base64")}` },
      { data: pngDataUrl(4, 4).replace("data:image/png", "data:image/svg+xml") },
      { data: 42 },
    ]) {
      const response = await app.request(
        `/api/projects/${P}/annotations/test-1/images/img-main`,
        jsonInit("PUT", body),
      );
      await expectJsonError(response, 400);
    }
    expect(annotationJson()).toBe(beforeJson);
    expect(readFileSync(join(root, "img/raw/test-1.png")).equals(beforeImage)).toBe(true);
  });

  it("returns 404 for a missing image object", async () => {
    const response = await app.request(
      `/api/projects/${P}/annotations/test-1/images/missing`,
      jsonInit("PUT", { data: pngDataUrl(4, 4) }),
    );
    await expectJsonError(response, 404);
  });

  it("uses the decoded size and includes theme and defaults in the response", async () => {
    unlockBaseImage();
    writeFileSync(
      join(root, "project.yaml"),
      "title: t\nannotation:\n  fontSize: 16\n  defaults:\n    frame:\n      strokeWidth: 3\n",
    );
    const png = makePng(64, 48);
    const response = await app.request(
      `/api/projects/${P}/annotations/test-1/images/img-main`,
      jsonInit("PUT", { data: `data:image/png;base64,${png.toString("base64")}`, width: 9999, height: 1 }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      annotation: { canvas: unknown; objects: Array<{ id: string; crop?: unknown }> };
      theme?: unknown;
      defaults?: unknown;
    };
    expect(payload.annotation.canvas).toEqual({ width: 64, height: 48 });
    expect(payload.annotation.objects.find((obj) => obj.id === "img-main")?.crop).toEqual({
      x: 0,
      y: 0,
      w: 64,
      h: 48,
    });
    expect(payload.theme).toEqual({ fontSize: 16 });
    expect(payload.defaults).toEqual({ frame: { strokeWidth: 3 } });
    expect(readFileSync(join(root, "img/raw/test-1.png")).equals(png)).toBe(true);
  });
});

describe("theme", () => {
  it("validates creation defaults and writes nothing when they are invalid", async () => {
    writeFileSync(join(root, "project.yaml"), "title: t\n");
    for (const defaults of [
      { badge: { size: "huge", color: 42 } },
      { bogus: 1 },
      { text: { textAlign: "justify" } },
      "badge",
      [1],
    ]) {
      const response = await app.request(
        `/api/projects/${P}/theme`,
        jsonInit("PUT", { color: "#ff6600", defaults }),
      );
      await expectJsonError(response, 400);
    }
    expect(readFileSync(join(root, "project.yaml"), "utf8")).toBe("title: t\n");
  });

  it("saves valid creation defaults", async () => {
    writeFileSync(join(root, "project.yaml"), "title: t\n");
    const response = await app.request(
      `/api/projects/${P}/theme`,
      jsonInit("PUT", { defaults: { badge: { size: 30 }, arrow: { arrowHeads: "both" } } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      theme: {},
      defaults: { badge: { size: 30 }, arrow: { arrowHeads: "both" } },
    });
  });

  it("can reset the theme of a project without project.yaml", async () => {
    expect(existsSync(join(root, "project.yaml"))).toBe(false);
    for (const body of [{}, { defaults: null }, { color: null, fontSize: null }]) {
      const response = await app.request(`/api/projects/${P}/theme`, jsonInit("PUT", body));
      expect(response.status, JSON.stringify(body)).toBe(200);
      expect(await response.json()).toEqual({ theme: {}, defaults: {} });
    }
  });

  it("ignores invalid defaults stored in project.yaml when reading", async () => {
    writeFileSync(
      join(root, "project.yaml"),
      'title: t\nannotation:\n  defaults:\n    badge:\n      size: huge\n      color: "#123456"\n    bogus: 1\n',
    );
    const response = await app.request(`/api/projects/${P}/theme`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ theme: {}, defaults: { badge: { color: "#123456" } } });
  });
});

describe("downloads with non-ASCII names", () => {
  const J = "テスト案件";
  const A = "画面一";

  beforeEach(() => {
    rmSync(join(projectsDir, J), { recursive: true, force: true });
    setupTestProject(projectsDir, J, A);
  });

  function expectAttachment(header: string | null, name: string): void {
    expect(header).toMatch(/^attachment; filename="[\x20-\x7e]+"; filename\*=UTF-8''/);
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent(name)}`);
  }

  it("downloads HTML for a project with a Japanese ID", async () => {
    const response = await app.request(`/api/projects/${encodeURIComponent(J)}/export.html`);
    expect(response.status).toBe(200);
    expectAttachment(response.headers.get("content-disposition"), `${J}.html`);
  }, 10_000);

  it("downloads PDF for a project with a Japanese ID", async () => {
    const response = await app.request(`/api/projects/${encodeURIComponent(J)}/export.pdf`);
    expect(response.status).toBe(200);
    expectAttachment(response.headers.get("content-disposition"), `${J}.pdf`);
  }, 10_000);

  it("downloads PNG for an annotation with a Japanese ID", async () => {
    const response = await app.request(
      `/api/projects/${encodeURIComponent(J)}/annotations/${encodeURIComponent(A)}/image.png`,
    );
    expect(response.status).toBe(200);
    expectAttachment(response.headers.get("content-disposition"), `${A}.png`);
  }, 10_000);
});

describe("atomic writes", () => {
  it("leaves no temporary files after saving manual.md and annotations", async () => {
    const manual = await app.request(`/api/projects/${P}/manual`, jsonInit("PUT", { body: "# saved\n" }));
    expect(manual.status).toBe(200);
    const annotation = JSON.parse(annotationJson()) as unknown;
    const saved = await app.request(`/api/projects/${P}/annotations/test-1`, jsonInit("PUT", annotation));
    expect(saved.status).toBe(200);
    expect(readFileSync(join(root, "manual.md"), "utf8")).toBe("# saved\n");
    expect(readdirSync(root).sort()).toEqual(["annotations", "img", "manual.md"]);
    expect(readdirSync(join(root, "annotations"))).toEqual(["test-1.json"]);
  });
});
