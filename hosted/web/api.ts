// Typed client for the Scope API contract. Types mirror the Worker responses; the web bundle does
// not import src/ so it stays free of node builtins.

export type ClaimStatus = "fact" | "inference" | "question";
export type Evidence = { path: string; lineStart?: number; lineEnd?: number; symbol?: string };
export type Claim = {
  semanticId: string;
  label: string;
  status: ClaimStatus;
  evidence: Evidence[];
};
export type EdgeClaim = Claim & { from: string; to: string; relation?: string };
export type Learning = {
  question: string;
  answer: string;
  route: { semanticId: string; explanation: string }[];
  glossary: { term: string; meaning: string }[];
  scope?: { covers: string[]; omits: string[] };
  verify: { semanticId: string; how: string; command?: string }[];
  checks: { prompt: string; answer: string }[];
  analogies: { analogy: string; holds: string[]; breaks: string[] }[];
};
export type Spec = {
  artifactId: string;
  kind: string;
  revision: number;
  title: string;
  source: { root: string; commit: string | null };
  learning?: Learning;
  nodes: Claim[];
  edges: EdgeClaim[];
};

export type SceneElement = {
  id: string;
  isDeleted?: boolean;
  customData?: Record<string, unknown>;
  [key: string]: unknown;
};
export type Scene = {
  elements: SceneElement[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  [key: string]: unknown;
};

export type Note = {
  nodeKey: string;
  body: string;
  token: string;
  orphaned: boolean;
  updatedAt: string;
};
export type VerifyEntry = {
  index: number;
  semanticId: string | null;
  how: string;
  command: string | null;
  status: "ran" | "not-run";
  reason: string | null;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  commit: string | null;
  ranAt: string | null;
};
export type Figure = {
  artifactId: string;
  spec: Spec;
  scene: Scene;
  token: string;
  updatedAt: string;
  deprecatedAnchors: string[];
  notes: Note[];
  verify: VerifyEntry[];
};
export type ProjectSummary = {
  projectId: string;
  repoName: string;
  commit: string | null;
  publishedAt: string;
  figureCount: number;
};
export type FigureSummary = {
  artifactId: string;
  title: string;
  kind: string;
  revision: number;
  token: string;
  updatedAt: string;
};
export type Me = { kind: "user"; email: string } | { kind: "service" };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: "same-origin",
    redirect: "manual",
    headers: { accept: "application/json" },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { accept: "application/json", "content-type": "application/json" };
  }
  const response = await fetch(path, init);
  if (response.type === "opaqueredirect" || response.status === 401)
    throw new ApiError(401, "unauthenticated", "로그인이 필요합니다. 새로고침해 주세요.", null);
  const text = await response.text();
  let parsed: unknown = null;
  try {
    parsed = text.length === 0 ? null : JSON.parse(text);
  } catch {
    throw new ApiError(response.status, "invalid_response", "서버 응답을 읽을 수 없습니다.", text);
  }
  if (!response.ok) {
    const error =
      typeof parsed === "object" && parsed !== null && "error" in parsed
        ? (parsed as { error: { code?: string; message?: string } }).error
        : {};
    throw new ApiError(
      response.status,
      error.code ?? "http_error",
      error.message ?? `HTTP ${response.status}`,
      parsed,
    );
  }
  return parsed as T;
}

const enc = encodeURIComponent;

export const api = {
  me: () => request<Me>("GET", "/api/me"),
  projects: () => request<{ projects: ProjectSummary[] }>("GET", "/api/projects"),
  project: (project: string) =>
    request<{ project: ProjectSummary; figures: FigureSummary[] }>(
      "GET",
      `/api/projects/${enc(project)}`,
    ),
  figure: (project: string, artifact: string) =>
    request<Figure>("GET", `/api/projects/${enc(project)}/figures/${enc(artifact)}`),
  saveScene: (project: string, artifact: string, expectedToken: string, scene: Scene) =>
    request<{ token: string }>(
      "PUT",
      `/api/projects/${enc(project)}/figures/${enc(artifact)}/scene`,
      { expectedToken, scene },
    ),
  saveNote: (
    project: string,
    artifact: string,
    nodeKey: string,
    expectedToken: string | null,
    body: string,
  ) =>
    request<{ token: string }>(
      "PUT",
      `/api/projects/${enc(project)}/figures/${enc(artifact)}/notes/${enc(nodeKey)}`,
      { expectedToken, body },
    ),
};

export type SceneConflict = { token: string; scene: Scene };
export type NoteConflict = { token: string; body: string } | null;

export function sceneConflictOf(error: unknown): SceneConflict | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body as { current?: SceneConflict } | null;
  return body?.current ?? null;
}

export function noteConflictOf(error: unknown): { current: NoteConflict } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const body = error.body as { current?: NoteConflict } | null;
  return { current: body?.current ?? null };
}

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return `${error.message} (${error.code}, ${error.status})`;
  return error instanceof Error ? error.message : String(error);
}
