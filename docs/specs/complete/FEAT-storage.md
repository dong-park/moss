# FEAT-storage · 로컬 우선 저장 (Dexie + OPFS)

> 사용자의 메모·보드·연결 데이터를 브라우저 안에서 source of truth로 유지하고, 오프라인에서 완전 작동하게 한다.

**Status**: ✅ complete (2026-05-21) — 검증 통과, AC 모두 충족
**Estimated**: L
**Blueprint**: `features[id="FEAT-storage"]`

---

## 1. 목표

사고 작업대인 moss의 모든 사용자 데이터(메모·보드·연결·임베딩 캐시·환경설정)는 우선 브라우저 안에 안전하게 보관되어야 한다. 네트워크 부재 상태에서도 캡처·열람·자유 배치·검색이 동일하게 작동해야 한다.

## 2. 범위

### 포함
- Dexie(IndexedDB) 스키마 v1: `notes`, `boards`, `connections`, `embeddings`, `settings`
- OPFS 어댑터: 큰 첨부(이미지·음성·파일) 저장. 단일 파일 ≤ 500MB, 전체 ≤ 5GB 권장
- `persist()` 권한 요청 흐름 (저장소 강제 보존, 사용자에게 1회만 묻기)
- 마이그레이션 정책 (스키마 v→v+1): 변경 없으면 noop, 필드 추가는 자동, 파괴적 변경은 마이그레이션 함수
- Storage 사용량 측정 + 80%·95% 임계 토스트
- Service Worker 등록 (오프라인 셸 + 앱 자체 캐싱)

### 제외 (다른 FEAT 담당)
- 여러 기기 동기화 — Pro 기능, Yjs (별도 FEAT로 분리, MVP 후)
- AI 임베딩 계산 — [[FEAT-ai-pipeline]]
- 내보내기·가져오기 포맷 변환 — [[FEAT-export]]
- 첨부 OCR — [[FEAT-ai-pipeline]]

## 3. 수용 기준

### AC-1 (REQ-3 충족) — 오프라인 작동
- **Given** 인터넷 연결 차단
- **When** 사용자가 캡처·자유 배치·보드 전환·검색 수행
- **Then** AI 의존 기능을 제외한 모든 동작이 1초 이내 응답하며 상태가 영속됨. 새로고침 후 동일 상태 복원.

### AC-2 (REQ-9 충족) — PWA 셸
- **Given** 사용자가 moss를 1회 방문 후 오프라인 상태로 재방문
- **When** 브라우저 URL 입력 또는 PWA 아이콘 실행
- **Then** 앱 셸이 캐시에서 로드되어 빈 화면 없이 1.5초 이내 워크스페이스가 표시됨

### AC-3 (REQ-9 보강) — persist 권한
- **Given** 사용자가 메모 10개 이상 저장
- **When** 백그라운드에서 `navigator.storage.persist()` 1회 요청
- **Then** 권한 요청 모달이 1회만 표시되고, 결정(허용/거부)이 settings에 영속됨

### AC-4 — 용량 임계 안내
- **Given** OPFS 사용량이 quota의 80% 도달
- **When** 다음 캡처 시
- **Then** 잔잔한 토스트로 "저장 공간이 빠르게 차고 있어요" 안내. 95%에선 모달 안내 + 내보내기 권유.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-3 (오프라인), REQ-9 (PWA)
- 등장 화면: 전체 (직접 UI 없음, 모든 화면이 의존)
- 등장 flow: 전체 — 어느 flow에서도 메모 저장이 일어남

### 다른 feature
- **의존**: 없음 (가장 하위)
- **의존받음**: FEAT-capture, FEAT-canvas, FEAT-boards, FEAT-home, FEAT-extras, FEAT-ai-pipeline, FEAT-signals, FEAT-export, FEAT-mobile, FEAT-freemium, FEAT-privacy

### 외부 라이브러리
- `dexie` (PRD §32 결정)
- 추가: `dexie-encrypted` (선택 — Pro 동기화 시점에 다시 검토. MVP는 평문)

## 5. 데이터 모델

```ts
// src/state/db/schema.ts
import Dexie, { type Table } from "dexie";

export type NoteKind =
  | "text" | "handwriting" | "mindmap" | "highlight" | "checklist"
  | "image" | "link" | "audio" | "file" | "code";

export interface Note {
  id: string;
  boardId: string | null;       // null = 무소속 (시스템 보드 큐레이팅 대상)
  kind: NoteKind;
  x: number;                    // 보드 내 world 좌표
  y: number;
  width: number;
  rotation: number;             // ±1.5° (PRD §8-4)
  content: string;              // 본문 텍스트 또는 attachment 메타 JSON
  attachmentRef?: string;       // OPFS 파일 경로 (image/audio/file 시)
  color?: string;               // 카드 분위기 컬러 토큰 키
  aiOptOut: boolean;            // [[FEAT-privacy]] 키 — true면 절대 서버 통과 X
  createdAt: number;            // epoch ms
  updatedAt: number;
  lastVisitedAt: number;        // 재방문 추적 (FEAT-home Thought Return Rate)
}

export interface Board {
  id: string;
  name: string;                 // 빈 문자열 허용 (REQ-15)
  isSystem: boolean;            // true이면 "머무는 생각" 시스템 보드 (1개만)
  templateId?: string;          // FEAT-templates 5종 중 어느 것에서 만들어졌나
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
}

export interface Connection {
  id: string;
  sourceNoteId: string;
  targetNoteId: string;
  source: "manual" | "ai-suggested";
  status: "active" | "rejected" | "pending";  // rejected는 학습 음의 신호
  label?: string;
  createdAt: number;
}

export interface EmbeddingCacheEntry {
  noteId: string;
  contentHash: string;          // 본문 변경 감지
  vector: Float32Array;         // 1024d (text-embedding-3-small, PRD 결정)
  updatedAt: number;
}

export interface Settings {
  id: "singleton";              // 항상 한 행
  aiOptOutGlobal: boolean;      // 전역 AI 사용 거부 (FEAT-privacy 기본 토글)
  persistGranted: boolean | null; // null = 미요청, true/false = 결정됨
  storageQuotaShown: { at80: boolean; at95: boolean };
  uiLocale: "ko";               // FEAT-i18n
  installPromptShown: boolean;
}

export class MossDB extends Dexie {
  notes!: Table<Note, string>;
  boards!: Table<Board, string>;
  connections!: Table<Connection, string>;
  embeddings!: Table<EmbeddingCacheEntry, string>;
  settings!: Table<Settings, "singleton">;

  constructor() {
    super("moss");
    this.version(1).stores({
      notes: "id, boardId, kind, createdAt, lastVisitedAt, aiOptOut",
      boards: "id, isSystem, lastOpenedAt",
      connections: "id, sourceNoteId, targetNoteId, status",
      embeddings: "noteId, updatedAt",
      settings: "id",
    });
  }
}
```

**OPFS 어댑터**:
```ts
// src/state/db/opfs.ts
async function getDir(): Promise<FileSystemDirectoryHandle>;
async function putBlob(filename: string, blob: Blob): Promise<string>; // 반환 = attachmentRef
async function getBlob(ref: string): Promise<Blob | null>;
async function deleteBlob(ref: string): Promise<void>;
async function quotaUsage(): Promise<{ usage: number; quota: number; pct: number }>;
```

## 6. 인터페이스

### Store actions (Zustand, 비동기는 thunk 패턴)
- `init(): Promise<void>` — DB 오픈 + settings 로드 + persist 요청 판정
- `loadCards(boardId: string | null): Promise<Note[]>` — 보드별 메모 로드 (`boardId=null` → 무소속)
- `saveNote(note: Partial<Note> & { id: string }): Promise<void>` — upsert, debounce 권장 (호출자가 처리)
- `removeNote(id: string): Promise<void>` — 메모 + 연결 + 첨부 cascade 삭제
- `saveBoard / removeBoard`
- `saveConnection / removeConnection`
- `updateSettings(patch: Partial<Settings>): Promise<void>`

### React hook
- `useStorageInit()` — 앱 진입 시 1회 호출, suspense compatible
- `useStorageQuota()` — 현재 사용량 반응형 (5분 polling 또는 saveNote 후 invalidate)

## 7. 시각·인터랙션

직접 UI 없음. 다만 다음 안내 UI를 다른 feature에 위임:
- persist 권한 요청 모달 — 시스템 보드 "머무는 생각" 카드 안에 잔잔한 인라인 카드로 (PRD §8 톤: 잔잔함, 강요 없음)
- 용량 80%·95% 토스트 — 우하단, 3초 자동 dismiss (PRD §19 모션 가이드)
- 오프라인 표시 — 상단 1px 띠 "오프라인 — AI는 잠시 멈춰요" (PRD §11·14의 offline variant)

## 8. 비기능 요구사항

- **성능**: saveNote → IDB write 50ms 이내 (debounce 300ms로 burst 흡수). loadCards(보드 메모 100개) < 100ms.
- **무결성**: cascade 삭제 시 트랜잭션 보장 (Dexie `transaction`)
- **이주성**: 스키마 변경은 v 증가 + 명시 마이그레이션 함수. 다운그레이드 미지원 (한 방향만).
- **프라이버시**: 어떤 데이터도 서버로 자동 전송 안 함. AI 호출은 [[FEAT-ai-pipeline]]이 사용자 옵트인 + aiOptOut 체크 후에만.
- **접근성**: 직접 UI 없음.

## 9. 다음 iteration (의도적 보류)

- **Pro 동기화** (Yjs + y-websocket relay) — 별도 FEAT로 분리, MVP 후 (PRD §23)
- **암호화** — Pro 동기화와 함께. MVP 로컬은 평문 (사용자 본인 기기)
- **백업 자동화** — 7일·30일 주기 .moss 번들 자동 생성 → 사용자가 다운로드 폴더에 — Phase 2
- **SQLite WASM 교체 검토** — 메모 1,000+ 시점에 (PRD §38-2 Decision 1)

## 10. 검증 방법 (DOD)

- [ ] Dexie 단위 테스트: schema v1 open, CRUD, 트랜잭션 cascade
- [ ] OPFS adapter 단위 테스트: put/get/delete/quota
- [ ] PWA 검증: Lighthouse PWA 100, 오프라인 재방문 1.5초 이내
- [ ] persist 요청은 1회만 발동, 결정 영속
- [ ] 사용량 80%·95% 임계 토스트 트리거 시점 정확
- [ ] 다른 feature(capture·canvas·...)가 본 store actions 호출만으로 영속 가능
