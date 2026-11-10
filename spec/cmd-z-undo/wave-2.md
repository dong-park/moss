# 웨이브 2 보고서 — 스레드 main-20261110-1150

**노드**: n2 (메모 편집기 history), n3 (보드별 캔버스 기록 장치)
**결과**: 둘 다 끝남.

| 노드 | 결론 | 커밋 |
|---|---|---|
| n2 | 펼친 메모 창 편집기에 @milkdown/plugin-history를 넣었다. 실제 Milkdown 편집기로 undo·redo·열자마자 undo를 시험했다. 편집기 시험 101개 통과 | 235a60d |
| n3 | 보드별 UndoManager, 100단계 상한, 묶음 깊이·토큰 세대·보드 떠날 때 초기화, 키 경로, 기록 안 하는 origin, 되돌리기 탭 방송을 만들었다. 펜 묶음도 미리 만들었다. 새 시험 31개, 기존 회귀 70개 통과 | 3109ad1 |

## /review

판정: APPROVE
플레이북: code · 범위 1686a18..3b97527, 수정 c3447ac
검토자: ① opus·xhigh 지적 2·버림 1 ② opus·xhigh 지적 5·버림 0 · 계열 못 나눔: GPT 한도(주간 96%)
등급: P0 0→0 · P1 2→0 · P2 3→0
바퀴: 1) P0 0·P1 2·P2 3  2) 0·0·0
검증 지적:
- [P1] [이번 변경] undoKeys.ts isUndoZKey — QWERTZ 자판 ctrl+y가 캔버스 되돌리기가 됐다(교차 확인). e.code KeyZ는 e.key가 라틴 글자가 아닐 때만 받게 고쳤다
- [P1] [이번 변경] undoKeys.ts handleUndoKeyDown — 다른 탭이 편집 중·펼친 카드를 지우면 남은 id가 캔버스 cmd+z를 막았다. undoKeyStateFrom으로 고쳤다
- [P2] [이번 변경] undo.ts closeUndoStep, origin.ts transactUntracked 중복 삭제. Canvas 입력칸 판정을 isTypingTarget 하나로
버림: ① F1 되돌린 뒤 같은 값 재선택이 문서에 안 쓰임 — n5 작업 7(sharedSnapshot 맞추기) 몫. n5 완료 기준에 시나리오를 넣었다
회귀: src/components/workspace·src/state 161개 파일 1,408개 통과, tsc 오류 0
남은 위험: n5 전까지 되돌린 뒤 같은 값을 다시 고르면 문서에 안 쓰인다. 브라우저 meta+z는 확인 안 됨(PR 전 prover)
교훈 후보: 없음

## 기다리는 것

- n2 「브라우저 확인」 3항목(T2, T3, BlockMenu)은 PR 전 prover가 본다.
