import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  createProject,
  fetchProjects,
  pasteImage,
  renameAnnotation,
  type ProjectInfo,
} from "./lib/api.js";
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
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <Link
            to={`/projects/${project}/manual`}
            className="rounded border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-blue-300"
          >
            マニュアル編集 (Markdown + プレビュー)
          </Link>
          <a
            href={`/api/projects/${encodeURIComponent(project)}/export.html`}
            download={`${project}.html`}
            data-testid="export-html"
            className="rounded border border-slate-200 bg-white px-4 py-3 text-center shadow-sm hover:border-blue-300"
          >
            HTML出力
          </a>
          <a
            href={`/api/projects/${encodeURIComponent(project)}/export.pdf`}
            download={`${project}.pdf`}
            data-testid="export-pdf"
            className="rounded border border-slate-200 bg-white px-4 py-3 text-center shadow-sm hover:border-blue-300"
          >
            PDF出力
          </a>
        </div>
        <ImageImport project={project} />
        <AnnotationLinks project={project} />
      </div>
    </div>
  );
}

function AnnotationLinks({ project }: { project: string }) {
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [draftIds, setDraftIds] = useState<Record<string, string>>({});
  const [renameError, setRenameError] = useState<Record<string, string>>({});
  const [renamingId, setRenamingId] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`/api/projects/${encodeURIComponent(project)}/manual`)
      .then((response) => response.json())
      .then((payload: { annotations: string[] }) => {
        setAnnotations(payload.annotations);
        setDraftIds(Object.fromEntries(payload.annotations.map((id) => [id, id])));
      });
  }, [project]);

  const renameFromList = async (currentId: string) => {
    const nextId = draftIds[currentId]?.trim() ?? "";
    if (!nextId || nextId === currentId || renamingId) {
      return;
    }
    setRenamingId(currentId);
    setRenameError((current) => ({ ...current, [currentId]: "" }));
    try {
      const result = await renameAnnotation(project, currentId, nextId);
      setAnnotations((current) => current.map((id) => id === currentId ? result.id : id));
      setDraftIds((current) => {
        const next = { ...current };
        delete next[currentId];
        next[result.id] = result.id;
        return next;
      });
      setRenameError((current) => {
        const next = { ...current };
        delete next[currentId];
        return next;
      });
    } catch (err) {
      setRenameError((current) => ({
        ...current,
        [currentId]: err instanceof Error ? err.message : "ID変更に失敗しました",
      }));
    } finally {
      setRenamingId(null);
    }
  };

  return (
    <div className="rounded border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-medium">注釈エディタ</h2>
      <ul className="space-y-2">
        {annotations.map((id) => (
          <li key={id} className="rounded border border-slate-200 p-2">
            <div className="flex items-center gap-2">
              <Link
                to={`/projects/${project}/annotations/${encodeURIComponent(id)}`}
                className="min-w-0 flex-1 truncate text-blue-600 hover:underline"
                data-testid={`annotation-link-${id}`}
              >
                {id}
              </Link>
              <input
                data-testid={`rename-list-input-${id}`}
                aria-label={`${id}の新しいID`}
                className="w-56 rounded border border-slate-300 px-2 py-1 text-sm"
                value={draftIds[id] ?? id}
                onChange={(event) =>
                  setDraftIds((current) => ({ ...current, [id]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void renameFromList(id);
                  }
                }}
              />
              <button
                type="button"
                data-testid={`rename-list-button-${id}`}
                className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-sm disabled:opacity-40"
                disabled={
                  renamingId !== null ||
                  !(draftIds[id] ?? id).trim() ||
                  (draftIds[id] ?? id).trim() === id
                }
                onClick={() => void renameFromList(id)}
              >
                {renamingId === id ? "変更中…" : "ID変更"}
              </button>
            </div>
            {renameError[id] ? (
              <p className="mt-1 text-sm text-red-600" role="alert">
                {renameError[id]}
              </p>
            ) : null}
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
  return (
    <AnnotationEditor
      project={project}
      annotationId={id}
      onBack={() => navigate(-1)}
      onRenamed={(nextId) =>
        navigate(`/projects/${project}/annotations/${encodeURIComponent(nextId)}`, { replace: true })
      }
    />
  );
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
  const [newProjectId, setNewProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchProjects().then(setProjects);
  }, []);

  const handleCreateProject = async () => {
    const id = newProjectId.trim();
    if (!id || creating) {
      return;
    }
    setCreating(true);
    setCreateError("");
    try {
      const created = await createProject(id, newProjectTitle.trim() || id);
      navigate(`/projects/${encodeURIComponent(created.id)}`);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "プロジェクトの作成に失敗しました");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-2xl font-bold">MahoManual</h1>
      <section className="mb-6 rounded border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">プロジェクトを追加</h2>
        <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
          <input
            data-testid="new-project-id"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="プロジェクトID"
            value={newProjectId}
            onChange={(event) => setNewProjectId(event.target.value)}
          />
          <input
            data-testid="new-project-title"
            className="rounded border border-slate-300 px-3 py-2 text-sm"
            placeholder="タイトル（省略時はID）"
            value={newProjectTitle}
            onChange={(event) => setNewProjectTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleCreateProject();
              }
            }}
          />
          <button
            type="button"
            data-testid="create-project"
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40"
            disabled={!newProjectId.trim() || creating}
            onClick={() => void handleCreateProject()}
          >
            {creating ? "作成中…" : "作成"}
          </button>
        </div>
        {createError ? <p className="mt-2 text-sm text-red-600" role="alert">{createError}</p> : null}
      </section>
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
