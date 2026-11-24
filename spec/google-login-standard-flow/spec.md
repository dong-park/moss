# Google 로그인을 일반 Google OAuth 사이트 절차로 바꾼다

| 항목 | 값 |
|---|---|
| 문제 | Google로 로그인하려면 버튼을 두 번 누르고, 신규 계정은 계정을 고른 뒤 다시 눌러야 하며, 약관 버전이 비면 같은 거절이 끝없이 반복돼 사용자가 로그인에 실패한다 |
| 상위 | 없음 |
| 상위문제 | 없음 |
| 상태 | 끝남 |
| 시작 | 2026-11-08 |

## 문제 — 버튼을 두 번 눌러야 하고, 신규 계정은 가입하다 막힌다

우리 버튼을 누르면 화면 위쪽에 Google 버튼이 든 상자가 따로 뜬다. 그 버튼을 한 번 더 눌러야 계정 선택 창이 뜬다. 2026-11-08 로컬에서 신규 계정 로그인 7번이 모두 같은 거절로 실패했다.

## 목표 — 버튼 1번에 계정 선택 창이 뜨고, 고르면 로그인이 끝난다

Google 버튼을 1번 누르면 계정 선택 창이 바로 뜬다. 기존 계정은 고르면 로그인이 끝난다. 신규 계정은 같은 카드에서 약관에 동의하고 1번 더 누르면 가입이 끝난다.

## 비목표 — 서버 계약과 메일 흐름의 경계까지만 다룬다

- 서버 API는 바꾸지 않는다. 지금 `POST /auth/google` 계약을 그대로 쓴다.
- 메일 로그인·가입 폼과의 경계까지만 다룬다. 메일 폼과 메일 요청은 그대로다. 메일 요청에는 제한 시간을 넣지 않는다.
- One Tap과 재방문 자동 로그인은 넣지 않는다.
- Google 버튼을 시안의 검은 버튼과 똑같이 맞추지 않는다. 똑같이 맞추려면 D1의 b나 d를 골라야 한다.
- 운영 배포는 하지 않는다. 로컬 확인까지다.

## 성공 기준 — 행 24개가 기준이다

행 파일이 곧 성공 기준이다.

## 경계 조건 — Google 칸은 한 페이지에 하나, 요청은 카드에 하나씩 나가고 Google 요청은 15초 안에 끝난다

- Google 칸은 세 화면에 들어간다. 온보딩 카드, 초대 링크 화면의 온보딩 카드, 다시 로그인해 주세요 카드다.
- 한 페이지에는 Google 칸이 동시에 하나만 그려진다. 온보딩은 로그인 전에만, 다시 로그인 카드는 세션이 만료됐을 때만 뜬다. 초대 링크는 다른 페이지다.
- 공유 팝오버의 로그인 안 된 분기는 세션이 만료됐을 때만 열린다. 그때는 다시 로그인 카드가 화면 전체를 덮어 팝오버를 누를 수 없다.
- 버튼 너비는 놓인 칸을 재서 넘긴다. 지금 칸은 온보딩 300px, 다시 로그인 카드 252px이다. Google 버튼 너비 상한은 400px이다.
- Google ID 토큰은 1시간 산다. 가입 마무리 단계에 1시간 넘게 머물면 서버가 거절한다.
- 계정 선택 창을 닫으면 Google은 아무 신호도 주지 않는다. 그래서 버튼을 누를 때는 바쁨 상태를 켜지 않는다.
- 메일과 Google은 로그인 카드 안에서 요청 잠금 하나를 같이 쓴다. 카드의 서버 요청은 한 번에 1개만 나간다. 잠금 중에는 카드의 버튼과 링크 5개가 다 눌리지 않는다. 잠금 중에 온 Google 토큰은 버린다.
- 가입 마무리, 가입 보내는 중, 가입 닫힘, 약관 어긋남 동안 메일 링크와 메일 폼은 숨긴다. 다른 계정으로를 누르면 다시 보인다.
- Google 로그인 요청은 15초가 지나면 끊는다. 끊긴 요청이 서버에서 끝났어도 다시 보내면 기존 계정으로 로그인된다.
- 오프라인은 상태가 아니라 모든 상태 위에 씌우는 덮개다. 어느 길로 버튼 단계에 와도 오프라인이면 Google 버튼이 눌리지 않는다.
- 오프라인 표시가 불러오기 실패 표시보다 먼저다. 연결이 돌아오면 새로고침 없이 스크립트를 다시 받는다.
- 가입 마무리에서 오프라인이 되면 동의하고 시작하기만 눌리지 않는다. 단계와 토큰은 그대로다.
- 서버는 약관 버전을 실행 때 읽고, 웹은 빌드 때 박는다. **약관 버전을 바꾸면 웹도 다시 빌드한다.** 서버만 다시 띄우면 새로고침해도 같은 거절이 돌아온다.
- 웹 약관 버전이 빈 값이면 웹은 신규 가입을 닫힌 것으로 본다.
- 웹 클라이언트 ID가 없으면 Google 스크립트를 받지 않는다. Google 버튼 대신 문구를 보이고 메일 길은 남긴다.

## 실패 모드 — 18개 중 15개를 막고 3개는 받아들인다

| 실패 | 사용자가 보는 것 | 막는 법 | 행 |
|---|---|---|---|
| 칸을 지웠다 다시 그려 Google 설정이 여러 번 된다 | 로그아웃 뒤 다시 로그인하면 골라도 아무 일이 없다 | 설정은 페이지에 1번 한다. 토큰은 지금 그려진 칸으로 보낸다 | T2 |
| Google 창이 열린 동안 칸이 사라진다 | 메일 로그인이 끝났는데 늦은 Google 토큰이 한 번 더 요청한다 | 칸이 없을 때 온 토큰은 버린다 | T22 |
| 웹 약관 버전이 비어 동의 없이 다시 보낸다 | 같은 거절이 끝없이 되풀이된다 | 신규 계정이면 가입이 닫혔다고 알리고 멈춘다 | T8 |
| 웹과 서버 약관 버전이 다르다 | 동의해도 계속 거절된다 | 약관 어긋남 단계로 보낸다. 새로고침 안내 한 문구만 보이고 동의 버튼을 숨긴다 | T8, T9 |
| 들고 있던 토큰이 만료됐다 | 동의를 눌러도 가입이 안 된다 | 처음 단계로 돌려 Google로 다시 고르게 한다 | T10 |
| 서버가 답하지 않는다 | 버튼이 가려진 채 끝없이 기다린다 | Google 로그인 요청을 15초에 끊고 문구를 보인다. 버튼이나 가입 마무리로 돌아간다 | T11, T19 |
| 계정 선택 창을 닫았다 | 버튼이 바쁨 상태에 갇힌다 | 누를 때 바쁨을 켜지 않는다. 토큰이 온 뒤에만 켠다 | T12 |
| 온라인인데 Google 스크립트를 못 받는다 | 버튼 자리가 빈다 | 문구와 다시 시도 버튼을 보인다. 메일 길은 남긴다 | T13 |
| 오프라인으로 첫 화면을 연다 | 실패 문구와 오프라인 표시가 겹친다. 연결이 돌아와도 버튼이 안 돌아온다 | 오프라인 표시를 먼저 보인다. 연결이 돌아오면 스크립트를 다시 받는다 | T14, T20 |
| 웹 클라이언트 ID가 없다 | 버튼을 눌러도 아무 일이 없다 | 버튼 대신 문구를 보이고 스크립트를 받지 않는다 | T18 |
| 요청 중에 토큰이 1번 더 온다 | 로그인이 2번 시작된다 | 요청 중에는 버튼을 가리고 늦게 온 토큰을 버린다 | T21 |
| 동의하고 시작하기를 두 번 누른다 | 가입 요청이 2번 나간다 | 요청 잠금이 카드의 버튼과 링크 5개를 다 막는다 | T26 |
| 이미 오프라인인 채로 버튼 단계에 돌아온다 | 오프라인에서 Google 창이 열리고 고른 계정이 실패한다 | 오프라인을 모든 상태 위의 덮개로 둔다 | T23, T24 |
| 메일 요청 중에 Google 토큰이 온다 | 두 요청이 같이 나가 나중에 끝난 계정의 세션이 남는다 | 메일과 Google이 요청 잠금 하나를 같이 쓴다 | T21, T25 |
| 닿을 수 없는 공유 팝오버 분기에 Google 칸을 남긴다 | 사용자는 못 본다. 칸이 둘이 되어 토큰 전달 규칙이 늘어난다 | 그 분기의 Google 버튼을 지운다. D3 추천대로다 | T15 |
| 약관 버전을 서버만 바꾸고 웹을 다시 빌드하지 않는다 | 새로고침해도 같은 거절이 돌아온다 | 코드로는 받아들인다. 운영 규칙으로 막는다. 약관 버전을 바꾸면 웹도 다시 빌드한다 | 없음 |
| 페이지 주소가 Google 출처 목록에 없다 | 버튼이 안 뜨거나 Google 오류 창이 뜬다 | 받아들인다. 코드가 아니라 Google 콘솔 설정이다 | 없음 |
| 메일 요청이 답하지 않는다 | Google 버튼도 끝없이 가려진다 | 받아들인다. 메일 요청에 제한 시간이 없던 원래 문제이고 메일은 비목표다. 새로고침하면 풀린다 | 없음 |

## 상태 모델 — Google 칸은 10상태에 덮개 2개를 씌우고, 토큰은 확인 중부터 가입 보내는 중까지 들고 간다

토큰은 확인 중에 받는다. 가입 마무리와 가입 보내는 중까지 들고 간다. 이 세 상태 밖으로 나가면 버린다.

덮개 2개는 어느 상태 위에나 씌운다. 덮개는 상태를 바꾸지 않고 그 위의 버튼만 막는다.

- **오프라인 덮개** — 연결이 끊기면 씌우고 돌아오면 벗긴다. 씌운 동안 Google 버튼, 다시 시도, 동의하고 시작하기, 메일 제출이 눌리지 않는다. Google 칸의 문구는 오프라인 안내 하나다. 벗길 때 스크립트가 없으면 다시 받는다.
- **요청 잠금** — 메일이나 Google 요청이 나가 있으면 씌운다. 씌운 동안 카드의 버튼과 링크 5개가 눌리지 않는다. Google 버튼, 다시 시도, 동의하고 시작하기, 다른 계정으로, 메일 제출이다. 그동안 온 토큰은 버린다. 그래서 가입 보내는 중에는 다른 계정으로를 누를 수 없고, 그 전이는 표에 없다.

화면마다 문구는 하나다. 가입 닫힘은 "지금은 새 계정을 받을 수 없어요"다. 약관 어긋남은 "약관이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요"다.

| 지금 | 일어난 일 | 다음 |
|---|---|---|
| 처음 | 클라이언트 ID가 없다 | 쓸 수 없음 |
| 처음 | 클라이언트 ID가 있다 | 불러오는 중. 오프라인이면 연결이 돌아올 때까지 받기를 미룬다 |
| 불러오는 중 | 스크립트를 받았다 | 버튼 |
| 불러오는 중 | 온라인인데 스크립트를 못 받았다 | 불러오기 실패 |
| 불러오는 중 | 오프라인이 되어 스크립트를 못 받았다 | 불러오는 중에 머문다 |
| 불러오는 중, 불러오기 실패 | 연결이 돌아왔고 스크립트가 없다 | 불러오는 중. 스크립트를 다시 받는다 |
| 불러오기 실패 | 다시 시도를 눌렀다 | 불러오는 중 |
| 버튼 | 덮개가 없을 때 Google이 토큰을 줬다 | 확인 중 |
| 버튼 | 덮개가 있을 때 토큰이 왔다 | 버튼. 토큰은 버린다 |
| 확인 중, 가입 보내는 중 | 토큰이 1번 더 왔다 | 그대로. 새 토큰은 버린다 |
| 확인 중 | 서버가 200을 줬다 | 로그인됨 |
| 확인 중 | 동의가 필요하고 웹 약관 버전이 있다 | 가입 마무리 |
| 확인 중 | 동의가 필요하고 웹 약관 버전이 비었다 | 가입 닫힘 |
| 확인 중 | 서버가 503을 줬다 | 가입 닫힘 |
| 확인 중 | 401, 서버에 못 닿음, 15초 초과, 그 밖 오류 | 버튼과 오류 문구 |
| 가입 마무리 | 체크하고 동의하고 시작하기를 눌렀다 | 가입 보내는 중 |
| 가입 마무리 | 다른 계정으로를 눌렀다 | 버튼 |
| 가입 보내는 중 | 서버가 200을 줬다 | 로그인됨 |
| 가입 보내는 중 | 다시 동의가 필요하다고 했다 | 약관 어긋남 |
| 가입 보내는 중 | 서버가 503을 줬다 | 가입 닫힘 |
| 가입 보내는 중 | 서버가 401을 줬다 | 버튼과 만료 문구 |
| 가입 보내는 중 | 서버에 못 닿음, 15초 초과, 그 밖 오류 | 가입 마무리와 오류 문구 |
| 가입 닫힘, 약관 어긋남 | 다른 계정으로를 눌렀다 | 버튼 |

불가능한 조합은 11개다.

- 확인 중, 가입 마무리, 가입 보내는 중이 아닌데 토큰을 들고 있다.
- 웹 약관 버전이 비었는데 약관 체크가 보인다.
- 체크가 꺼져 있는데 동의 요청이 나간다.
- Google 요청이 동시에 2개 나가 있다.
- 메일 요청과 Google 요청이 동시에 나가 있다.
- 요청 잠금 중에 동의하고 시작하기나 다른 계정으로가 눌린다.
- 확인 중이나 가입 보내는 중에 15초 넘게 머문다.
- 가입 닫힘이나 약관 어긋남인데 동의 버튼이 보인다.
- 가입 닫힘 문구와 약관 바뀜 문구가 한 화면에 같이 보인다.
- 오프라인인데 Google 버튼이 눌린다.
- 오프라인인데 불러오지 못했어요 문구가 보인다.

## 기술 결정 — Google 공식 버튼을 직접 그리고, 서버는 그대로 둔다

- **Google 공식 버튼을 카드 안에 그린다.** D1 추천대로다. 클릭 1번에 계정 선택 팝업이 뜨고 ID 토큰이 콜백으로 온다.
- 버튼은 검은 테마, 큰 크기, 사각형, "계속하기" 글자로 그린다. 시안의 검은 버튼에 가장 가깝다.
- 한국어는 두 곳에 준다. 스크립트 주소에 `hl=ko`를 붙이고, 버튼 설정에 locale ko를 준다. Google 문서가 둘 다 쓰라고 한다.
- 버튼 너비는 놓인 칸을 재서 넘긴다. 같은 부품이 300px 칸과 252px 칸에 들어간다.
- 팝업 방식을 쓴다. 페이지가 새로 뜨지 않아 가입 마무리 단계를 이어 갈 수 있다.
- Google 설정은 페이지에 1번 한다. Google이 여러 번 설정하지 말라고 한다. 콜백은 지금 그려진 칸 하나로 보낸다. 칸이 없으면 토큰을 버린다.
- 버튼마다 구분 값을 붙이지 않는다. 한 페이지에 칸이 하나뿐이다.
- **토큰은 확인 중부터 가입 보내는 중까지 Google 칸이 들고 있다.** 그 밖으로 나가면 버린다. 그래서 서버에 못 닿았을 때 Google 창 없이 다시 보낼 수 있다.
- **Google 로그인 요청에 15초 제한을 둔다.** 지금 요청 함수에는 제한도 취소 신호도 없다. 응답이 없으면 끝나지 않는다. 15초는 리뷰 추천값이다.
- **메일과 Google은 요청 잠금 하나를 같이 쓴다.** 두 계정의 요청이 같이 나가면 나중에 끝난 쪽 세션이 남는다. 지금 코드도 바쁨 값 하나로 둘을 같이 막는다. 잠금은 카드의 버튼과 링크 5개를 다 막는다. 그래서 두 번 누르기와 보내는 중의 단계 이동이 따로 규칙 없이 막힌다.
- **오프라인은 상태가 아니라 덮개로 둔다.** 버튼으로 가는 전이마다 연결을 볼 필요가 없다. 하나를 빠뜨려도 오프라인에서 버튼이 눌리지 않는다.
- 약관 어긋남은 가입 닫힘과 다른 상태로 둔다. 원인이 달라 사용자가 할 일도 다르다. 한 화면에 한 문구만 뜬다.
- 가입 마무리에는 토큰 안의 메일 주소를 보인다. 사용자가 어느 계정으로 가입하는지 안다. 표시용이라 서명은 안 본다. 검증은 서버가 한다.
- 스토어의 Google 로그인은 토큰을 인자로 받는다. Google이 토큰을 콜백으로 주기 때문이다.
- 온보딩, 초대 링크, 다시 로그인 카드는 지금처럼 같은 로그인 부품을 쓴다. 규칙이 한 곳에 있다.
- 공유 팝오버의 Google 버튼은 지운다. D3 추천대로다. 그 분기는 다시 로그인 카드에 덮여 사용자가 닿지 못한다.
- 서버는 바꾸지 않는다. 지금 계약이 동의 없는 요청과 동의 있는 요청을 다 받는다.

## 버린 대안 — 우리 버튼을 지키는 방식 4개, 전역 토큰 보관, 팝오버 칸, 따로 잠그기와 오프라인 상태를 버렸다

- **Google 인증 코드 팝업** — 우리 검은 버튼을 지킨다. 서버에 비밀키와 코드 교환 주소가 새로 필요하다. D1의 b다.
- **ID 토큰 직접 받기 팝업** — 우리 버튼으로 Google 인가 주소를 열어 ID 토큰만 받는다. 서버는 안 바뀐다. 웹에 돌아올 페이지와 nonce 검사, 팝업 통신을 우리가 짜야 한다. Google은 이 방식보다 GIS를 권한다. D1의 d다.
- **전체 페이지 리다이렉트** — 서버 콜백과 state 검사가 새로 필요하다. 페이지가 새로 떠 보드 화면을 잃는다. D1의 c다.
- **숨긴 Google 버튼을 코드로 누르기** — Google 버튼은 다른 출처의 iframe이라 코드로 누를 수 없다.
- **One Tap과 버튼을 같이 띄우기** — 지금 방식이다. 창이 두 번 뜨고, 한 번 닫으면 쿨다운 동안 One Tap이 안 뜬다.
- **토큰을 스토어 전역에 10분 보관** — 커밋 안 된 임시 수정이다. 화면을 떠나도 토큰이 남는다. 10분은 근거 없는 숫자다.
- **처음부터 약관 버전을 늘 보내기** — 누르는 순간 동의로 보는 것과 같다. 운영자가 정한 명시 동의를 바꾼다. D2의 b다.
- **공유 팝오버에도 같은 Google 칸 두기** — 사용자가 닿지 못하는 분기다. 칸이 둘이 되어 버튼마다 구분 값으로 토큰을 나눠야 한다. D3의 b다.
- **메일과 Google을 따로 잠그기** — 답 없는 메일 요청이 Google을 막지 않는다. 대신 두 요청이 같이 나가 나중에 끝난 계정의 세션이 남는다.
- **메일 요청에도 15초 제한** — 메일은 비목표다. 답 없는 메일이 Google을 막는 문제는 원래 있던 것이라 이번에 키우지 않는다.
- **오프라인을 상태 하나로 두기** — 1바퀴 방식이다. 버튼으로 가는 전이 3개가 연결 상태를 건너뛰어 오프라인에서 버튼이 눌렸다.

## 롤백 지점 — 서버와 DB가 안 바뀌어 커밋을 되돌리면 끝난다

- Google 연결과 스토어 변경은 그 커밋을 되돌린다. 서버 계약이 같아 이전 화면이 그대로 돈다.
- 화면 변경과 공유 팝오버 분기 삭제는 그 커밋을 되돌린다. 번역 키도 같이 돌아간다.
- 새 흐름이 남긴 동의 기록은 이전과 같은 형식이다. 되돌려도 기록을 고칠 일이 없다.
- 되돌릴 수 없게 되는 지점은 없다.

## 확인 안 된 것 — 실제 Google 창 동작은 사용자 브라우저 확인이 남는다

- 실제 Google 팝업은 단위 테스트로 증명되지 않는다. 사용자가 실계정으로 브라우저에서 확인한다. T1, T12가 여기에 걸린다.
- Chrome이 버튼 흐름을 브라우저 내장 창으로 바꿨는지 확인 안 됨. 바뀌면 창 모양이 다르다.
- 한국어로 그린 버튼 글자가 무엇인지 확인 안 됨.
- 15초가 느린 모바일 연결의 정상 응답을 끊지 않는지 확인 안 됨.
- docker 웹 3001번 주소가 Google 출처 목록에 있는지 확인 안 됨.

## Plan: Google 로그인을 일반 Google OAuth 사이트 절차로 바꾼다

## 사람용 요약

**한 줄로**: 로그인 카드 안에 Google이 만든 진짜 버튼을 달아, 한 번 누르면 계정 선택 창이 뜨고 처음 온 사람은 같은 카드에서 동의 한 번으로 가입을 끝낸다.

1. **닿지 않는 공유 팝오버 로그인 걷어 내기** — 사용자가 누를 수 없던 공유 팝오버의 Google 버튼을 지운다. 로그인 길이 카드 하나로 줄어 뒤 단계가 단순해진다.
2. **서버가 답하지 않으면 15초에 끊기** — Google 로그인 요청이 끝없이 기다리지 않게 한다. "버튼이 가려진 채 안 돌아온다"가 여기서 풀린다.
3. **Google과 잇는 길 바꾸기** — 화면 위에 따로 뜨던 상자와 One Tap을 없애고, Google 버튼을 원하는 자리에 그리는 길을 만든다.
4. **로그인 카드에 Google 버튼 달기** ← 본체 — "버튼을 두 번 눌러야 한다"가 여기서 풀린다. 기존 계정은 한 번 고르면 로그인된다. 오프라인·요청 중에는 버튼이 가려진다.
5. **처음 온 계정의 가입 마무리** ← 본체 — "체크하고 다시 눌러도 같은 거절이 반복된다"가 여기서 풀린다. 계정을 고른 뒤 카드에서 동의 한 번으로 가입이 끝나고 Google 창은 다시 열리지 않는다.

진행: 1 → 2 → 3 → 4 → 5. 한 작업자가 순서대로 한다. 단계마다 커밋하고 테스트가 통과해야 다음으로 간다. 실제 Google 창은 마지막에 사용자가 실계정으로 확인한다.

---

<!-- STEP:0:share-popover-google-removal:completed -->
### T-0: 공유 팝오버의 Google 로그인 분기를 지운다 (행 T15)

#### 읽을 파일
- `web/src/components/share/ShareControl.tsx` — 105행 `handleGoogle`, 59행 `authenticated`
- `web/src/components/share/SharePopover.tsx` — 120행 `GoogleButton`, `onGoogle` prop
- `web/src/components/share/__tests__/ShareControl.test.tsx` — Google 관련 테스트 2개, `googleIdToken` 주입 9곳

#### 작업
- `ShareControl`의 `handleGoogle`과 `SharePopover`의 `onGoogle` prop·Google 버튼을 지운다.
- 로그인 안 된 분기는 공유 시작 버튼을 비활성으로 그린다.
- 테스트에서 Google 로그인 테스트를 "팝오버에 Google 버튼이 없다"로 바꾼다. 남는 `googleIdToken` 주입은 이 단계에서 지우지 않아도 된다. 스토어 서명은 T-3에서 바뀐다.

#### AC
```bash
cd /Users/dongpark/moss/web && bunx vitest run src/components/share && bunx tsc --noEmit -p . && { rg -n "GoogleButton|loginWithGoogle|onGoogle" /Users/dongpark/moss/web/src/components/share --glob '!**/__tests__/**'; test $? -eq 1; }
```
- 한 줄이라 앞 명령이 하나라도 실패하면 AC가 실패한다. `rg`는 찾은 것이 없을 때만 통과한다. 경로가 없으면 `rg`가 2로 끝나 실패한다.
- T15 테스트: 로그인 안 된 상태로 팝오버를 그리면 Google 버튼이 0개이고, 공유 시작 버튼이 `disabled`이며, 눌러도 공유 시작 함수가 0번 불린다.

#### 금지사항
- 공유 시작·초대 링크 흐름을 바꾸지 마라. 이유: D3은 닿지 않는 로그인 분기만 지운다.

- summary: 공유 팝오버의 Google 버튼·handleGoogle 삭제, 공유 시작 비활성 (4d92cd9)
<!-- /STEP -->

<!-- STEP:1:google-login-timeout:completed -->
### T-1: Google 로그인 요청에 15초 제한을 둔다 (행 T19, T11의 바탕)

#### 읽을 파일
- `web/src/state/auth/api.ts` — 93행 `postJson`, 120행 `googleLogin`
- `web/src/state/auth/__tests__/api.test.ts` — fetch 가짜 패턴

#### 작업
- `postJson`이 선택적 `signal`을 받는다. `googleLogin`만 15초 신호를 넘긴다.
- 시간이 지나면 구분 가능한 오류로 끝난다. 오류 종류는 화면이 "잠시 뒤 다시 시도해 주세요"를 고를 수 있게 한다.
- 메일·초대·리프레시 요청은 신호를 넘기지 않는다.

#### AC
```bash
cd /Users/dongpark/moss/web && bunx vitest run src/state/auth/__tests__/api.test.ts && bunx tsc --noEmit -p .
```
- T19의 화면 결과는 이 단계가 아니라 T-3 AC가 검사한다.
- api.test.ts에 두 테스트가 있다: fetch를 끝없이 걸면 `googleLogin`이 15초에 실패한다. `login`·`signup` 호출의 fetch 옵션에는 `signal`이 없다.

#### 금지사항
- 메일 요청에 제한 시간을 넣지 마라. 이유: 비목표다.

- summary: googleLogin만 15초 AbortSignal, code timeout (e1f03db)
<!-- /STEP -->

<!-- STEP:2:gis-layer:completed -->
### T-2: Google 스크립트와 잇는 층을 표준 버튼 흐름으로 바꾼다 (행 T2, T18, T22의 바탕)

#### 읽을 파일
- `web/src/state/auth/googleIdentity.ts` — 지금 `requestGoogleIdToken`, `showFallbackButton`, `loadGis`
- `web/src/state/auth/__tests__/googleIdentity.test.ts` — 가짜 `window.google` 패턴

#### 작업
- 스크립트 주소를 `https://accounts.google.com/gsi/client?hl=ko`로 바꾼다. `loadGis`의 기존 스크립트 찾기도 같은 상수를 쓴다.
- 새 함수: 페이지에 1번만 `initialize({client_id, callback, ux_mode: "popup", auto_select: false})`한다. 칸 요소와 너비를 받아 `renderButton(el, {type: "standard", theme: "filled_black", size: "large", shape: "rectangular", text: "continue_with", locale: "ko", width})`을 부른다. 콜백 토큰은 지금 붙어 있는 칸 하나의 수신 함수로 보낸다. 칸이 떼어졌으면 버린다. 너비는 400px로 자른다.
- 클라이언트 ID가 없으면 구분 가능한 오류로 끝난다.
- `prompt()`와 위쪽 상자는 새 함수에서 부르지 않는다. 옛 `requestGoogleIdToken`은 T-3에서 지운다. 이 단계에서는 남겨도 된다.

#### AC
```bash
cd /Users/dongpark/moss/web && bunx vitest run src/state/auth/__tests__/googleIdentity.test.ts && bunx tsc --noEmit -p .
```
- 칸 너비를 재는 부분은 T-3이 만들고 T-3 AC가 검사한다.
- 테스트가 가짜가 받은 인자를 단언한다: `initialize` 1번과 그 인자, 칸 2번 붙여도 `initialize` 1번, `renderButton` 인자와 300·252 너비, 붙은 스크립트 `src`의 `hl=ko`, `prompt` 0번, 위쪽 상자 0개, 칸을 뗀 뒤 콜백 토큰은 수신 함수 0번.
- 이 테스트는 고치기 전 코드에서 먼저 실패해야 한다. 실패 출력을 runner 리포트에 붙인다.

#### 금지사항
- `initialize`를 칸마다 다시 부르지 마라. 이유: Google이 여러 번 설정하지 말라고 하고 마지막 콜백만 산다.

- summary: attachGoogleSignIn 추가, initialize 1번·hl=ko·prompt 0 (085945d)
<!-- /STEP -->

<!-- STEP:3:login-card-google-slot:completed -->
### T-3: 로그인 카드에 Google 칸을 달고 스토어를 토큰 인자로 바꾼다 (행 T1, T2 너비, T3, T12, T13, T14, T18, T19, T20, T21, T22, T23 첫 길, T25)

#### 읽을 파일
- `web/src/state/auth/store.ts` — `loginWithGoogle`, `configureAuth`의 `googleIdToken`, 커밋 안 된 `pendingGoogleToken`
- `web/src/components/auth/LoginOnboarding.tsx` — `LoginActions`의 `busy`·`online`·`handleLogin`·`googleConsent`
- `web/src/components/auth/GoogleButton.tsx` — 지울 대상
- `web/src/components/auth/__tests__/LoginOnboarding.test.tsx`, `InviteRoute.test.tsx`, `SessionExpiredCard.test.tsx`
- `web/src/state/auth/__tests__/store.test.ts`

#### 작업
- 스토어 `loginWithGoogle(idToken, termsVersion?)`로 바꾼다. `deps.googleIdToken`과 `pendingGoogleToken` 일체를 지운다.
- 새 부품 `GoogleSlot`이 칸을 재서 T-2 함수로 버튼을 그리고 토큰을 받는다. 상태는 스펙 상태 모델의 10상태와 덮개 2개를 하나의 상태 값으로 둔다. 흩어진 boolean으로 두지 않는다.
- `LoginActions`가 `GoogleButton` 대신 `GoogleSlot`을 쓴다. 메일과 Google이 요청 잠금 하나를 같이 쓴다. 잠금은 카드의 버튼과 링크 5개를 막는다. 오프라인 덮개는 `useOnlineStatus`를 쓴다.
- 이 단계에서 신규 계정은 "가입 마무리" 자리표시 상태까지만 간다. 화면은 T-4가 만든다. 옛 체크박스 재시도 흐름과 `collab.auth.googleConsentHint`는 지운다.
- `GoogleButton.tsx`와 옛 `requestGoogleIdToken`·`showFallbackButton`을 지운다.
- 테스트는 가짜 `window.google`로 토큰을 콜백한다. `configureAuth`의 `googleIdToken` 주입을 모든 테스트에서 지운다.

#### AC
```bash
cd /Users/dongpark/moss/web && bunx vitest run src/state/auth src/components/auth src/components/share && bunx tsc --noEmit -p . && bunx eslint src/state/auth src/components/auth && { rg -n "googleIdToken|pendingGoogleToken|requestGoogleIdToken|GoogleButton|googleConsentHint" /Users/dongpark/moss/web/src; test $? -eq 1; }
```
- 한 줄이라 앞 명령이 하나라도 실패하면 AC가 실패한다.
- 행 T3, T18, T20, T21, T22, T25의 "확인:" 단위 테스트가 있고 통과한다.
- T2 너비: 칸의 `clientWidth`를 300과 252로 꾸미면 `renderButton`이 받은 `width`가 각각 300과 252다. 상수를 넘기면 실패해야 한다.
- T12: 버튼 클릭만 있고 토큰이 안 오면 Google 칸이 가려지지 않고 오류 문구가 0개다.
- T13: 온라인에서 스크립트 로드를 실패시키면 "Google 로그인을 불러오지 못했어요"와 다시 시도 버튼이 보이고 메일로 계속 링크가 남는다.
- T14: 오프라인으로 그리면 오프라인 안내 하나만 보이고 Google 칸이 가려진다. 불러오지 못했어요 문구와 다시 시도 버튼은 0개다. 메일로 계속 링크는 남는다.
- T19: 끝나지 않는 fetch와 가짜 시계로 15초를 넘기면 "잠시 뒤 다시 시도해 주세요"가 보이고 Google 칸 덮개가 벗겨진다.
- T23 첫 길: 확인 중에 연결을 끊은 뒤 서버 오류로 버튼 단계에 오면 Google 칸이 가려진다. 나머지 세 길은 T-4 AC가 검사한다.
- T1은 실제 Google 창이 필요하다. 단위 테스트로는 버튼 칸에 `renderButton`이 붙고 `prompt`가 0번인 것까지 본다. 창이 뜨는 것은 사용자 실계정 확인으로 남긴다.

#### 금지사항
- 서버 코드를 고치지 마라. 이유: 비목표다.
- 메일 폼의 검증·문구를 바꾸지 마라. 이유: 비목표다.

- summary: GoogleSlot 상태 값 하나로 10상태+덮개, 스토어 토큰 인자 (c1ae049)
<!-- /STEP -->

<!-- STEP:4:signup-finish:completed -->
### T-4: 처음 온 계정의 가입 마무리 단계를 만든다 (행 T4, T5, T6, T7, T8, T9, T10, T11, T23 나머지 세 길, T24, T26)

#### 읽을 파일
- `web/src/components/auth/GoogleSlot.tsx` — T-3이 만든 상태 값
- `web/src/components/auth/LoginOnboarding.tsx` — 106행 `TermsCheckbox`, 메일 링크·폼
- `web/src/state/auth/terms.ts` — `termsVersion()`
- `web/src/i18n/messages/ko.json` — `collab.auth` 키

#### 작업
- 확인 중에 `consent_required`가 오면 웹 약관 버전이 있을 때 가입 마무리로 간다. 버전이 비었으면 가입 닫힘으로 간다. 503은 가입 닫힘이다.
- 가입 마무리는 토큰 안의 메일 주소, 약관 체크, "동의하고 시작하기", "다른 계정으로"를 보인다. 동의하고 시작하기는 들고 있던 토큰과 `termsVersion()`으로 다시 보낸다. Google 창은 다시 열지 않는다.
- 가입 보내는 중의 `consent_required`는 약관 어긋남, 401은 버튼과 만료 문구, 못 닿음·15초 초과는 가입 마무리와 오류 문구다.
- 가입 마무리·가입 보내는 중·가입 닫힘·약관 어긋남 동안 메일 링크와 폼을 숨긴다.
- `TermsCheckbox`를 꺼내 같이 쓴다. 새 번역 키는 스펙 구현 메모의 후보를 쓴다.

#### AC
```bash
cd /Users/dongpark/moss/web && bunx vitest run src/state/auth src/components/auth src/components/share && bunx tsc --noEmit -p . && bunx eslint src/state/auth src/components/auth
```
- 행 T5, T6, T8, T9, T11, T24, T26의 "확인:" 단위 테스트가 있고 통과한다.
- T4: 확인 중에 `consent_required`를 받으면 토큰 안의 메일 주소, 약관 체크, 동의하고 시작하기, 다른 계정으로가 보인다. 메일로 계속 링크와 메일 폼은 0개다. `role="alert"`는 0개다.
- T7: 가입 마무리에서 다른 계정으로를 누르면 Google 칸과 메일로 계속 링크가 다시 보인다. 이어서 다른 토큰을 콜백하면 서버 요청 본문의 `idToken`이 새 토큰이다.
- T10: 가입 보내는 중에 401을 받으면 처음 단계로 돌아가 "Google 확인 시간이 지났어요. 다시 골라 주세요"가 보이고 Google 칸이 다시 보인다.
- T23 나머지 세 길: 오프라인으로 꾸민 뒤 가입 마무리, 가입 닫힘, 약관 어긋남에서 각각 다른 계정으로를 누르면 세 번 모두 Google 칸이 가려진다.
- T5 테스트는 서버 가짜가 받은 두 번째 요청 본문이 `{idToken: 같은 토큰, termsAccepted: true, termsVersion}`인지와 Google 콜백 수 1번을 단언한다.

#### 금지사항
- 약관 버전이 비었을 때 동의 없이 다시 보내지 마라. 이유: 무한 거절의 원인이다.
- 토큰 서명을 웹에서 검증하지 마라. 이유: 표시용이고 검증은 서버가 한다.

- summary: 가입 마무리·닫힘·약관 어긋남 테스트 추가 (eba0558)
<!-- /STEP -->

## 구현 메모

- 교훈: 외부 클라이언트 설정을 고치면 그 클라이언트가 실제로 받은 값을 테스트한다. GIS면 가짜 `window.google`의 `initialize`·`renderButton`이 받은 인자와 실제로 붙은 스크립트 주소를 단언하고, 고치기 전 코드에서 먼저 실패하는지 본다. 근거 `lessons/2026-11-07-test-real-client-values.md`.
- 뒤집힌 결정: D3 추천을 "팝오버도 같은 가입 단계를 쓴다"에서 "팝오버의 Google 버튼을 지운다"로 바꿨다. 그 분기는 만료 카드에 덮여 사용자가 닿지 못한다. T16·T17을 지웠다.
- 뒤집힌 결정: 토큰 전달을 "마지막에 누른 버튼으로"에서 "지금 그려진 칸 하나로"로 바꿨다. 한 페이지에 칸이 하나뿐이라 `click_listener`가 필요 없다.
- 뒤집힌 결정: 오프라인을 상태에서 모든 상태 위의 덮개로 바꿨다. 상태로 두니 확인 중 오류, 가입 마무리와 가입 닫힘의 다른 계정으로, 이 3개 전이가 연결을 안 보고 버튼으로 갔다.
- 뒤집힌 결정: 약관 버전 어긋남을 가입 닫힘에서 떼어 약관 어긋남 상태로 뒀다. 같은 상태에 두니 한 화면에 반대 안내 2개가 떴다.
- 요청 잠금: 지금 `LoginOnboarding.tsx:183-196`은 메일 제출이 `setBusy(true)`를 켜고 `disabled = busy || !online`이 Google 버튼을 막는다. 새 Google 칸은 자기 요청 중임을 이 잠금에 올리고, 메일 요청 중임을 받아 덮개를 씌운다. 오프라인 덮개도 같은 `!online`을 쓴다.
- 대체하는 임시 수정: 커밋 안 된 `store.ts` `pendingGoogleToken`·`takePendingGoogleToken`·`PENDING_GOOGLE_TOKEN_TTL_MS`, `LoginOnboarding.tsx` `googleConsent` 상태와 `handleLogin`, `ko.json` `collab.auth.googleConsentHint`, `LoginOnboarding.test.tsx`의 새 흐름 테스트 2개. 새 설계로 바꾼다.
- 지금 코드: `web/src/state/auth/googleIdentity.ts` `requestGoogleIdToken`이 `initialize` 뒤 `showFallbackButton`으로 위쪽 상자를 띄우고 `prompt()`로 One Tap을 띄운다. 60초 타임아웃.
- 지금 코드: `googleIdentity.ts:7` `GIS_SRC`에 `hl`이 없다. `https://accounts.google.com/gsi/client?hl=ko`로 바꾼다. `loadGis`의 `script[src=...]` 찾기도 같은 상수를 쓴다. 근거 r1 `gis-ref.txt:892-896`.
- 지금 코드: `web/src/components/auth/GoogleButton.tsx`는 그냥 `<button>`이다. `LoginOnboarding.tsx:200`과 `SharePopover.tsx:120`이 쓴다. 새 부품으로 바꾸고 지운다.
- 지금 코드: `LoginOnboarding.tsx:148`이 빈 약관 버전을 거짓으로 보고 동의 없이 다시 보냈다. 무한 거절의 원인이다.
- 지금 코드: `web/src/state/auth/api.ts:93` `postJson`에 제한 시간도 `AbortSignal`도 없다. 리뷰에서 bun으로 fetch를 끝없이 걸면 `googleLogin`이 안 끝났다. `googleLogin`만 15초 신호를 넘긴다. 메일 요청은 그대로다.
- 공유 팝오버: `WorkspaceGate.tsx:23` `gateView`는 `authenticated`·`expired`일 때만 워크스페이스를 보인다. `ShareControl.tsx:59` `authenticated = session !== null && status !== "expired"`라 팝오버 Google 버튼은 만료일 때만 뜬다. 그때 `SessionExpiredCard.tsx:18` 오버레이가 `fixed inset-0`, z-modal 50으로 공유 줄 z-panel 40을 덮는다. `ShareControl.tsx:105` `handleGoogle`과 `SharePopover`의 `onGoogle`을 지우고, 로그인 안 된 분기는 공유 시작 버튼을 비활성으로 그린다.
- 한 칸 근거: 오버레이는 `WorkspaceShell.tsx:219`, 공유 줄은 `:191`. 초대 링크는 `app/j/[token]/page.tsx`가 `InviteRoute`만 그리고 `WorkspaceShell`이 없다. `InviteRoute.tsx:116`이 로그인 전·만료 때 `LoginOnboarding`을 그린다.
- 너비: `LoginOnboarding.tsx:97` `w-[300px]` 패딩 없음이라 300px. `SessionExpiredCard.tsx:27` `w-[300px]`에 `p-[26px_24px_20px]`라 252px. 상수를 쓰지 말고 칸의 `clientWidth`를 재서 넘긴다. 상한 400px, 근거 r1 `gis-ref.txt:884`. jsdom은 `clientWidth`가 0이라 T2 테스트는 300과 252를 꾸며 넣는다.
- 오프라인: `public/sw.js:7` 화면 요청은 네트워크 먼저, 실패하면 캐시 뼈대다. `:10` 다른 출처는 그냥 통과라 오프라인에선 GIS 스크립트를 못 받는다. `store.ts:148-151`이 만료를 기기 안에서 판정해 오프라인에서도 만료 카드가 뜬다. 연결 복귀는 `useOnlineStatus`로 본다.
- 스토어: `loginWithGoogle(idToken, termsVersion?)`로 바꾼다. `configureAuth`의 `googleIdToken` 주입은 지운다. `InviteRoute.test.tsx`도 함께 고친다. 76·92·102·118·131·145·156·171·183·232행이 `googleIdToken`을 주입한다. 96·106·120·134·174행이 이름이 "Google 계정으로 로그인"인 버튼을 찾고, 106행은 눌러 로그인한다. tsconfig가 테스트 파일도 타입 검사한다.
- GIS 인자: `initialize({client_id, callback, ux_mode: "popup", auto_select: false})`. `renderButton(el, {type: "standard", theme: "filled_black", size: "large", shape: "rectangular", text: "continue_with", locale: "ko", width: <잰 px>})`. `prompt` 호출 0번.
- GIS 코드 확인: 리뷰어가 받아 온 GIS `client.js`는 버튼 iframe마다 `click_listener`와 `state`를 저장하고, 클릭마다 그 버튼의 `click_listener`를 부른다. 콜백 응답에도 `state`가 온다. 근거 r1 `gis-ref.txt:585-588, 707-713, 920-924`. D3을 b로 바꾸면 이 값으로 칸을 나눈다.
- 토큰 보내기: 지금 그려진 칸 하나로 보낸다. 칸이 없으면 버린다. 칸이 바뀌어도 `initialize`는 다시 부르지 않는다.
- D1의 d 근거: r1 `oidc.txt:655-659` `response_type=id_token` 암묵 흐름, `:218-221` Google이 GIS를 권함. 서버 `AuthRoutes.kt:96-97`은 audience만 맞으면 받는다.
- 새 번역 키 후보: 가입 마무리 안내, "동의하고 시작하기", "다른 계정으로", "Google 확인 시간이 지났어요. 다시 골라 주세요", "약관이 바뀌었어요. 새로고침한 뒤 다시 시도해 주세요", "다시 시도". 가입 닫힘 문구는 서버 문구 "지금은 새 계정을 받을 수 없어요"와 같게 쓴다. 서버에 못 닿음과 15초 초과는 지금 키 `collab.auth.email.failed` "잠시 뒤 다시 시도해 주세요"를 쓴다. 로캘 파일은 `ko.json` 하나.
- 약관 체크는 `LoginOnboarding.tsx:106` `TermsCheckbox`를 꺼내 같이 쓴다.
- 서버 계약: `server/src/main/kotlin/com/moss/server/auth/AuthRoutes.kt:94` `POST /auth/google`. 토큰 검증 실패는 401 `unauthorized` "구글 로그인을 확인할 수 없어요". `consentOf`는 `AuthRoutes.kt:190`, 빈 버전이면 동의 없음으로 본다.
- 서버 가입 규칙: `boards/BoardRepository.kt:93` 서버 버전 없음 503 `signup_closed`, `:94` 동의 없음 400 `consent_required`, `:95` 버전 다름 400 `consent_required` "약관이 바뀌었어요...", `:153` 상한 503 `signup_capacity`. 기존 계정은 동의·상한을 안 본다.
- 약관 버전 배포: `docker-compose.prod.yml:36` 서버 `MOSS_TERMS_VERSION`은 실행 환경, `:90` 웹 `NEXT_PUBLIC_MOSS_TERMS_VERSION`은 빌드 인자다. 값을 바꾸면 웹 이미지도 다시 빌드한다.
- 환경: `web/.env.local`에 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_MOSS_TERMS_VERSION=2026-11-08`. 루트 `.env`에 `GOOGLE_CLIENT_ID`. 서버 `MOSS_TERMS_VERSION=2026-11-08` 확인됨: 2026-11-08 세션에서 `docker exec moss-server-1 printenv MOSS_TERMS_VERSION`. 서버 audience와 웹 클라이언트 ID가 같아야 한다.
- Google 콘솔: GCP dongpark 웹 클라이언트 moss-local, 출처 `http://localhost:3000`·`http://localhost`. 근거 `docs/specs/FEAT-collab-auth.md:252`.
- 로컬 DB users 5행 중 `google_sub` 있는 행 0. 로컬 Google 로그인은 처음엔 전부 신규 가입이다.
- 테스트: `cd web && bunx vitest run <경로>`. 타입 `bunx tsc --noEmit -p .`. 대상 `state/auth/__tests__/googleIdentity.test.ts`·`store.test.ts`·`api.test.ts`, `components/auth/__tests__/LoginOnboarding.test.tsx`·`SessionExpiredCard.test.tsx`·`InviteRoute.test.tsx`, 공유 팝오버 테스트.
- 작업 트리: `main`에 사용자의 무관한 변경이 있다. 작업 브랜치에서 auth·share 관련 파일만 커밋한다. `web/AGENTS.md`는 `next dev`가 다시 쓴다.

- 2026-11-08 사용자가 스펙(D1·D2·D3 모두 a)과 플랜을 승인했다. 작업 브랜치 `feat/google-login-standard-flow`, base `main`.
- feature playbook 단계 — runner가 받는 몫:
  - 1 영향 범위 파악 — 함: 메인과 spec-writer가 끝냈다. 이 메모가 결과다.
  - 2 설계 탐색 — 함: 스펙 리뷰 4바퀴, 플랜 리뷰 3바퀴 APPROVE.
  - 3 병렬 작업 점검 — 함: 같은 파일이 단계마다 이어져 작업자 1명이 T-0부터 T-4까지 순서대로 한다.
  - 4 구현 — runner: STEP마다 구현, 그 STEP AC 통과, 커밋 1개. 상태는 스펙 상태 모델대로 하나의 상태 값으로 둔다.
  - 5 검증 — runner: 각 STEP AC를 그대로 돌려 출력을 리포트에 붙인다. T-2 테스트는 고치기 전 코드에서 먼저 실패한 출력도 붙인다. 실제 Google 창은 메인이 사용자 확인으로 넘긴다.
  - 6 작은 커밋 — runner: STEP 하나에 커밋 하나. auth·share·i18n·spec 파일만 스테이징한다. `git add -A`·`git add .`을 쓰지 않는다.
  - 7 적대 심사 — 메인: runner 뒤 /review code.
  - 8 PR 열기 — 메인: /pr.

- 가정하고 진행한 것 — runner가 스펙에 없어 정했다. 뒤집으려면 이 줄을 고치고 다시 띄운다:
  - 15초 초과는 `AuthRequestError(code "timeout", status 0)`이다. 화면 문구는 그 밖 오류와 같은 "잠시 뒤 다시 시도해 주세요"다.
  - 가입 마무리 안내 문구는 "이 계정으로 가입해요"다.
  - 칸 너비를 못 재면 `width`를 주지 않고 Google 기본 너비에 맡긴다.
  - 확인 중의 401은 서버 문구를 먼저 쓰고, 없으면 "잠시 뒤 다시 시도해 주세요"를 쓴다.
  - 가입 보내는 중 401로 처음 단계에 돌아가면 약관 체크를 끈다.
- 커밋 경계: T-3 커밋 `c1ae049`에 T-4 전이 로직이 같이 들어갔다. T-4 커밋 `eba0558`은 테스트와 부모 알림 수정이다. 되돌릴 때는 두 커밋을 묶는다.
- 코드 리뷰 수정 `67c64e8`: 15초 제한을 응답 본문 읽기까지 건다. 덮개 아래 Google 칸에 `inert`를 건다. 오프라인이면 Google 칸 오류 문구를 숨긴다. 1바퀴 P1 2·P2 1, 2바퀴 0.
- 남은 위험: 프록시가 503을 주면 기존 계정도 가입 닫힘 화면으로 간다. 상태 모델이 503을 가입 닫힘으로 정했다. 응답 code를 보도록 바꿀지는 다음 결정이다.

## 문서 리뷰

스펙: 검토자 ① Claude doc-reviewer ② GPT-6.1-sol ocx · 1) P0 0·P1 7·P2 3  2) 0·3·0  3) 0·1·0  4) 0·0·0 · 버림 0 · APPROVE
플랜: 검토자 ① Claude doc-reviewer ② GPT-6.1-sol ocx · 1) P0 0·P1 7·P2 0  2) 0·1·0  3) 0·0·0 · 버림 0 · 교차 확인 4 · APPROVE
