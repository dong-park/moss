# FEAT-mobile · 모바일 머무는 생각 피드 + 캡처 바

> 모바일 진입 시 기본 화면. 데스크톱의 캔버스 자유 배치 대신 시스템 보드 카드를 리스트뷰로. 하단 캡처 바가 메인 입력.

**Status**: spec
**Estimated**: M
**Blueprint**: `features[id="FEAT-mobile"]`

---

## 1. 목표

PRD §38-2: 데스크톱과 모바일은 같은 코드베이스 + 반응형. 다만 모바일은 자유 배치 캔버스 대신 **리스트뷰(피드)**로 변환. 시스템 보드 "머무는 생각" 카드들이 메인. 하단 캡처 바가 입력의 주 진입점.

## 2. 범위

### 포함
- viewport ≤ 768px일 때 SCR-mobile-feed 표시 (데스크톱과 라우팅 분기)
- 3 variant (SCR-mobile-feed):
  - `default`: 보드 가로 스크롤 + 필터 탭 + 카드 격자
  - `empty`: 보드 strip 숨김, "첫 생각을 남겨보세요" 안내
  - `offline`: 상단 1px 띠 "오프라인 — AI는 잠시 멈춰요"
- 상단 헤더: "머무는 생각" + 검색 + 메뉴
- 보드 가로 스크롤 (board strip): 최근 사용 5-7개 썸네일
- 필터 탭: `전체 / 보드 / 메모 / 이미지 / 링크 / 파일` (가로 스크롤)
- 카드 격자: 1-2열 반응형 (390px=1열, 600px+=2열)
- 카드 색상 = 분위기 컬러 (FEAT-canvas와 동일 톤)
- 하단 캡처 바:
  - `+` 빠른 추가 → SCR-capture-bar `mobile-sheet` variant 진입
  - `Aa` 텍스트 즉시 입력 (inline)
- 카드 인터랙션:
  - 탭 → 전체 보기 모달 (편집 가능)
  - 길게 누름 → 컨텍스트 메뉴 (보드 이동 / 색상 / 삭제)
- pull-to-refresh: 인사이트 갱신 (시스템 보드 큐레이팅 재계산)
- AI 옵트아웃 시 "AI 제안" 필터 탭 없음

### 제외 (다른 FEAT 담당)
- 캡처 10종 자체 — [[FEAT-capture]]
- 데이터 저장 — [[FEAT-storage]]
- 보드 picker (모바일은 보드 strip으로 대체) — [[FEAT-boards]] 일부 위임
- 카드 자유 배치 — 데스크톱 전용 ([[FEAT-canvas]])
- 시그널스 패널 — 모바일은 전체 화면 ([[FEAT-signals]] mobile 분기)

## 3. 수용 기준

### AC-1 (REQ-14 충족) — 모바일 반응형
- **Given** 모바일 viewport (390px)
- **When** moss 진입
- **Then** SCR-mobile-feed 표시. 데스크톱 사이드바·캔버스 안 보임.

### AC-2 (REQ-1 충족, 모바일) — 캡처 2초 이내
- **Given** SCR-mobile-feed `default` 상태
- **When** 하단 `+` 탭
- **Then** SCR-capture-bar `mobile-sheet` 200ms 이내 슬라이드업. 첫 입력까지 2초 이내 가능.

### AC-3 — 빈 상태
- **Given** 메모 0개
- **When** SCR-mobile-feed 진입
- **Then** `empty` variant. 보드 strip·필터 탭 숨김. 안내 카드 1개 "첫 생각을 남겨보세요" + 하단 캡처 바.

### AC-4 — 오프라인
- **Given** 네트워크 차단
- **When** 모바일 피드 진입
- **Then** `offline` variant. 상단 1px 띠 "오프라인 — AI는 잠시 멈춰요". 메모 저장·열람은 정상 (FEAT-storage).

### AC-5 — 카드 길게 누름 컨텍스트
- **Given** 카드 1개 표시
- **When** 600ms 이상 long press
- **Then** 컨텍스트 메뉴 (시트 또는 popover): "보드 이동 / 색상 변경 / 삭제 / 옵트아웃 토글"

### AC-6 — pull-to-refresh
- **Given** SCR-mobile-feed 상단
- **When** 사용자가 아래로 잡아당김 (100px+)
- **Then** 인사이트 갱신 spinner 표시, [[FEAT-home]]·[[FEAT-ai-pipeline]] 재계산 트리거

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-14, REQ-1
- 등장 화면: SCR-mobile-feed 3 variant 모두, SCR-capture-bar `mobile-sheet`
- 등장 flow: 모바일 진입은 FLOW-capture-revisit 등의 모바일 분기

### 다른 feature
- **의존**: [[FEAT-home]] (시스템 보드 카드), [[FEAT-capture]] (mobile-sheet variant), [[FEAT-boards]] (보드 strip), [[FEAT-storage]], [[FEAT-i18n]]
- **의존받음**: 없음

### 외부 라이브러리
- `react-aria` (touch 제스처)
- 또는 native HTML5 touch event

## 5. 데이터 모델

별도 모델 없음. [[FEAT-storage]]·[[FEAT-home]] 데이터를 모바일 뷰로 렌더링.

```ts
// 모바일 view state
interface MobileFeedState {
  filterTab: "all" | "boards" | "notes" | "images" | "links" | "files" | "ai-suggested";
  scrollY: number;       // 스크롤 위치 저장 (탭 전환 시 복원)
  pullProgress: number;  // pull-to-refresh 진행도
}
```

## 6. 인터페이스

### React 컴포넌트
- `<MobileFeed />` — SCR-mobile-feed의 메인
- `<BoardStrip boards={Board[]} />` — 보드 가로 스크롤
- `<FilterTabs active onChange />` — 필터 탭
- `<NoteCardGrid notes={Note[]} columns={1 | 2} />`
- `<MobileCaptureBar />` — 하단 캡처 바
- `<NoteFullView noteId open onClose />` — 카드 탭 시 전체 보기 모달

### Hooks
- `useViewport()` — 데스크톱/모바일 분기
- `usePullToRefresh(onRefresh)`

### 라우팅
- `app/page.tsx`에서 viewport 감지 → `<MobileFeed />` 또는 `<WorkspacePage />` 분기

## 7. 시각·인터랙션

- PRD 참조: §14 SCR-mobile-feed 3 variant
- 카드 격자: gap 12px, 카드 width = (viewport - 24) / columns
- 보드 strip 썸네일: 60×60px, 둥근 모서리 8px
- 하단 캡처 바: 56px 높이, 흰 배경 + 상단 미세 그림자

## 8. 비기능 요구사항

- **성능**: 첫 컨텐츠 렌더 < 1.5s (LCP). 무한 스크롤 page 30개 단위.
- **터치 친화**: 모든 인터랙티브 요소 최소 44×44px tap target
- **i18n**: 모든 라벨 i18n
- **접근성**: VoiceOver / TalkBack 지원

## 9. 다음 iteration

- **네이티브 앱** (Capacitor 또는 React Native) — PWA 한계 (백그라운드 동기화·푸시) 도달 시 (Phase 3+)
- **카드 자유 배치 모바일 버전** — 두 손가락 핀치로 작은 영역 확대해서 배치 (Phase 2)
- **모바일 손글씨** — Apple Pencil + Samsung S Pen
- **위젯** (iOS/Android) — 홈 화면 위젯에서 quick capture
- **푸시 알림** — 절대 강요 아닌 옵트인 (예: "1주일 만에 모스에 들렀어요" — PRD §9 안티-패턴 주의)

## 10. 검증 방법 (DOD)

- [ ] 3 variant (default / empty / offline) 모두 시각 대조 (PRD §14)
- [ ] iPhone Safari, Android Chrome 둘 다 작동
- [ ] 하단 캡처 바 → 캡처 흐름 2초 이내
- [ ] Pull-to-refresh 작동
- [ ] 카드 길게 누름 컨텍스트 메뉴
- [ ] 반응형 (390px ~ 768px) 모두 정상 — 1열 / 2열 자동 전환
