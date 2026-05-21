# FEAT-i18n · 한국어 단독 v1 + i18n 인프라

> 모든 텍스트는 i18n 키로 관리하되 한국어 메시지만 채워서 v1 출시. 톤 손실 위험을 피하고 향후 영어 추가를 코드 변경 최소화로 가능하게.

**Status**: ✅ complete (2026-05-21) — 검증 통과, AC 모두 충족
**Estimated**: S
**Blueprint**: `features[id="FEAT-i18n"]`

---

## 1. 목표

PRD §30 결정: 한국어 단독 출시. 다만 모든 사용자 노출 텍스트가 코드에 하드코딩되면 추후 영어 추가 시 전역 리팩토링 필요. 처음부터 `t("key")` 함수를 통과시켜 인프라 비용을 미리 지불한다.

## 2. 범위

### 포함
- 메시지 파일 `messages/ko.json` (모든 사용자 노출 텍스트 키-값 매핑)
- `t(key)` / `<Trans>` API (단순 키 기반, 보간 지원)
- React Provider + hook (`useT()`)
- 빌드 타임 검증: 사용 키와 messages 파일 간 누락·잉여 검사 (ESLint 규칙 또는 별도 스크립트)
- 한국어 폰트 로딩 — `Pretendard` 또는 시스템 폰트 fallback
- 한국어 본문 최소 15px 강제 (PRD §19 접근성)
- 날짜·숫자 포맷 한국어 로캘 (`Intl.DateTimeFormat`, `Intl.NumberFormat`)

### 제외 (다른 FEAT 담당)
- 영어 메시지 — Phase 2 (6개월 후 검토)
- RTL 지원 — 한국어 단독이라 불필요
- 동적 언어 전환 UI — Phase 2
- 카피라이팅 자체 — 본 스펙은 인프라만, 실제 메시지는 각 feature가 채움

## 3. 수용 기준

### AC-1 (REQ-18 충족) — 모든 사용자 노출 텍스트가 키 기반
- **Given** moss 코드베이스 전체
- **When** 정적 분석 도구가 JSX 안의 문자열 리터럴 검사
- **Then** 사용자 노출 텍스트 중 `t()`/`<Trans>` 미통과인 것 0건 (예외: aria-label, alt 등 접근성 텍스트는 추후 별도 규칙)

### AC-2 — 한국어 본문 최소 15px
- **Given** 모든 본문 UI
- **When** 브라우저에서 `font-size` 계산
- **Then** 본문(설명·메모 본체·카드 텍스트)이 최소 15px (`text-base` 토큰 = 0.9375rem)

### AC-3 — Pretendard 폰트 로딩
- **Given** moss 첫 진입
- **When** 폰트가 캐시 안 됨
- **Then** Pretendard 가변 폰트가 1초 이내 로드, FOIT 없이 폰트 swap (`font-display: swap`). 미로드 시 시스템 한국어 폰트 fallback.

### AC-4 — 빌드 검증
- **Given** `t("key.that.does.not.exist")` 호출
- **When** `npm run build` 또는 dev 검증
- **Then** 빌드 에러 또는 dev 경고 (콘솔 + 빨간 표식). 출시 빌드에선 fallback으로 키 그대로 표시 (앱 정지는 안 함).

## 4. 의존성

### 블루프린트 참조
- requirements: REQ-18
- 등장 화면: 전체 (모든 UI 텍스트가 본 feature 통과)
- 등장 flow: FLOW-onboarding (한국어 카피로 시작), 사실상 전체

### 다른 feature
- **의존**: 없음
- **의존받음**: 전체 (모든 사용자 노출 텍스트)

### 외부 라이브러리
- `next-intl` 또는 `react-intl` (PRD §30-2) — 평가 후 결정. Next.js App Router 호환성 우선.
- `Pretendard` 폰트 (CDN 또는 self-host)

## 5. 데이터 모델

```ts
// messages/ko.json (구조 예시)
{
  "common": {
    "save": "저장",
    "cancel": "취소",
    "close": "닫기",
    "delete": "삭제"
  },
  "workspace": {
    "boardPicker": {
      "system": "머무는 생각",
      "newBoard": "+ 새 보드"
    },
    "empty": {
      "prompt": "도구를 끌어다 놓아보세요"
    }
  },
  "capture": {
    "placeholder": "지금은 그냥 남겨두셔도 좋아요..."
  },
  "signals": {
    "dataEmpty": "조금 더 머무르면 패턴이 보일 거예요"
  },
  "onboarding": {
    "hero": "생각은, 머무는 동안 형태가 된다."
  }
  // ... 각 feature가 자기 namespace 채움
}
```

키 네이밍 규칙:
- 콜론 또는 점으로 namespace 구분: `workspace.empty.prompt`
- camelCase
- 너무 깊지 않게 (3단계 이내)

## 6. 인터페이스

### React API
```ts
// 컴포넌트에서
const t = useT();
t("workspace.empty.prompt"); // → "도구를 끌어다 놓아보세요"

// 보간
t("capture.savedAt", { time: "방금" }); // → "방금 저장됨"

// JSX with markup
<Trans i18nKey="onboarding.trustNote">
  로그인 없이 시작 · 데이터는 이 기기에만 저장됩니다
</Trans>
```

### Provider
- `<I18nProvider locale="ko">{children}</I18nProvider>` — App Router root layout 또는 Providers 안

### 빌드 검증
- `scripts/check-i18n.ts`: 소스 트리에서 `t(key)` 패턴 추출 → messages/ko.json과 대조

## 7. 시각·인터랙션

- PRD 참조: §30 (i18n), §19 (한국어 폰트 가독성)
- 본문 폰트 스택 (CSS variable `--font-sans`):
  ```
  Pretendard, "Apple SD Gothic Neo", system-ui, -apple-system, sans-serif
  ```
- 카피 톤 — 카피라이팅은 각 feature가 PRD §8 (조용한 지능감, 미완성 허용) 톤을 따름. 본 스펙은 그 규칙만.

## 8. 비기능 요구사항

- **성능**: messages 번들 크기 < 20KB (ko 단독). 동적 import는 v1 불필요.
- **접근성**: 본문 최소 15px (한국어), 줄간격 1.6 (`leading-relaxed`)
- **이주성**: 영어 추가 시 `messages/en.json` 한 파일 + `locale` prop만 추가하면 작동하도록 설계

## 9. 다음 iteration

- 영어·일본어 메시지 (Phase 2, 출시 후 6개월)
- 사용자 언어 자동 감지 (브라우저 `navigator.language`)
- 동적 메시지 핫리로드 (개발 편의)
- 폰트 서브셋팅 자동화 (한글 빈도 기반)

## 10. 검증 방법 (DOD)

- [ ] `messages/ko.json` 모든 키 사용 검증 + 미사용 키 0
- [ ] 소스 트리 `t()` 호출의 키가 모두 messages에 존재
- [ ] 본문 폰트 크기 측정 — 본문 텍스트 모두 ≥ 15px
- [ ] Pretendard 폰트 로드 시간 < 1초 (slow 3G에서도 swap 동작)
- [ ] e2e: 모든 화면 스크린샷 시 한국어로 표시 (영어 잔존 0)
