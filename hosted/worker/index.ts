export interface Env {
  ASSETS: Fetcher;
  ATLAS_DB: D1Database;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_EMAIL: string;
  SERVICE_CLIENT_ID: string;
  ENVIRONMENT?: string;
}

function jsonError(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } }, { status });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      return jsonError(404, "not_found", `No API route for ${url.pathname}`);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
