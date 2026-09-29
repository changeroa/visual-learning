import { useEffect, useState } from "react";

export type Route =
  | { name: "home" }
  | { name: "project"; project: string }
  | { name: "figure"; project: string; artifact: string }
  | { name: "missing"; path: string };

const routeEvent = "visual-atlas:navigate";

export function parseRoute(pathname: string): Route {
  const parts = pathname
    .split("/")
    .filter((part) => part.length > 0)
    .map((part) => decodeURIComponent(part));
  if (parts.length === 0) return { name: "home" };
  const [head, project, artifact] = parts;
  if (head === "p" && project !== undefined && parts.length === 2)
    return { name: "project", project };
  if (head === "p" && project !== undefined && artifact !== undefined && parts.length === 3)
    return { name: "figure", project, artifact };
  return { name: "missing", path: pathname };
}

export function projectPath(project: string): string {
  return `/p/${encodeURIComponent(project)}`;
}

export function figurePath(project: string, artifact: string): string {
  return `${projectPath(project)}/${encodeURIComponent(artifact)}`;
}

export function navigate(path: string): void {
  if (path === window.location.pathname) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event(routeEvent));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener("popstate", update);
    window.addEventListener(routeEvent, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(routeEvent, update);
    };
  }, []);
  return route;
}
