import { beforeEach, describe, expect, test } from "vitest";
import {
  clearSession,
  deleteAuthDatabase,
  loadSession,
  saveSession,
} from "../tokenStore";
import type { AuthSession } from "../types";

const session: AuthSession = {
  accessToken: "a.b.c",
  refreshToken: "d.e.f",
  user: { id: "u1", name: "동환", avatar: null },
};

async function putRaw(value: unknown): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("moss-session");
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction("session", "readwrite");
      tx.objectStore("session").put(value);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
}

beforeEach(async () => {
  await deleteAuthDatabase();
});

describe("auth/tokenStore", () => {
  test("저장한 세션을 그대로 읽는다", async () => {
    expect(await loadSession()).toBeNull();
    await saveSession(session);
    expect(await loadSession()).toEqual(session);
  });

  test("덮어쓰기 저장", async () => {
    await saveSession(session);
    const next = { ...session, accessToken: "x.y.z" };
    await saveSession(next);
    expect((await loadSession())?.accessToken).toBe("x.y.z");
  });

  test("clearSession 뒤에는 null", async () => {
    await saveSession(session);
    await clearSession();
    expect(await loadSession()).toBeNull();
  });

  test("필드 타입이 깨진 저장값은 null로 취급한다", async () => {
    await saveSession(session);
    await putRaw({ key: "current", session: { accessToken: 123, refreshToken: "d.e.f" } });
    expect(await loadSession()).toBeNull();
  });

  test("옛 moss-auth DB(다른 키 구조)가 있어도 load/save가 된다", async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("moss-auth", 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore("session");
      };
      req.onsuccess = () => {
        const legacy = req.result;
        const tx = legacy.transaction("session", "readwrite");
        tx.objectStore("session").put({ session }, "current");
        tx.oncomplete = () => {
          legacy.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });

    expect(await loadSession()).toBeNull();
    await saveSession(session);
    expect(await loadSession()).toEqual(session);
  });
});
