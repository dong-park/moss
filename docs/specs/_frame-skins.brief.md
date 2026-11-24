# 브리프: FEAT-frame-skins — 메모판 스킨

레포: /Users/dongpark/moss (웹앱은 web/, Next.js + zustand + IndexedDB)
산출물: /Users/dongpark/moss/docs/specs/FEAT-frame-skins.md  (레포 규약: docs/specs/_template.md 형식을 따른다. 새 파일)

## 사용자가 확정한 요구사항
- 메모판(kind="frame" 카드)을 "스킨"을 갈아 끼워 다른 형태로 쓸 수 있게 한다.
- 제품 방향: 비목표(업무/태스크 관리, 캘린더) **안에서** 해석한다.
  - 칸 스킨 = 완료 개념 없는 "생각 분류판". 칸 이름은 사용자가 정한다. 기본 칸 예: 씨앗 / 자라는 중 / 묵힘. "완료/할 일/마감" 같은 기본값·UI 금지.
  - 달력 = 일정 잡기가 아니라 "메모가 생긴 날에 붙는 돌아보기 달력". 마감·due date 필드 금지.
- 이번 스펙 범위: **스킨 틀(레지스트리) + 세로 칸(columns) 스킨 구현**. 월달력(month)은 **가독성 실험 노드만** 둔다(구현 아님). 실험 결과로 다음 스펙에서 결정.

## 설계 원칙 (대화에서 정한 것)
- 스킨 = 판의 배경 그림 + 드롭 스냅 규칙 + 위치 해석(어느 칸에 속하나). 칸 소속은 **저장하지 않고 위치에서 파생**한다. 캔버스 좌표가 유일한 진실.
- 별도 투영 뷰(노션식 뷰 전환)로 만들지 않는다 — 자유 배치/스킨 배치 두 벌 관리 금지.
- 스킨을 바꿔도 카드 좌표는 움직이지 않는다(데이터 손실 없음). 필요하면 "칸에 맞춰 정렬" 1회 액션은 선택 사항으로 검토.
- 레지스트리: skins/{free,columns,...}.ts 각 스킨이 render-background / snap / resolveSlot 세 함수만 구현. 이후 주간표·2x2 매트릭스 확장 여지.

## 확인된 사실 (이 세션에서 직접 읽음)
- web/src/state/frameContent.ts: frame Note.content = JSON `{name}`. encodeFrameContent(name)/frameNameOf/decodeFrameContent 단일 소스. 이름 trim·40자. → `{name, skin?, columns?}` 확장으로 DB 스키마 변경 없이 가능. 기존 `{name}`만 있는 데이터는 skin="free"로 읽어야 함(하위 호환).
- web/src/state/workspace.ts: Card에 `frameId?` (메모판 소속). resolveMembership(cardIds)(~1832행)이 findOwningFrame(frames, cardCenter(card))로 카드 중심점 기준 소속 판을 계산해 frameId 갱신·setFrameMembership으로 DB 기록. moveFrame(~1856행)은 판+멤버를 함께 이동.
- web/src/components/workspace/cards/frame/Content.tsx: 판 렌더는 이름표 + 인라인 이름 편집만. 이동/리사이즈는 DraggableCard·ResizeHandles가 kind==="frame" 분기로 처리. 메모보다 아래 z층.
- web/src/components/workspace/DraggableCard.tsx ~1130행: Radix ContextMenu. frame/board에 "이름 변경" 항목(renamingCardId 신호). 스킨 전환 메뉴는 여기에 추가하는 게 자연스러움.
- web/src/components/workspace/cards/_shared/zoomLod.ts: 줌 LOD 유틸(zoomCompensatedPx 등) 존재 — 달력 실험에서 축소 가독성 판단에 관련.
- 블루프린트 NON-GOALS 문구(docs/moss.blueprint.json*): "팀 협업, 실시간 공동 편집, 업무/태스크 관리, 캘린더, AI 대필, streak·완료율". 과거 "생각 일기(캘린더 그리드 + 날짜별 dot)" 위젯 기획이 있었음 — 돌아보기 달력의 선례.
- 메모 카드는 kind별 고정 종횡비(aspectForKind)·폭(widthForKind). 달력 7x5 칸에 여러 장 넣으면 판이 거대해지는 게 최대 위험.
- 현재 브랜치 fix/table-header-wikilink-title, 무관한 미커밋 변경 다수 있음(건드리지 말 것). web/ 의존성 미설치, 플래키 테스트 2종 있음(미확인 세부).
- 관련 기존 스펙: docs/specs/FEAT-sticky-redesign/n7-frames.md (메모판 도입), docs/specs/FEAT-frame-feel.md — 참고하되 다시 설계하지 말 것.

## 스펙에 꼭 들어갈 것
- 수용 기준 GWT: 스킨 전환(우클릭 메뉴), 칸 배경 렌더, 칸 추가/이름 변경/삭제(삭제 시 카드는 그대로), 드롭 시 칸 안으로 스냅, 위치로 칸 소속 파생, 판 리사이즈 시 칸 폭 비례, 하위 호환(`{name}`만 있는 판 = free), 내보내기/MCP에서 칸 이름 읽기 가능 여부(범위 판단 필요).
- 월달력 실험 노드: 판을 달력 크기로 키우고 7x5 배경만 그린 뒤 메모 20장 배치, zoomLod 축소 상태 가독성 판정 기준(통과/실패 조건을 수치로).
- 비목표 명시: 완료 칸·마감일·할 일 체크, 달력 스킨 구현, 투영 뷰.
