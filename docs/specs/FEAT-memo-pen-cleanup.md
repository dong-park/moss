# FEAT-memo-pen-cleanup · 정리 & 검증

> 마크다운 통일 후 죽은 블록 스택 코드를 걷어내고, 작성만 되고 미실행인 테스트를 실제로 GREEN 확인한다.

**Status**: spec
**Estimated**: S (각 항목)
**Owner**: (WS-D)
**Reference**: `/tldr` 리뷰 (2026-06-03) — C2/C3 + deep-interview D3

---

## 1. 목표 (Job Statement)

개발자가 / 메모/펜 코드를 읽을 때 / "어느 게 진짜 경로냐"는 혼란 없이 / 죽은 블록 스택 잔재를 제거하고, 작성만 된 56개 테스트가 실제로 통과함을 확인한다.

[[FEAT-markdown-memo-pen]]가 블록 스택 아키텍처를 채택했다가 마크다운 통일로 되돌리면서(v3 마이그레이션) 블록 렌더 경로가 죽었고, vitest는 drvfs 환경 때문에 로컬 미실행으로 남았다.

## 2. 범위

### 포함 (in-scope)
- **C2a 죽은 블록 제거 (즉시)**: 외부 사용 0으로 grep 확인된 `blocks/TextBlock.tsx`·`blocks/HandwritingBlock.tsx`·`blocks/codeKeys.ts`(`applyCodeKey`)·`parseBlocks`/`makeBlock` + 관련 테스트 제거.
- **C2b useHandwriting 제거 (조건부)**: [[FEAT-pen-drawing-engine]]가 `handwriting/Content`를 수렴 엔진으로 이관해 `useHandwriting` 死가 확정되면 파일·테스트 제거.
- **C3 vitest 실제 실행**: Linux/CI(또는 비-drvfs FS)에서 메모/펜 관련 56케이스 GREEN 확인.
- **D3 undo 범위 스파이크**: 펜 모드 `Cmd+Z`가 stroke vs 카드이동 중 무엇을 되돌리는지 실측 → 결과를 엔진([[FEAT-pen-drawing-engine]]) 또는 UI([[FEAT-pen-mode-ux]])로 라우팅(이 단위는 진단까지).

### 제외 (보존 — 삭제 금지)
- `blocksToMarkdown` — v3 마이그레이션 + 표시 시점 호환에 **생존**.
- `serializeBlocks` — `workspace.ts`에서 사용 중.
- `CardBlock` 타입 — `text/Content.tsx`·`schema.ts`·`workspace.ts` 참조 중.
- `CodeBlock`(이름) — `MarkdownToolbar.tsx`의 동명 심볼일 수 있어 분별 후 판단.

## 3. 수용 기준 (Acceptance Criteria, GWT)

### AC-1 (C2a) 죽은 코드 제거
- **Given** 제거 대상 심볼
- **When** 삭제 후 tsc/eslint/build
- **Then** 클린하고, 보존 대상(`blocksToMarkdown`/`serializeBlocks`/`CardBlock`)은 그대로 동작한다.

### AC-2 (C2b) useHandwriting 死 확정 후 제거
- **Given** [[FEAT-pen-drawing-engine]] 머지 완료
- **When** `useHandwriting` 외부 사용 grep
- **Then** 0이면 파일·테스트 제거, tsc 클린.

### AC-3 (C3) 테스트 실제 GREEN
- **Given** 비-drvfs 환경
- **When** vitest 실행
- **Then** 메모/펜 56케이스(`cardContent.blocks`·`CardContent.text`·`MemoExpand`·`penMode` 등) PASS, 실패 시 목록화.

### AC-4 (D3) undo 범위 진단
- **Given** 펜 모드 ON, stroke 1개 + 카드 이동
- **When** `Cmd+Z`
- **Then** 무엇이 되돌려지는지 관측 결과를 기록하고 후속 단위로 라우팅.

## 4. 의존성

### 다른 feature
- **의존**: [[FEAT-pen-drawing-engine]] — C2b는 WS-A 머지 후에만 풀림(C 그룹).
- C2a·C3·D3은 **독립**(anytime).

### 코드 기준점
- `web/src/components/workspace/cards/_shared/blocks/{TextBlock,HandwritingBlock,codeKeys,useHandwriting}.{ts,tsx}`
- `web/src/state/cardContent.ts` (`parseBlocks`/`makeBlock` 제거, 나머지 보존)
- 관련 테스트: `web/src/state/__tests__/cardContent.blocks.test.ts` 등 — 제거 심볼 케이스만 정리
- CI 설정 (C3)

## 5. 데이터 모델

변경 없음 (코드 제거만). v2/v3/v4 마이그레이션 체인은 유지.

## 6. 인터페이스

해당 없음(삭제·검증 작업). 제거 전 `rg <symbol>`로 외부 사용 0 재확인 후 삭제.

## 7. 시각·인터랙션

해당 없음.

## 8. 비기능 요구사항

- **안전**: 삭제는 grep으로 사용처 0 확인 후. 보존 목록(§2) 절대 삭제 금지.
- **검증**: C3는 게이트 — 실패 케이스가 곧 발견 항목.

## 9. 다음 iteration (의도적 보류)

- drvfs에서 vitest가 안 뜨는 환경 이슈 자체 해결 — CI 위임으로 우회 중.

## 10. 검증 방법 (DOD)

- [ ] C2a: 제거 후 tsc/eslint/build 클린, 보존 심볼 동작 (AC-1)
- [ ] C2b: WS-A 후 `useHandwriting` grep 0 → 제거, tsc 클린 (AC-2)
- [ ] C3: 비-drvfs vitest 56케이스 GREEN, 실패 목록화 (AC-3)
- [ ] D3: undo 범위 관측 기록 + 라우팅 (AC-4)
- [ ] `git diff --stat`로 보존 대상 미변경 확인
