# 유리벽 P0 티켓 — DAG 분해 브리프

사용자가 줄기와 티켓 스펙에 동의했다(2026-10-11). 이제 네가 쓴 티켓을 runner가 바로 집을 수 있는 노드로 나눈다.

## 따를 절차
- `~/.claude/skills/spec/dag.md` 의 kind=`issues` 절차와 「DAG 검증 기준」을 그대로 따른다. 템플릿은 `~/.claude/skills/spec/templates/issues-readme.md`, `issues-node.md`.
- rows 형식이다. **작업 행(T)이 이미 수용 기준을 가진 태스크다.** 노드는 작업 행을 묶는다. 노드 이름·브리프에 담당 행 id(T1, T4…)를 그대로 쓴다. status가 `보류`인 행은 노드에 넣지 않는다.
- 인덱스는 네 티켓의 `spec.md`에 `## 노드 인덱스` 절로 붙인다(기존 머리 표·문제·목표·비목표·경계 조건은 지우지 않는다). 노드 브리프는 같은 폴더에 `nN-<name>.md`.
- 노드 ≈ runner 1세션. 완료 기준은 실행 가능한 커맨드(예: `cd web && bun run test -- <파일>`, `bunx tsc --noEmit`) 또는 이진 조건. moss/web 는 bun 사용, node_modules 미설치 상태일 수 있다(메모리: 플래키 테스트 2종 있음). 브라우저 손맛·시각 확인이 필요한 행은 "실브라우저 확인" 노드로 따로 모으고 `**agent**`는 기본값으로 둔다.
- 결정 행은 모두 닫혀 있다(recommend = 확정 답). 브리프에는 확정 답을 그대로 박는다.

## 티켓 사이 의존 (다른 티켓 노드에 deps를 걸지 말고, 브리프에 "선행: <티켓> <노드>"로 적는다)
- 벽 획 저장 모델은 wall-marker 몫. marker-feel·marker-meets-sticky·wall-zoom·local-ownership이 그걸 쓴다.
- 유리 흐림 방식은 wall-scale D5(미리 흐린 정적 배경, 실시간 블러 없음)로 확정. glass-surface가 따른다.
- 첫 벽 = 기존 시스템 보드(first-wall D3=A). local-promise D2(첫 벽 공유 시 새 벽으로 복사)와 짝.
- 손글씨 폰트는 Google Fonts에서 불러오지 않는다(공유 안 한 벽에서 외부 요청). moss가 직접 싣는다 — glass-surface 몫.
- 마카 색·굵기는 이름으로 저장(wall-marker D3, marker-feel D1).

## 끝나면 돌려줄 것
인덱스 경로, 노드 수, ASCII DAG, critical path 길이, 다른 티켓에 걸린 선행 목록. 커밋하지 않는다. 코드 고치지 않는다.
