# FEAT-privacy · AI 데이터 프라이버시

> 메모는 사용자 기기에 머무는 게 기본. AI 호출 시 사용자는 무엇이 서버에 가는지 정확히 알고 통제할 수 있다.

**Status**: ✅ complete (2026-05-21) — 검증 통과, AC 모두 충족
**Estimated**: M
**Blueprint**: `features[id="FEAT-privacy"]`

---

## 1. 목표

moss는 사고 작업대다. 사고는 곧 사용자의 가장 사적인 영역이다. AI를 도구로 쓰되, **어떤 메모가 / 언제 / 어디로 전송되는지** 사용자가 항상 통제 가능해야 한다. 기본값은 보수적(데이터 최소화), 사용자가 명시 허용한 메모만 서버를 통과한다.

## 2. 범위

### 포함
- `Settings.aiOptOutGlobal`: 전역 AI 사용 거부 토글 (false=허용 기본, true=서버 통과 완전 차단)
- `Note.aiOptOut`: 메모 단위 옵트아웃 (true면 그 메모는 어떤 AI 호출도 통과 안 함)
- UI 표식: aiOptOut 메모는 시각적으로 다른 마크 (예: 자물쇠 아이콘)
- AI 호출 직전 투명 표시: "지금 분석되는 메모 N개 — 미리보기" (PRD §28-2)
- AI 응답 받기 전 취소 가능 (cancel token)
- 백엔드 프록시 로그 정책: 사용자 ID + 호출 시각 + 토큰 수만, **메모 본문 절대 로그 금지**
- 외부 API 응답 저장 금지 (단순 중계)
- `aiOptOut=true` 메모 ID는 클라이언트 필터 단계에서 차단 (네트워크 호출 자체 X)

### 제외 (다른 FEAT 담당)
- AI 호출 자체 (임베딩·요약·연결) — [[FEAT-ai-pipeline]]
- AI 결과 UI (Signals 패널) — [[FEAT-signals]]
- 결제·쿼터 — [[FEAT-freemium]]
- 종단간 암호화 (Pro 동기화) — Phase 2

## 3. 수용 기준

### AC-1 (REQ-10 충족) — 옵트아웃 메모는 서버 통과 X
- **Given** Note A의 `aiOptOut=true`
- **When** [[FEAT-ai-pipeline]]이 임베딩 큐를 처리하려 함
- **Then** Note A는 큐 진입 단계에서 필터링되고 어떤 외부 API 요청에도 포함되지 않음. 네트워크 탭에 A의 본문 자취 없음.

### AC-2 (REQ-10 보강) — 전역 옵트아웃
- **Given** `Settings.aiOptOutGlobal=true`
- **When** AI 호출이 시도되는 모든 시점
- **Then** 모든 호출이 클라이언트에서 차단됨. Signals 패널은 "Signals를 켜면 패턴이 보입니다" 안내 + 토글로 잠금 상태 표시 (SCR-signals의 본 variant는 별도지만 이 케이스도 동일 처리)

### AC-3 (REQ-10 보강) — 호출 직전 투명 표시
- **Given** AI 호출이 트리거됨 (예: 사용자가 "더 보기" 클릭)
- **When** 백엔드 프록시로 요청 보내기 직전
- **Then** UI에 "지금 분석되는 메모 N개" 표시 + 일부 메모 제목 미리보기. 사용자가 "취소"를 누르면 요청 abort.

### AC-4 — 자물쇠 아이콘
- **Given** Note에 `aiOptOut=true`
- **When** 캔버스 또는 Signals 패널에서 해당 카드 표시
- **Then** 우상단 또는 헤더에 자물쇠 아이콘 (PRD §28-2). hover 시 "이 메모는 AI를 거치지 않아요" 툴팁.

### AC-5 — 백엔드 로그 정책
- **Given** AI 호출이 성공
- **When** 백엔드 프록시 로그 확인
- **Then** 로그에 `userId / timestamp / tokensUsed / modelId`만 있음. `noteId`·본문·임베딩 vector는 로그 어디에도 없음.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-10
- 등장 화면: SCR-workspace (카드 자물쇠 표시), SCR-signals (호출 직전 안내, 옵트아웃 잠금)
- 등장 flow: FLOW-ai-connection (AI 호출 모든 step에서 본 게이트 통과)

### 다른 feature
- **의존**: [[FEAT-storage]] (Note·Settings 필드)
- **의존받음**: [[FEAT-ai-pipeline]] (모든 호출이 본 게이트를 거침), [[FEAT-signals]]

### 외부 라이브러리·API
- 없음 (정책 + UI + 필터링 레이어)

## 5. 데이터 모델

Storage 스키마에 이미 포함:
- `Settings.aiOptOutGlobal: boolean` (기본 false — AI 사용 허용)
- `Note.aiOptOut: boolean` (기본 false)

추가 메타 (옵션, Phase 2):
- `AICallLog` (클라이언트 로컬 — 사용자가 "내 메모가 언제 분석됐는지" 보고 싶을 때)
  ```ts
  interface AICallLog {
    id: string; at: number; noteIds: string[]; modelId: string;
    tokensIn: number; tokensOut: number; status: "success" | "cancelled" | "error";
  }
  ```
  MVP는 보류 — 메모리 부담. Phase 2.

## 6. 인터페이스

### Store actions
- `useWorkspace.toggleAIOptOut(noteId: string): void`
- `useWorkspace.toggleGlobalAIOptOut(): void`
- `useWorkspace.canSendToAI(noteId: string): boolean` — 호출 직전 가드. global·note·boardId 일괄 검사.

### React 컴포넌트
- `<AIOptOutBadge noteId={id} />` — 자물쇠 아이콘 + 툴팁
- `<AICallPreview notes={Note[]} onCancel={() => void} onConfirm={() => void} />` — AI 호출 직전 모달/시트
- `<AIOptOutSettingsRow />` — 설정 화면용 토글

### Hooks
- `useAIGate(): { send: (notes: Note[]) => Promise<void>, blocked: boolean }` — [[FEAT-ai-pipeline]]이 본 hook을 통해서만 외부 호출

## 7. 시각·인터랙션

- PRD 참조: §28 (Privacy & Data Flow), §13 SCR-signals (옵트아웃 잠금 케이스)
- 자물쇠 아이콘 톤: 회색 (밝지 않게). 강제·경고 톤 금지.
- AI 호출 안내 모달: 잔잔한 톤. "다음 메모를 분석에 사용해도 될까요?" 같은 명시적 동의 형태.
- 사용자가 거부 누르면 → Signals 패널이 그 자리만 dim. 다른 영역엔 영향 없음.

## 8. 비기능 요구사항

- **프라이버시 약속(PRD §28-1)** 4가지를 코드 레벨로 강제:
  1. 메모 본문은 기본 사용자 기기에만
  2. AI 끄면 어떤 메모도 서버 통과 X
  3. 켜도 aiOptOut=true 메모는 제외
  4. (Phase 2) Pro 동기화는 종단간 암호화
- **감사 가능성**: 모든 AI 호출 코드 경로가 `useAIGate.send()`를 거치도록 ESLint 규칙으로 강제 (`fetch`·`axios` 직접 호출 금지 — `/api/ai/*` 경로엔)
- **접근성**: 자물쇠 아이콘은 aria-label과 함께. 옵트아웃 토글은 키보드 도달.

## 9. 다음 iteration

- 메모 단위 AI 호출 로그 (`AICallLog`) — 사용자 감사 가능성
- aiOptOut 보드 단위 설정 ("이 보드 전체 옵트아웃") — 현재는 메모별 + 전역만
- 데이터 출신(provenance) 추적 — AI 응답이 어떤 메모에서 파생됐는지 역추적
- 외부 모니터링 도구(PostHog)에서 본문 마스킹 자동화 — [[FEAT-storage]]와 협의

## 10. 검증 방법 (DOD)

- [ ] 단위 테스트: `canSendToAI()` 진리표 (global × note × boardId 8개 조합)
- [ ] 통합 테스트: aiOptOut=true 노트로 AI 호출 시도 → 네트워크 요청 자체가 발생 안 함 (msw로 검증)
- [ ] ESLint 규칙: 코드 어디서도 `fetch("/api/ai/...")` 직접 호출 시 에러
- [ ] 백엔드 로그 점검: e2e 테스트 후 로그에 본문 자취 없음
- [ ] 자물쇠 아이콘 시각 점검 (PRD §28-2)
