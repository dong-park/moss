/**
 * 세션 영속화 — Dexie `moss-session` 데이터베이스의 `session` 테이블 한 칸.
 *
 * Dexie 스키마(v7, n2가 만지는 중)와 분리해 병렬 노드와 충돌하지 않는다.
 * 초기의 `moss-auth` DB는 키 구조가 달라 열 때 UpgradeError가 났다. 아직
 * 배포 전이라 이관하지 않고 DB 이름을 바꾸고 옛 DB는 한 번 지운다.
 */
import Dexie, { type Table } from "dexie";
import type { AuthSession } from "./types";

const DB_NAME = "moss-session";
const LEGACY_DB_NAME = "moss-auth";
const ROW_KEY = "current";

interface SessionRow {
  key: string;
  session: AuthSession;
}

class AuthDatabase extends Dexie {
  session!: Table<SessionRow, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({ session: "key" });
  }
}

let db: AuthDatabase | null = null;
let legacyCleared = false;

/** 옛 `moss-auth` DB를 한 번만 지운다. 실패해도 새 DB 사용에는 지장이 없다. */
function clearLegacyDatabase(): void {
  if (legacyCleared || typeof indexedDB === "undefined") return;
  legacyCleared = true;
  try {
    indexedDB.deleteDatabase(LEGACY_DB_NAME);
  } catch {
    // 지우지 못해도 새 DB는 따로 쓰므로 무시한다.
  }
}

function getDb(): AuthDatabase | null {
  if (typeof indexedDB === "undefined") return null;
  clearLegacyDatabase();
  if (!db) db = new AuthDatabase();
  return db;
}

/** 저장된 값이 AuthSession 모양인지 확인한다. 깨진 데이터는 없는 셈 친다. */
function isAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.accessToken !== "string" || typeof row.refreshToken !== "string") return false;
  const user = row.user as Record<string, unknown> | undefined;
  if (!user || typeof user.id !== "string" || typeof user.name !== "string") return false;
  return user.avatar === null || typeof user.avatar === "string";
}

export async function loadSession(): Promise<AuthSession | null> {
  const database = getDb();
  if (!database) return null;
  try {
    const row = await database.session.get(ROW_KEY);
    if (!row) return null;
    return isAuthSession(row.session) ? row.session : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: AuthSession): Promise<void> {
  const database = getDb();
  if (!database) return;
  await database.session.put({ key: ROW_KEY, session });
}

export async function clearSession(): Promise<void> {
  const database = getDb();
  if (!database) return;
  await database.session.delete(ROW_KEY);
}

/** 테스트 격리용. 데이터베이스 자체를 지운다. */
export async function deleteAuthDatabase(): Promise<void> {
  const database = getDb();
  if (!database) return;
  database.close();
  db = null;
  legacyCleared = false;
  await database.delete();
}
