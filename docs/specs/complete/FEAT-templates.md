# FEAT-templates · 5종 시작 템플릿

> 새 보드 만들 때 빈 캔버스 외에 4개 시작점을 제시. 정답 제공이 아니라 흐름 제안.

**Status**: ✅ complete (2026-05-21) — 검증 통과, AC 모두 충족
**Estimated**: S
**Blueprint**: `features[id="FEAT-templates"]`

---

## 1. 목표

빈 캔버스는 "어디서 시작할지 모르는 느낌"을 유발할 수 있다. 5종 starter 템플릿은 보드 생성 시 5가지 시작 분위기 중 하나를 고를 수 있게 해서 첫 캡처의 마찰을 줄인다. 다만 결정형 워크플로(템플릿 = 정답)가 되지 않도록 "흐름 제안" 수준으로 가볍게.

## 2. 범위

### 포함
- 5종 starter 템플릿 정의 (PRD §7-5):
  1. **자유 캔버스** — 빈 보드 (기본)
  2. **마인드 확장** — 중앙에 root 마인드맵 카드 1개
  3. **프로젝트 보드** — 왼쪽 "아이디어" 컬럼 + 오른쪽 "실행" 컬럼 (가벼운 가이드 카드 2-3개)
  4. **리서치 보드** — 상단 "수집" 영역, 하단 "인사이트" 영역 안내
  5. **일기 보드** — 오늘 날짜 텍스트 카드 + 빈 감정 슬롯
- 템플릿 선택 UI: `+ 새 보드` 클릭 시 모달 또는 시트 (5개 카드 그리드 + 짧은 카피)
- 템플릿 적용 = 새 보드 생성 + 해당 템플릿의 초기 카드들을 자동 배치
- 보드 메타에 `templateId` 저장 (분석용, 사용자에겐 표시 안 함)

### 제외 (다른 FEAT 담당)
- 보드 자체 생성·관리 — [[FEAT-boards]]
- 카드 자동 배치 좌표 계산 — [[FEAT-canvas]] world space 사용
- 시스템 보드 "머무는 생각"은 별도 — [[FEAT-home]] (템플릿 아님)
- 카드 콘텐츠 편집 — [[FEAT-capture]]

## 3. 수용 기준

### AC-1 (REQ-12 충족) — 5종 모두 작동
- **Given** 사용자가 `+ 새 보드` 클릭
- **When** 5종 중 하나 선택 후 확인
- **Then** 새 보드 생성됨 + 해당 템플릿의 초기 카드들이 자동 배치됨 + 보드로 전환 + 메타에 `templateId` 저장.

### AC-2 — "자유 캔버스" 기본 선택
- **Given** 템플릿 picker 진입
- **When** 사용자가 ESC 또는 빈 곳 클릭으로 닫음
- **Then** **새 보드는 생성 안 함** (취소). 자유 캔버스를 원하면 명시적으로 선택해야 함.

### AC-3 — 템플릿 카피 톤
- **Given** 템플릿 picker UI
- **When** 사용자가 보는 카피
- **Then** "정답을 제공하지 않습니다. 당신만의 흐름을 만듭니다." (PRD §7-5) 톤. 명령형·지시형·생산성 강조 카피 금지.

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-12
- 등장 화면: SCR-workspace `board-empty` variant (새 보드 첫 진입)
- 등장 flow: FLOW-board-build (step 1 — 새 보드 + 템플릿)

### 다른 feature
- **의존**: [[FEAT-boards]] (`createBoard(name, templateId)`), [[FEAT-capture]] (초기 카드 데이터 생성 시 Note 스키마), [[FEAT-canvas]] (좌표 배치)
- **의존받음**: 없음 (말단 feature)

### 외부 라이브러리
- 없음

## 5. 데이터 모델

```ts
// src/templates/index.ts
export interface Template {
  id: string;                       // "free" | "mindmap" | "project" | "research" | "diary"
  name: string;                     // i18n 키 -> 한국어 이름
  description: string;              // i18n 키 -> 1-2줄 설명
  initialCards: Array<{
    kind: NoteKind;
    x: number;
    y: number;
    width: number;
    content: string;                // i18n 키도 가능 (예: 일기 템플릿의 오늘 날짜는 동적 생성)
    placeholderContent?: boolean;   // true면 사용자가 첫 편집 시 자동 클리어
  }>;
}

export const TEMPLATES: Template[] = [
  { id: "free", name: "templates.free.name", description: "templates.free.desc", initialCards: [] },
  // ... 5개
];
```

## 6. 인터페이스

### React 컴포넌트
- `<TemplatePicker open onClose onSelect={(templateId) => void} />` — 모달
- `<TemplateCard template={Template} selected={bool} onClick />` — picker 안 각 항목

### Store actions
- `useWorkspace.createBoardFromTemplate(templateId: string, name: string): string` — 보드 생성 + 초기 카드 일괄 추가 (트랜잭션)

## 7. 시각·인터랙션

- PRD 참조: §7-5
- picker UI: 5개 카드를 2×3 또는 3×2 그리드. 각 카드는 작은 미리보기 + 이름 + 1줄 설명
- 미리보기 일러스트: 매우 단순한 선화 (mindmap=중심 원 + 가지, project=두 컬럼, research=상단/하단, diary=날짜+빈 칸, free=빈 페이지)
- 모달 톤: 흰 배경, 미세 그림자, 잔잔한 카피

## 8. 비기능 요구사항

- **성능**: 템플릿 적용 (보드 + 초기 카드 5개 이내) < 500ms
- **i18n**: 5종 이름·설명 모두 i18n 키
- **접근성**: 키보드 화살표로 5개 항목 순회, Enter 선택

## 9. 다음 iteration

- **사용자 정의 템플릿** — 사용자가 자기 보드를 템플릿으로 저장
- **템플릿 마켓플레이스** — Phase 3+
- **AI 추천 템플릿** — 사용자 패턴 기반 ([[FEAT-ai-pipeline]] 데이터 기반)
- **템플릿 미리보기 인터랙션** — picker에서 hover 시 큰 미리보기

## 10. 검증 방법 (DOD)

- [ ] 5종 템플릿 모두 적용 시 보드 + 초기 카드 정확히 생성
- [ ] picker ESC / 빈 곳 클릭 → 보드 생성 안 함
- [ ] 카피가 PRD §7-5 톤 (명령형 금지)
- [ ] i18n 키 모두 messages/ko.json에 존재
