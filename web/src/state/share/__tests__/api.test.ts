import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthRequestError } from "@/state/auth";
import { realShareApi } from "../api";

function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status });
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type Call = [string, RequestInit];

/** 호출을 기록하는 fetch 스텁 — 튜플을 명시적으로 타입해서 mock.calls 추론을 피한다. */
function stubFetch(response: Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return response;
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const board = { id: "b1", name: "이번 주 기획", role: "owner", ownerName: "동환" };

describe("share/api — n4 Ktor 계약", () => {
  test("share는 보드 id로 POST하고 Bearer와 이름 본문을 보낸다", async () => {
    const calls = stubFetch(jsonResponse(200, board));

    await expect(realShareApi.share("b1", "이번 주 기획", "access")).resolves.toEqual(board);

    const [url, init] = calls[0];
    expect(url).toBe("http://localhost:8080/boards/b1/share");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access");
    expect(JSON.parse(init.body as string)).toEqual({ name: "이번 주 기획" });
  });

  test("reissueInvite는 inviteToken 필드를 꺼낸다", async () => {
    stubFetch(jsonResponse(200, { inviteToken: "tok-2" }));
    await expect(realShareApi.reissueInvite("b1", "access")).resolves.toBe("tok-2");
  });

  test("unshare와 removeMember는 DELETE 후 204를 받는다", async () => {
    const calls = stubFetch(jsonResponse(204));

    await expect(realShareApi.unshare("b1", "access")).resolves.toBeUndefined();
    await expect(realShareApi.removeMember("b1", "u2", "access")).resolves.toBeUndefined();

    expect(calls[0][0]).toBe("http://localhost:8080/boards/b1/share");
    expect(calls[0][1].method).toBe("DELETE");
    expect(calls[1][0]).toBe("http://localhost:8080/boards/b1/members/u2");
  });

  test("myBoards는 GET /me/boards 결과를 돌려준다", async () => {
    stubFetch(jsonResponse(200, [board, { ...board, id: "b2", role: "editor" }]));
    const boards = await realShareApi.myBoards("access");
    expect(boards).toHaveLength(2);
    expect(boards[1].role).toBe("editor");
  });

  test("실패 상태코드는 AuthRequestError로 전파한다", async () => {
    stubFetch(jsonResponse(403, { error: "forbidden" }));
    await expect(realShareApi.share("b1", "x", "access")).rejects.toBeInstanceOf(
      AuthRequestError,
    );
  });
});
