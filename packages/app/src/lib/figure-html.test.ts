import { describe, expect, it } from "vitest";
import type { AnnotationObject } from "@mahomanual/core/schema";
import { injectObjectIds } from "./figure-html.js";

describe("injectObjectIds", () => {
  it("オブジェクトIDを属性値としてエスケープして埋め込む", () => {
    const objects: AnnotationObject[] = [
      {
        id: 'x" onmouseover="alert(1)',
        type: "badge",
        source: "manual",
        n: 1,
        at: { x: 10, y: 10 },
      },
    ];
    const html = injectObjectIds(
      '<figure><span class="mm-obj mm-badge" style="left:10%;">1</span></figure>',
      objects,
      new Set(['x" onmouseover="alert(1)']),
    );
    expect(html).toContain('data-mm-id="x&quot; onmouseover=&quot;alert(1)"');
    expect(html).not.toContain('" onmouseover="');
    expect(html).toContain("is-selected");
  });

  it("& < > ' もエスケープする", () => {
    const objects: AnnotationObject[] = [
      { id: "a&b<c>'d", type: "badge", source: "manual", n: 1, at: { x: 1, y: 1 } },
    ];
    const html = injectObjectIds('<span class="mm-obj mm-badge">1</span>', objects);
    expect(html).toContain('data-mm-id="a&amp;b&lt;c&gt;&#39;d"');
  });
});
