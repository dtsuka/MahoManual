import { useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import {
  createProject,
  fetchProjects,
  pasteImage,
  renameAnnotation,
  type ProjectInfo,
  type ProjectOutputFilenames,
} from "./lib/api.js";
import { AnnotationEditor } from "./components/AnnotationEditor.js";
import { ManualEditor } from "./components/ManualEditor.js";
import { ThemeSettings } from "./components/ThemeSettings.js";
import { OutputSettings } from "./components/OutputSettings.js";
import { ProjectTitleSettings } from "./components/ProjectTitleSettings.js";
import {
  IconArrowLeft,
  IconBook,
  IconChevronRight,
  IconDownload,
  IconFolder,
  IconImage,
} from "./components/icons.js";
import {
  BrandMark,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Kbd,
  TextInput,
  cx,
} from "./components/ui.js";
import { readAsDataUrl, readImageSize } from "./lib/image-data.js";

// 処理中を示す小さなスピナー(文言とセットで使う)
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
    />
  );
}

// スクショの取り込み: ペースト / ファイル選択 / ドロップ → img/raw/ へ保存し
// 注釈 JSON 雛形を生成して注釈エディタへ直行する(SPEC §11)
function ImageImport({ project }: { project: string }) {
  const [importId, setImportId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
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
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">画像を追加</h2>
      <div
        className={cx(
          "rounded-lg border-2 border-dashed px-6 py-7 text-center transition-colors duration-150",
          dragActive ? "border-blue-400 bg-blue-50/60" : "border-slate-300",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragActive(false);
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const file = event.dataTransfer.files[0];
          if (file?.type.startsWith("image/")) {
            void importImage(file);
          }
        }}
      >
        <IconImage
          size={28}
          className={cx("mx-auto mb-2 transition-colors", dragActive ? "text-blue-500" : "text-slate-400")}
        />
        <p className="text-sm text-slate-600">
          スクショを <Kbd>⌘V</Kbd> でペースト、またはこの枠にドロップ
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <TextInput
            data-testid="import-id-input"
            uiSize="sm"
            className="w-48"
            placeholder="ID(例: 1-2。空なら自動)"
            value={importId}
            onChange={(event) => setImportId(event.target.value)}
          />
          <Button size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
            ファイルを選択
          </Button>
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
          {busy ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <Spinner />
              取り込み中…
            </span>
          ) : null}
        </div>
        <p className="mt-3 text-xs text-slate-500">追加後は注釈エディタが開きます。</p>
        {error ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function ProjectHome() {
  const { project } = useParams<{ project: string }>();
  const [projectTitle, setProjectTitle] = useState(project ?? "");
  const [outputFilenames, setOutputFilenames] = useState<ProjectOutputFilenames>(() => ({
    html: `${project}.html`,
    pdf: `${project}.pdf`,
  }));
  if (!project) {
    return null;
  }
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-6 py-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition-colors hover:text-blue-600"
        >
          <IconArrowLeft size={12} />
          プロジェクト一覧
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight" data-testid="project-title-heading">
              {projectTitle}
            </h1>
            {projectTitle !== project ? (
              <p className="mt-0.5 text-xs text-slate-500">ID: {project}</p>
            ) : null}
          </div>
          <div className="ml-auto flex gap-2">
            <ButtonLink
              href={`/api/projects/${encodeURIComponent(project)}/export.html`}
              download={outputFilenames.html}
              data-testid="export-html"
            >
              <IconDownload size={14} />
              HTML出力
            </ButtonLink>
            <ButtonLink
              href={`/api/projects/${encodeURIComponent(project)}/export.pdf`}
              download={outputFilenames.pdf}
              data-testid="export-pdf"
            >
              <IconDownload size={14} />
              PDF出力
            </ButtonLink>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-6 py-8">
        <Link
          to={`/projects/${project}/manual`}
          className="group flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5 shadow-xs transition-all duration-150 hover:border-blue-300 hover:shadow-sm"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <IconBook size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-900">マニュアル編集</span>
            <span className="mt-0.5 block text-[13px] text-slate-500">
              Markdownで本文を編集し、プレビューで仕上がりを確認します
            </span>
          </span>
          <IconChevronRight className="shrink-0 text-slate-300 transition-colors group-hover:text-blue-500" />
        </Link>
        <ProjectTitleSettings project={project} onChange={setProjectTitle} />
        <ImageImport project={project} />
        <OutputSettings project={project} onChange={setOutputFilenames} />
        <AnnotationLinks project={project} />
        <ThemeSettings project={project} />
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
    <Card className="p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-700">注釈エディタ</h2>
        {annotations.length > 0 ? (
          <span className="text-xs tabular-nums text-slate-500">{annotations.length} 枚</span>
        ) : null}
      </div>
      {annotations.length === 0 ? (
        <EmptyState
          icon={<IconImage size={28} />}
          title="画像がまだありません"
          hint="上の「画像を追加」からスクショを取り込むと、ここに一覧されます。"
        />
      ) : (
        <ul className="-mx-4 -mb-4 mt-2 divide-y divide-slate-100 border-t border-slate-100">
          {annotations.map((id) => (
            <li key={id} className="px-4 py-2 transition-colors last:rounded-b-lg hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <IconImage size={16} className="shrink-0 text-slate-400" />
                <Link
                  to={`/projects/${project}/annotations/${encodeURIComponent(id)}`}
                  className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 transition-colors hover:text-blue-600 hover:underline"
                  data-testid={`annotation-link-${id}`}
                >
                  {id}
                </Link>
                <TextInput
                  data-testid={`rename-list-input-${id}`}
                  aria-label={`${id}の新しいID`}
                  uiSize="sm"
                  className="w-48"
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
                <Button
                  data-testid={`rename-list-button-${id}`}
                  size="sm"
                  disabled={
                    renamingId !== null ||
                    !(draftIds[id] ?? id).trim() ||
                    (draftIds[id] ?? id).trim() === id
                  }
                  onClick={() => void renameFromList(id)}
                >
                  {renamingId === id ? "変更中…" : "ID変更"}
                </Button>
              </div>
              {renameError[id] ? (
                <p className="mt-1 pl-7 text-sm text-red-600" role="alert">
                  {renameError[id]}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
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
      onBack={() => navigate(`/projects/${encodeURIComponent(project)}`)}
      onNavigateToAnnotation={(nextId) =>
        navigate(`/projects/${project}/annotations/${encodeURIComponent(nextId)}`)
      }
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
  const [loading, setLoading] = useState(true);
  const [newProjectId, setNewProjectId] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void fetchProjects()
      .then(setProjects)
      .finally(() => setLoading(false));
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
    <div className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8 flex items-center gap-3">
        <BrandMark size={36} />
        <div>
          <h1 className="text-xl font-bold tracking-tight">MahoManual</h1>
          <p className="text-[13px] text-slate-500">
            CMS操作マニュアルを作成し、HTML / PDF で納品する
          </p>
        </div>
      </header>
      <Card className="mb-8 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">プロジェクトを追加</h2>
        <div className="grid grid-cols-[1fr_1.5fr_auto] gap-2">
          <TextInput
            data-testid="new-project-id"
            placeholder="プロジェクトID"
            value={newProjectId}
            onChange={(event) => setNewProjectId(event.target.value)}
          />
          <TextInput
            data-testid="new-project-title"
            placeholder="タイトル(省略時はID)"
            value={newProjectTitle}
            onChange={(event) => setNewProjectTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleCreateProject();
              }
            }}
          />
          <Button
            variant="primary"
            data-testid="create-project"
            disabled={!newProjectId.trim() || creating}
            onClick={() => void handleCreateProject()}
          >
            {creating ? "作成中…" : "作成"}
          </Button>
        </div>
        {createError ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {createError}
          </p>
        ) : null}
      </Card>
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">プロジェクト</h2>
        {loading ? (
          <ul className="space-y-3" aria-hidden="true">
            {[0, 1].map((n) => (
              <li key={n} className="h-16 animate-pulse rounded-lg border border-slate-200 bg-white p-4">
                <div className="h-3.5 w-40 rounded bg-slate-200" />
                <div className="mt-2 h-3 w-24 rounded bg-slate-100" />
              </li>
            ))}
          </ul>
        ) : projects.length === 0 ? (
          <Card>
            <EmptyState
              icon={<IconFolder size={28} />}
              title="プロジェクトがまだありません"
              hint="上のフォームにIDを入力して、最初のマニュアルを作成してください。"
            />
          </Card>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.name}>
                <Link
                  to={`/projects/${project.name}`}
                  className="group flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-xs transition-all duration-150 hover:border-blue-300 hover:shadow-sm"
                  data-testid={`project-${project.name}`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
                    <IconFolder size={18} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-900">{project.title}</span>
                    {project.title !== project.name ? (
                      <span className="block truncate font-mono text-xs text-slate-500">{project.name}</span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {project.pageCount} ページ · {project.imageCount} 画像
                  </span>
                  <IconChevronRight
                    size={14}
                    className="shrink-0 text-slate-300 transition-colors group-hover:text-blue-500"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
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
