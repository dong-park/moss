import { describe, expect, test } from "bun:test";
import { SignJWT } from "jose";
import { UnauthorizedError, verifyBoardToken } from "../src/auth.ts";
import { signBoardToken, TEST_SECRET } from "./helpers.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const BOARD = "b-abc123";
const OTHER_BOARD = "33333333-3333-4333-8333-333333333333";

describe("verifyBoardToken", () => {
  test("accepts a well-formed board token and returns its claims", async () => {
    const token = await signBoardToken({ userId: USER, boardId: BOARD });
    expect(await verifyBoardToken(token, TEST_SECRET)).toEqual({
      userId: USER,
      boardId: BOARD,
    });
  });

  test("rejects a token signed with a different secret", async () => {
    const token = await signBoardToken({
      userId: USER,
      boardId: BOARD,
      secret: "a-different-secret-that-is-long-enough",
    });
    await expect(verifyBoardToken(token, TEST_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("rejects a token from a different issuer", async () => {
    const token = await signBoardToken({ userId: USER, boardId: BOARD, issuer: "not-moss" });
    await expect(verifyBoardToken(token, TEST_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("rejects an access token where a board token is required", async () => {
    const token = await signBoardToken({ userId: USER, boardId: BOARD, type: "access" });
    await expect(verifyBoardToken(token, TEST_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("rejects an expired token", async () => {
    const token = await signBoardToken({
      userId: USER,
      boardId: BOARD,
      expiresIn: Math.floor(Date.now() / 1000) - 60,
    });
    await expect(verifyBoardToken(token, TEST_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("rejects a token with a non-uuid subject", async () => {
    const token = await signBoardToken({ userId: "not-a-uuid", boardId: BOARD });
    await expect(verifyBoardToken(token, TEST_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("rejects a token whose boardId is not a valid board id", async () => {
    for (const bad of ["../x", "a b", "x".repeat(65)]) {
      const token = await signBoardToken({ userId: USER, boardId: bad });
      await expect(verifyBoardToken(token, TEST_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
    }
  });

  test("rejects a token without a boardId claim", async () => {
    const token = await new SignJWT({ typ: "board" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("moss")
      .setSubject(USER)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(TEST_SECRET));
    await expect(verifyBoardToken(token, TEST_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("parses a token for another board; the caller enforces the room match", async () => {
    const token = await signBoardToken({ userId: USER, boardId: OTHER_BOARD });
    expect((await verifyBoardToken(token, TEST_SECRET)).boardId).toBe(OTHER_BOARD);
  });

  test("rejects an empty token", async () => {
    await expect(verifyBoardToken("", TEST_SECRET)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
