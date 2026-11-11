# Moss 모바일 AS-IS / TO-BE

편집 진입·완료 버튼을 보이게 하고, 상세의 읽기와 편집을 나눠 모바일에서 조작 의도를 드러내는 제안이다.

## 이후 구현 상태

사용자의 “진행시켜” 승인 이후 로컬 제품 코드에 제안을 구현하고 연결된 Android에서 검증했다. 아래 시안은 제안 당시의 기록으로 보존한다. [구현·검증 보고서](../../../docs/research/2026-11-11-mobile-ux-implementation.md)와 [실제 캡처](verification/45-final-controls.png)를 별도로 저장했다. 운영에는 아직 반영하지 않았다.

## 요청과 상태

- 요청 원문: `$donghwan-agent-env:asis-tobe`
- 앞선 문제 제기: “터치했을때 수정하는것도 있고 꾹 눌러서 이동하는것도 있고”, “텍스트 수정때문에 키보드가 올라오는데 … ui 겹쳐지면서”, “상세 들어갔을때도 … 생각대로 안되는 느낌”.
- 유형: 화면 + 흐름 / 빌드 전 제안.
- AS-IS는 운영 사이트를 실제 Android에서 사용한 캡처다. TO-BE는 같은 캡처 위에 변경 영역을 HTML로 구성한 **미구현 제안**이다. 제품 코드와 서버 설정은 수정하지 않았다.
- 최종 장면 PNG는 3680×2480px이며, 왼쪽 현재 / 오른쪽 제안이다. 전후의 기기 크기와 확대 비율을 맞췄다.

## 장면

| 장면 | 이미지 | 번호 | 제안 |
|---|---|---|---|
| A. 기존 할 일 편집 | [png/a.png](png/a.png) | 1–2 | 선택한 카드에 편집·이동 버튼을 표시하고, 축소해도 터치 영역을 화면 기준 44px로 유지한다. |
| B. 새 메모 입력 | [png/b.png](png/b.png) | 3–4 | 키보드 위 전용 편집 영역에서 제목과 본문을 쓰고, 고정된 완료 버튼으로 보드에 복귀한다. |
| C. 상세 읽기·복귀 | [png/c.png](png/c.png) | 5–6 | 기존 메모는 키보드 없이 읽기부터 시작하고, 뒤로가기로 상세를 닫아 보드에 복귀한다. |

- 모아 보기: [asis.png](asis.png), [tobe.png](tobe.png).
- 장면별 원본: [board/a.html](board/a.html), [board/b.html](board/b.html), [board/c.html](board/c.html).
- 작은 화면에서 전후를 세로로 이어 보는 보조 페이지: [board/index.html](board/index.html). 장면 제목을 누르면 펼쳐진다.
- 렌더 입력: [asis.json](asis.json), [tobe.json](tobe.json). 좌표 확인용 `asis.grid.png`, `tobe.grid.png`도 보관한다.

## 출처와 비교 조건

- 캡처: 2026-11-11 17:51–17:53 KST. Samsung SM-N986N, Android 13, Chrome 157.0.8103.48, 삼성 키보드, 세로 화면 1440×3088, DPR 3.5.
- 운영 주소: `https://moss.dongpark.dev`.
- 보드: `/b/ea411894-4ad6-4a7c-9225-7b195b49587a`. 로그인 뒤 기기에 있던 보드에서 확인했으며, 서버 업로드 선택은 건너뛰었다.
- 코드 대조 기준: 로컬 HEAD `e351374604cf06c818d9dd0328e2c9a69ad9f169`. 이는 운영 배포 커밋을 확인했다는 뜻이 아니다. 운영의 정확한 배포 SHA는 이 비교에서 미확인이다.
- 관찰·DOM 측정·관련 코드: [Android 사용성 조사](../../../docs/research/2026-11-11-android-usability.md).
- 원본 근거 디렉터리: `/Users/donghwan/.goat/desktop/userdata/artifacts/moss-mobile-20261111/`.
- A: `/tmp/moss-android-audit/05-todo-keyboard.png`를 `screens/a-asis.png`로 보존했다. 원본 파일명과 달리 키보드가 열리지 않은 할 일 선택 장면이다.
- B: `06-new-memo.png` → `screens/b-asis.png`. TO-BE도 같은 키보드와 같은 화면 높이를 사용한다. 점선 4번은 키보드 뒤에 가려진 캔버스 도구의 위치를 설명한다.
- C: `09-long-body.png` → `screens/c-asis.png`. 키보드 없는 배경은 `11-keyboard-hidden.png` → `screens/c-background.png`. 같은 QA 메모의 8개 문단을 사용한다. AS-IS는 입력 끝의 스크롤 위치, TO-BE는 읽기 진입 시 상단 위치이므로 같은 스크롤 위치의 면적 비교는 아니다.
- `QA-mobile-20261111`과 8개 영문 문단은 이 조사에서 만든 테스트 메모다. 시안의 새 메모 안내 문구는 예시다. 인증 토큰이나 세션 파일을 복사하지 않았다.

## 구현 전에 정할 것

1. 카드 탭은 선택으로 유지하고 편집 버튼을 보일지: 이 시안은 선택을 유지한다. 바로 상세를 여는 방식은 선택·다중 선택과의 관계를 별도로 정해야 한다.
2. 새 메모는 전용 편집 화면에서 작성할지: 제목·본문·완료를 한 화면에 둘 수 있지만 작성 중 캔버스의 공간적 맥락은 덜 보인다.
3. 기존 메모는 읽기부터 시작할지: 자동 키보드로 인한 방해를 줄이는 대신 수정하려면 편집 버튼을 한 번 더 눌러야 한다.

이 선택은 제안이며 확정된 제품 정책이 아니다. 이동 버튼을 누른 뒤의 세부 제스처, 길게 누르기 유지 여부와 다중 선택은 아직 설계하지 않았다. 본문·손글씨 좌표 보존은 구현 시 지켜야 할 조건이며, 이 시안으로 검증한 결과가 아니다.

## 검수와 한계

- 최종 장면 PNG를 열어 번호 1–6의 대상, 글자 넘침, 이미지 잘림을 확인했다. B의 3번과 C의 5번 표시가 잘리던 문제를 수정해 다시 렌더했다.
- 보조 HTML을 GOAT에서 728px와 390px로 미리 보기 했다. 두 너비 모두 이미지 6개가 로드되었고 가로 넘침이 없었다. 모바일에서는 같은 장면의 전후가 이어진다.
- 검수 범위는 **시안의 렌더 결과**다. TO-BE의 터치·완료·뒤로가기 동작과 개선 효과는 UNVERIFIED다.
- NOT RUN: TO-BE 실제 기기 동작, iOS Safari, 가로 회전, 핀치, 한글 IME 조합, 접근성, 기기 간 동기화, 제품 자동 테스트/build/CI. 제품 코드 변경은 없다.

## 다시 생성하기

`board/build.py`는 세 장면의 HTML과 JSON 입력을 생성한다. 폰 시안은 `board/{a,b,c}-to-screen.html`을 411×882로, 최종 보드는 `board/{a,b,c}.html`을 1840×1240으로 `~/agent-env/skills/asis-tobe/scripts/mock/shot.sh`에 넘긴다. 출력은 각각 `screens/*-tobe.png`, `png/*.png`다.

`python3 board/render-sheets.py`는 스킬 렌더러를 재사용해 `asis.png`, `tobe.png`를 만든다. 작은 화면에서 번호가 잘리지 않도록 표시 스타일만 보정한다. `shot.sh`가 복사하는 폰트 파일은 재생성할 때 제공된다.
