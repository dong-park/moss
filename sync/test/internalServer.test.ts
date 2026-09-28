import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  INTERNAL_SECRET_HEADER,
  secretMatches,
  startInternalServer,
  type InternalServer,
} from "../src/internalServer.ts";
import { TEST_INTERNAL_SECRET } from "./helpers.ts";

const BOARD = "b-abc123";
const USER = "11111111-1111-4111-8111-111111111111";

describe("internal close endpoint", () => {
  let server: InternalServer;
  let base: string;
  let revoked: string[];
  let kicked: Array<{ boardId: string; userId: string }>;
  let closed = 0;

  beforeEach(async () => {
    revoked = [];
    kicked = [];
    closed = 0;
    server = await startInternalServer({
      port: 0,
      secret: TEST_INTERNAL_SECRET,
      revokeBoard: async (boardId) => {
        revoked.push(boardId);
        return closed;
      },
      kickMember: async (boardId, userId) => {
        kicked.push({ boardId, userId });
        return closed;
      },
    });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterEach(async () => {
    await server.close();
  });

  function post(path: string, secret: string | null = TEST_INTERNAL_SECRET): Promise<Response> {
    return fetch(`${base}${path}`, {
      method: "POST",
      headers: secret === null ? {} : { [INTERNAL_SECRET_HEADER]: secret },
    });
  }

  test("POST /internal/close/{boardId} revokes the board", async () => {
    closed = 3;
    const response = await post(`/internal/close/${BOARD}`);
    expect(response.status).toBe(204);
    expect(response.headers.get("x-closed-connections")).toBe("3");
    expect(revoked).toEqual([BOARD]);
  });

  test("POST /internal/close/{boardId}?userId= kicks one member", async () => {
    const response = await post(`/internal/close/${BOARD}?userId=${USER}`);
    expect(response.status).toBe(204);
    expect(kicked).toEqual([{ boardId: BOARD, userId: USER }]);
  });

  test("rejects a request without the internal secret", async () => {
    expect((await post(`/internal/close/${BOARD}`, null)).status).toBe(401);
    expect((await post(`/internal/close/${BOARD}`, "wrong-secret")).status).toBe(401);
    expect(revoked).toEqual([]);
  });

  test("rejects malformed board and user ids", async () => {
    for (const bad of ["..%2Fx", "a%20b", "x".repeat(65)]) {
      expect((await post(`/internal/close/${bad}`)).status).toBe(400);
    }
    expect((await post(`/internal/close/${BOARD}?userId=not-a-uuid`)).status).toBe(400);
    expect(revoked).toEqual([]);
    expect(kicked).toEqual([]);
  });

  test("secret comparison is constant-time and length-safe", () => {
    expect(secretMatches("shared-secret", "shared-secret")).toBe(true);
    expect(secretMatches("shared-secret", "shared-secre")).toBe(false);
    expect(secretMatches("shared-secret", "shared-secret-longer")).toBe(false);
    expect(secretMatches("shared-secret", undefined)).toBe(false);
  });

  test("non-POST methods and unknown paths are 404", async () => {
    expect((await fetch(`${base}/internal/close/${BOARD}`)).status).toBe(404);
    expect((await post(`/health`)).status).toBe(404);
  });
});
