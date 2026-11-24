import { describe, expect, test } from "vitest";
import { deriveWallShareState } from "../wallState";

describe("deriveWallShareState", () => {
  test("기록이 없거나 local이면 이 기기에만이다", () => {
    expect(deriveWallShareState({ status: "local", uploading: false, signedIn: true })).toBe("local");
    expect(deriveWallShareState({ status: "local", uploading: false, signedIn: false })).toBe("local");
  });

  test("local에서 업로드 단계면 올리는 중이다", () => {
    expect(deriveWallShareState({ status: "local", uploading: true, signedIn: true })).toBe("uploading");
  });

  test("shared는 로그인 여부로 공유 중과 로그아웃 상태를 가른다", () => {
    expect(deriveWallShareState({ status: "shared", uploading: false, signedIn: true })).toBe("shared");
    expect(deriveWallShareState({ status: "shared", uploading: false, signedIn: false })).toBe(
      "sharedLoggedOut",
    );
  });

  test("서버 행이 이미 있으면 올리는 중 표시가 남아도 공유 상태가 이긴다", () => {
    expect(deriveWallShareState({ status: "shared", uploading: true, signedIn: true })).toBe("shared");
  });

  test("revoked는 이 기기에만으로 읽는다", () => {
    expect(deriveWallShareState({ status: "revoked", uploading: false, signedIn: true })).toBe("local");
  });
});
