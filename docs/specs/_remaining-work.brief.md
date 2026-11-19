# 브리프 — moss 남은 일 정리 + 기능 로드맵

## 기능명
moss 남은 일 정리(마무리 작업) + 남은 기능 로드맵. 산출물: `/Users/dongpark/moss/docs/specs/_remaining-work.md` (신규; 이 레포는 스펙을 `spec/`이 아니라 `docs/specs/`에 둔다 — 관례를 따를 것).

## 사용자가 확정한 요구
- 범위 = "정리 + 남은 기능 로드맵" (사용자 선택). 한 문서 안에서:
  1. **마무리 정리**: 구현만 끝나고 브라우저 수동 확인이 안 된 스펙 검증, 낡은 `_index.md` 갱신, 백업 파일 정리, 작은 fix.
  2. **로드맵**: 남은 기능(freemium·home·signals·mobile·extras·subcanvas·ai-pipeline 잔여·sticky-redesign QA)의 잔여 작업·우선순위·의존 관계를 DAG로. 기능 구현 자체는 각 FEAT 스펙이 담당 — 이 문서는 순서와 경계, 노드별 수용 기준만.
- 노드 4개 이상이 예상되므로 DAG 형식(노드 인덱스 표 `| ID | brief | deps | status |` 포함)으로.

## 레포
/Users/dongpark/moss (main, clean, 마지막 커밋 561ed92 "export 의존성은 bun.lock만", 2026-09-20). 모노레포: `web/`(Next.js 16.2, React 19, Dexie, zustand, Milkdown, Vitest, bun), `mcp/`(moss-mcp WS 브리지), `docs/`(blueprint + specs).

## 확인된 사실 (이 세션이 직접 읽음)
- 제품: local-first 사고 작업대 PWA. NON-GOALS: 협업·태스크관리·캘린더·AI대필·정량지표. DONE 기준: Thought Return/Connection Rate/Revisit Time/Draft Conversion/D30·D90 지표 5개 측정 가능 상태로 출시 (`docs/moss.blueprint.json` description).
- `docs/specs/_index.md`는 2026-05-22 기준(complete 6·in-progress 4·pending 4)으로 실제와 어긋남. complete/ 에는 boards·capture·i18n·privacy·storage·templates 6개.
- "구현 완료, 브라우저 수동 확인 대기" 스펙 7개: FEAT-export(수동 DOD), FEAT-memo-title(AC-1·4·5·7), FEAT-memo-title-front-edit, FEAT-memo-empty-keep, FEAT-canvas-initial-view, FEAT-bridge-kind-cleanup(AC-7 스모크), FEAT-sticky-redesign. FEAT-canvas는 "200카드 60fps 수동 확인" 1건 남음.
- FEAT-memo-empty-cleanup은 ⛔ 폐기(→ memo-empty-keep). 2026-06 완료된 memo/pen 스펙 다수(✅ complete)가 아직 `complete/`로 안 옮겨짐.
- in-progress: FEAT-ai-pipeline(잔여: 쿼터 게이트 `useQuotaGate()` stub, JWT 검증, 외부 API 1회 재시도 — 앞 둘은 freemium 합류 대기), FEAT-home(큐레이팅 카드 1/4; resurfacing·today-connection·flow-timeline 3종 + AC-3 도구 drop 안내 잔여), FEAT-signals(lint 2건 `useSignals.ts:29`·`useSignals.test.tsx:27,161`, ClusterSection·FlowSummarySection, AC-2 키워드 필터, AC-5 dismiss 24h 잔여).
- spec만 있음: FEAT-freemium(Stripe·webhook·쿼터·페이월 3variant·useQuotaGate 실구현), FEAT-mobile(≤768px 분기·피드·하단 캡처바), FEAT-extras(위젯 3종), FEAT-subcanvas("spec 작성", `docs/plans/FEAT-subcanvas.md` 계획 존재).
- 독에서 펜·시그널스 도구 임시 숨김 상태(커밋 a875363, `web/src/components/workspace/Dock.tsx`).
- 작은 fix 현황: `vitest.setup.ts`에 `IS_REACT_ACT_ENVIRONMENT` 없음(미처리), `check:i18n`이 prebuild에 연결 안 됨(미처리). `docs/moss.blueprint.json.bak`~`.bak5` 5개 잔존. `web/node_modules` 미설치.
- 미확인: DatabaseClosedError cleanup(useClipboardWatch.test) 처리 여부, 플래키 테스트 2종 정체(메모리 기록상 존재), freemium/mobile/extras 스펙 본문 세부.

## 결정 필요 시
사용자에게 묻지 못하므로 열린 질문은 문서 끝 "열린 질문"에 모으되, 기본안을 함께 제시할 것 (예: 브라우저 검증 도구 = `/prove`, 폐기·완료 스펙 이동 규칙).
