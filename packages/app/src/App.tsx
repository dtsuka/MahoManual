import { useEffect, useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { fetchProjects, type ProjectInfo } from "./lib/api.js";
import { AnnotationEditor } from "./components/AnnotationEditor.js";
import { ManualEditor } from "./components/ManualEditor.js";

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
