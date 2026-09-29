import "./styles.css";
import { type ReactNode, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, errorText, type FigureSummary, type ProjectSummary } from "./api";
import { FigureView } from "./figure-view";
import { figurePath, projectPath, useRoute } from "./router";
import { Link, shortTime } from "./ui";

function useLoad<T>(load: () => Promise<T>, key: string): { data: T | null; error: string | null } {
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({
    key: "",
    data: null,
    error: null,
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: the caller's key identifies the load
  useEffect(() => {
    let alive = true;
    load().then(
      (data) => alive && setState({ key, data, error: null }),
      (error: unknown) => alive && setState({ key, data: null, error: errorText(error) }),
    );
    return () => {
      alive = false;
    };
  }, [key]);
  return state.key === key ? state : { data: null, error: null };
}

function Loading({ error }: { error: string | null }) {
  return error === null ? (
    <p className="muted">불러오는 중…</p>
  ) : (
    <p className="error" role="alert">
      불러오지 못했습니다: {error}
    </p>
  );
}

function ProjectList() {
  const { data, error } = useLoad(api.projects, "projects");
  if (data === null) return <Loading error={error} />;
  return (
    <main className="page">
      <h1>프로젝트</h1>
      {data.projects.length === 0 ? (
        <p className="muted">
          아직 발행된 프로젝트가 없습니다. <code>visual-note publish</code>로 올려 주세요.
        </p>
      ) : (
        <ul className="card-list" data-testid="project-list">
          {data.projects.map((project: ProjectSummary) => (
            <li key={project.projectId} className="card">
              <Link to={projectPath(project.projectId)} className="card-link">
                <strong>{project.projectId}</strong>
                <span className="muted">
                  저장소 <code>{project.repoName}</code> · 커밋{" "}
                  <code>{project.commit?.slice(0, 7) ?? "-"}</code>
                </span>
                <span className="muted">
                  그림 {project.figureCount}개 · 발행 {shortTime(project.publishedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function FigureGrid({ project }: { project: string }) {
  const { data, error } = useLoad(() => api.project(project), `project:${project}`);
  if (data === null) return <Loading error={error} />;
  return (
    <main className="page">
      <h1>
        <code>{data.project.projectId}</code> 그림
      </h1>
      <ul className="figure-grid" data-testid="figure-grid">
        {data.figures.map((figure: FigureSummary) => (
          <li key={figure.artifactId} className="card">
            <Link to={figurePath(project, figure.artifactId)} className="card-link">
              <strong>{figure.title}</strong>
              <code>{figure.artifactId}</code>
              <span className="muted">
                종류 <code>{figure.kind}</code> · revision {figure.revision} · 토큰{" "}
                <code>{figure.token}</code>
              </span>
              <span className="muted">갱신 {shortTime(figure.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}

function Header({ crumbs }: { crumbs: ReactNode }) {
  const { data, error } = useLoad(api.me, "me");
  return (
    <header className="app-header">
      <nav className="crumbs">
        <Link to="/" className="brand">
          visual-atlas
        </Link>
        {crumbs}
      </nav>
      <span className="user" data-testid="user-email" title={error ?? undefined}>
        {data === null
          ? error === null
            ? "…"
            : "로그인 확인 실패"
          : data.kind === "user"
            ? data.email
            : "서비스 토큰"}
      </span>
    </header>
  );
}

function App() {
  const route = useRoute();
  let crumbs: ReactNode = null;
  let body: ReactNode;
  switch (route.name) {
    case "home":
      body = <ProjectList />;
      break;
    case "project":
      crumbs = <span className="crumb">/ {route.project}</span>;
      body = <FigureGrid project={route.project} />;
      break;
    case "figure":
      crumbs = (
        <>
          <span className="crumb">
            / <Link to={projectPath(route.project)}>{route.project}</Link>
          </span>
          <span className="crumb">/ {route.artifact}</span>
        </>
      );
      body = <FigureView key={`${route.project}/${route.artifact}`} {...route} />;
      break;
    case "missing":
      body = (
        <main className="page">
          <p className="error">
            없는 주소입니다: <code>{route.path}</code>
          </p>
        </main>
      );
      break;
  }
  return (
    <div className="app">
      <Header crumbs={crumbs} />
      {body}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
