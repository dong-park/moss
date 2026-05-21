# FEAT-xxx · 제목

> 한 줄 요약 — 이 feature가 사용자에게 어떤 가치를 주는가.

**Status**: spec 작성 / 구현 중 / 완료
**Owner**: (구현자 이름)
**Estimated**: S / M / L
**Blueprint**: `docs/moss.blueprint.json#features[id="FEAT-xxx"]`

---

## 1. 목표 (Job Statement)

"누가 / 어떤 상황에서 / 무엇을 / 왜 하고 싶은가" 형식. 1-3 문장.

## 2. 범위

### 포함 (in-scope)
- 구체 동작 1
- 구체 동작 2

### 제외 (out-of-scope, 다른 FEAT가 담당)
- 항목 — [[FEAT-yyy]]가 담당

## 3. 수용 기준 (Acceptance Criteria)

블루프린트 `requirements[]`와 1:1 매핑. GWT 형식.

### AC-1 (REQ-N 충족)
- **Given** 초기 상태
- **When** 사용자 액션 / 시스템 트리거
- **Then** 검증 가능한 결과

### AC-2 (REQ-M 충족)
- ...

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-N, REQ-M
- 등장 화면: SCR-xxx (variants: ...)
- 등장 flow: FLOW-xxx (step N: 본 feature 역할)

### 다른 feature
- **의존**: FEAT-yyy — 어떤 인터페이스로 / 왜
- **의존받음**: FEAT-zzz — 이쪽이 제공하는 것

### 외부 라이브러리·API
- 추가 의존: (해당 시)

## 5. 데이터 모델

해당 시. TypeScript interface 또는 JSON Schema.

```ts
interface ExampleEntity {
  id: string;
  // ...
}
```

## 6. 인터페이스

### Store (Zustand) actions
- `actionName(args): ReturnType` — 동작 설명

### React 컴포넌트 props
- `<ComponentName prop={type} />`

### 외부 API endpoints (해당 시)
- `POST /api/...` — 요청·응답

## 7. 시각·인터랙션

- PRD 참조: §N-X
- 와이어프레임: `docs/moss.blueprint.json#screens[id="SCR-xxx"].variants[id="..."]`

핵심 인터랙션 요약 (2-5줄). 풀 디테일은 PRD 본문 참조.

## 8. 비기능 요구사항

- **성능**: 측정 가능한 임계값 (예: 입력 → 화면 반영 < 50ms)
- **접근성**: 키보드 도달, ARIA, 색약
- **프라이버시**: 데이터 흐름의 경계
- **i18n**: 한국어 단독 v1, 텍스트는 i18n 키로

## 9. 다음 iteration (의도적 보류)

- 항목 1 — 사유
- 항목 2 — 사유

## 10. 검증 방법 (DOD)

- [ ] 자동 테스트 통과 (단위 / 통합)
- [ ] 수동 시나리오: ...
- [ ] PRD §N 와이어프레임 시각 대조
- [ ] 메트릭 측정 가능 (성공 지표 §36 매핑)
