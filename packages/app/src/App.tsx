import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { fetchProjects, pasteImage, type ProjectInfo } from "./lib/api.js";
import { AnnotationEditor } from "./components/AnnotationEditor.js";
import { ManualEditor } from "./components/ManualEditor.js";

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}

function readImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("画像のサイズ取得に失敗しました"));
    image.src = dataUrl;
  });
}

// スクショの取り込み: ペースト / ファイル選択 / ドロップ → img/raw/ へ保存し
// 注釈 JSON 雛形を生成して注釈エディタへ直行する(SPEC §11)
function ImageImport({ project }: { project: string }) {
  const [importId, setImportId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importImage = async (file: Blob) => {
    setError(null);
    const id = importId.trim() || `img-${Date.now()}`;
    if (/[/\\]/.test(id) || id.includes("..")) {
      setError("ID にパス区切りや .. は使えません");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const size = await readImageSize(dataUrl);
      await pasteImage(project, id, dataUrl, size.width, size.height);
      navigate(`/projects/${project}/annotations/${encodeURIComponent(id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "取り込みに失敗しました");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      const item = [...(event.clipboardData?.items ?? [])].find((entry) =>
        entry.type.startsWith("image/"),
      );
      const file = item?.getAsFile();
      if (!file) {
        return;
      }
      event.preventDefault();
      void importImage(file);
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, [project, importId]);

  return (
    <div
      className="rounded border border-dashed border-slate-300 bg-white p-4"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files[0];
        if (file?.type.startsWith("image/")) {
          void importImage(file);
        }
      }}
    >
      <h2 className="mb-3 font-medium">画像を追加</h2>
      <div className="flex items-center gap-2">
        <input
          data-testid="import-id-input"
          className="w-48 rounded border border-slate-300 px-2 py-1 text-sm"
          placeholder="ID(例: 1-2。空なら自動)"
          value={importId}
          onChange={(event) => setImportId(event.target.value)}
        />
        <button
          type="button"
          className="rounded bg-slate-100 px-3 py-1 text-sm"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          ファイルを選択
        </button>
        <input
          ref={fileInputRef}
          data-testid="import-file-input"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importImage(file);
            }
            event.target.value = "";
          }}
        />
        {busy ? <span className="text-sm text-slate-500">取り込み中…</span> : null}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        スクショを Cmd+V でペースト、またはこの枠にドロップしても追加できます。追加後は注釈エディタが開きます。
      </p>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}

function ProjectHome() {
  const { project } = useParams<{ project: string }>();
  if (!project) {
    return null;
  }
  return (
    <div className="flex h-screen flex-col">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <Link to="/" className="text-sm text-blue-600">
          ← プロジェクト一覧
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{project}</h1>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Link
          to={`/projects/${project}/manual`}
          className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-blue-300"
        >
          マニュアル編集 (Markdown + プレビュー)
        </Link>
        <ImageImport project={project} />
        <AnnotationLinks project={project} />
      </div>
    </div>
  );
}

function AnnotationLinks({ project }: { project: string }) {
  const [annotations, setAnnotations] = useState<string[]>([]);

  useEffect(() => {
    void fetch(`/api/projects/${encodeURIComponent(project)}/manual`)
      .then((response) => response.json())
      .then((payload: { annotations: string[] }) => setAnnotations(payload.annotations));
  }, [project]);

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium">注釈エディタ</h2>
      <ul className="space-y-2">
        {annotations.map((id) => (
          <li key={id}>
            <Link
              to={`/projects/${project}/annotations/${id}`}
              className="text-blue-600 hover:underline"
              data-testid={`annotation-link-${id}`}
            >
              {id}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AnnotationRoute() {
  const { project, id } = useParams<{ project: string; id: string }>();
  const navigate = useNavigate();
  if (!project || !id) {
    return null;
  }
  return <AnnotationEditor project={project} annotationId={id} onBack={() => navigate(-1)} />;
}

function ManualRoute() {
  const { project } = useParams<{ project: string }>();
  if (!project) {
    return null;
  }
  return <ManualEditor project={project} />;
}

function ProjectList() {
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  useEffect(() => {
    void fetchProjects().then(setProjects);
  }, []);

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">MahoManual</h1>
      <ul className="space-y-3">
        {projects.map((project) => (
          <li key={project.name}>
            <Link
              to={`/projects/${project.name}`}
              className="block rounded border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-blue-300"
              data-testid={`project-${project.name}`}
            >
              <div className="font-medium">{project.title}</div>
              <div className="text-sm text-slate-500">
                {project.pageCount} ページ / {project.imageCount} 画像
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<ProjectList />} />
      <Route path="/projects/:project" element={<ProjectHome />} />
      <Route path="/projects/:project/manual" element={<ManualRoute />} />
      <Route path="/projects/:project/annotations/:id" element={<AnnotationRoute />} />
    </Routes>
  );
}
