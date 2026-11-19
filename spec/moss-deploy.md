# moss.dongpark.dev 운영 배포

| 항목 | 값 |
|---|---|
| 상태 | 진행 |
| 이슈 | https://github.com/dong-park/moss/issues/20 |
| 서버 | `dongpark` 리눅스 기기, Tailscale `100.117.197.86` |

## 목표

moss main을 운영 서버 한 대에 올려 `https://moss.dongpark.dev`로 공개한다. 같은 서버의 Cloudflare 터널을 고쳐 다른 서브도메인도 되살린다.

## 결정

- 2026-11-08 터널 장애의 원인은 QUIC가 아니다. 서버 설정의 터널 `image-editor`가 Cloudflare 계정에 없다. `cloudflared tunnel info`가 0개를 찾았다. `tunnel list -d`에도 없다. 그래서 프로토콜을 http2로 바꾸는 시도는 하지 않는다.
- 실패는 늦어도 2026-10-25 16:50 KST부터다. 누가 언제 터널을 지웠는지는 확인 안 됨.
- 고치는 길: 서버에서 새 터널을 만든다. 설정의 터널 id와 자격 증명만 바꾸고 ingress는 그대로 둔다. 죽은 터널을 가리키던 호스트 12개의 DNS를 새 터널로 덮어쓴다.
- `chat.dongpark.dev`는 건드리지 않는다. DNS가 Tailscale IP를 직접 가리키고 nginx가 받는다. 지금 200이다.
- `docs-edit.dongpark.dev`는 Cloudflare Access가 앞에서 302를 준다. 뒤가 죽은 터널인지는 추론이다.
- 경로는 nginx 없이 cloudflared ingress의 path 규칙으로 가른다. 그러면 `TRUSTED_PROXY_HOPS`는 1이다. 실제 X-Forwarded-For 모양은 배포 전에 확인한다.
- 경로 표는 코드에서 뽑았다. Ktor 8080은 `/auth/ /boards/ /invites/ /me /oauth/ /.well-known/oauth-* /health`를 받는다. sync 1234는 `/mcp`와 웹소켓 `/sync`를 받는다. 나머지는 web 3001이다. `/internal/`은 공개하지 않는다.
- AI 키는 이슈 범위에 없어 넣지 않는다. 비어 있으면 AI가 가짜 결과를 낸다. 운영자가 정한다.

## 진행

진행 중이다. 단계를 마칠 때마다 고친다.

| 기준 | 판정 | 근거 |
|---|---|---|
| 터널 원인을 찾고 고친다 | 통과 | 새 터널 `dongpark` id `5758cd66`이 QUIC로 연결 4개를 등록했다 |
| 다른 서브도메인이 530에서 돌아온다 | 통과 | 530이 12개에서 0개. `claude2`는 502다. 서버 17333 포트에 아무것도 없다 |
| 서버에 moss main을 받는다 | 통과 | `~/moss`, `e5d1ebd` |
| 운영 `.env`를 서버에서 만든다 | 통과 | 권한 600, 키 13개, 비밀값은 `openssl rand`로 서버에서 생성 |
| compose로 띄우고 포트가 127.0.0.1에만 붙는다 | 통과 | 2026-11-08 17:42 KST 컨테이너 4개. `ss`에 127.0.0.1:8080·1234·3001만 있다. 공개 주소로 `/` 200, `/health` 200, `/internal/mcp/x` 404, `GET /mcp` 405 |
| 경로 표를 코드에서 정한다 | 통과 | 위 결정의 경로 줄 |
| 터널 경로 규칙과 DNS를 만든다 | 통과 | `ingress rule`로 경로 13개를 확인했다. X-Forwarded-For는 `6.6.6.6,183.101.234.16`으로 왔다. 맨 오른쪽이 실제 주소라 홉 1이 맞다 |
| 백업을 주기 실행에 건다 | 통과 | crontab 매일 04:10 KST, `~/moss-backups`. 같은 명령을 손으로 1번 돌려 덤프 24KB와 첨부 tar가 권한 600으로 생겼다. cron이 직접 돈 것은 확인 안 됨 |
| 첫 화면·메일 가입·보드 동기화 | 통과 | prover 판정. `/auth/signup`·`/auth/login`·`/me` 200. 웹소켓 클라이언트 A가 쓴 값을 B가 읽었다. 둘을 끊고 새로 붙은 C도 같은 값을 읽었다. 번들에 운영 주소 4개가 박혔고 `localhost:포트`는 0건 |
| Google 로그인 | 대기: 운영자가 계정을 골라 로그인 | 옛 `origin_mismatch`는 풀렸다. 새 moss 전용 클라이언트로 팝업이 계정 선택 창까지 간다. `spec/moss-google-oauth.md`, 이슈 #21 |

2026-11-10 17:59 KST: 서버를 `4854c5a`에서 `c5de835`(#25 cmd+z)로 올렸다. 바뀐 곳이 web뿐이라 `up -d --no-deps --build web`로 web만 다시 띄웠다. postgres·server·sync는 재시작하지 않았다. 직전 수동 백업은 `moss-20261110-175919.dump` 35KB와 첨부 tar 1.36MB다. 배포 뒤 `/`·`/health`·`/about` 200, 첫 화면 스크립트 15개 중 7개 이름이 바뀌었고 그중 1개에 #25의 `moss-untracked-origin` 문자열이 있다. 로그인한 화면에서의 cmd+z는 운영에서 확인 안 됨.

확인용 계정 `moss-verify-20261108@example.com`과 보드 `ed8b0ec0`이 운영 DB에 남아 있다. 계정 상한 100 중 1개를 쓴다.

서버 컨테이너 재시작 뒤에도 보드 값이 남는지는 확인 안 됨.

2026-11-08 17:42 메인이 서버에서 `docker image prune -f`를 확인 없이 돌렸다. 컨테이너가 안 쓰는 이름 없는 이미지만 지우는 명령이다. 무엇이 지워졌는지는 확인 안 됨.

## 롤백

- 터널 설정 백업: `/etc/cloudflared/config.yml.bak.20261108-moss`.
- 옛 DNS 기록은 지워진 터널을 가리켰다. 되돌려도 동작하지 않는다.
- moss를 내리려면 서버 `~/moss`에서 `docker compose -f docker-compose.prod.yml down`을 한다. 볼륨은 남는다.
