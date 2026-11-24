import { apiBaseUrl, AuthRequestError, useAuth } from "@/state/auth";
import { readErrorBody } from "@/state/auth/api";

/** remote-mcp n7 (T6) — 서버의 연결된 앱 목록과 해제. GET·DELETE /oauth/grants. */
export interface ConnectedApp {
  id: string;
  clientId: string;
  clientName: string;
  createdAt: number;
  lastUsedAt: number | null;
}

async function call(method: "GET" | "DELETE", path: string): Promise<Response> {
  const session = await useAuth.getState().ensureSession();
  const res = await fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!res.ok) {
    const { code, message } = await readErrorBody(res);
    throw new AuthRequestError(message ?? `${method} ${path} ${res.status}`, res.status, code);
  }
  return res;
}

export async function listConnectedApps(): Promise<ConnectedApp[]> {
  return (await (await call("GET", "/oauth/grants")).json()) as ConnectedApp[];
}

/** 해제하면 서버가 이 연결의 토큰을 모두 폐기한다. 이미 없는 연결(404)은 해제된 것으로 본다. */
export async function disconnectApp(id: string): Promise<void> {
  try {
    await call("DELETE", `/oauth/grants/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof AuthRequestError && err.status === 404) return;
    throw err;
  }
}
