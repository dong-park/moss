# cloudflared가 "control stream" 오류로 재시작을 반복하면 터널이 아직 있는지부터 본다

## 맥락

운영 서버의 cloudflared가 2026-10-25부터 `control stream encountered a failure while serving`을 내며 재시작을 반복했다. 서브도메인 12개가 Cloudflare 530, 오류 코드 1033을 돌려줬다.
이슈 #20은 첫 조치로 터널 프로토콜을 QUIC에서 http2로 바꾸라고 적었다. 실제 원인은 프로토콜이 아니었다. 설정이 가리키는 터널 `image-editor`가 Cloudflare 계정에서 사라져 있었다. QUIC 연결은 맺어지고 연결 등록 단계에서 거절됐다.
새 터널을 같은 QUIC로 붙이자 연결 4개가 바로 등록됐다.

## 다음에 할 일

- 이 오류를 보면 설정·프로토콜을 바꾸기 전에 서버에서 `cloudflared tunnel info <설정의 tunnel 값>`을 돌린다.
- "found 0 tunnels"가 나오면 터널이 없다. `cloudflared tunnel create`로 새로 만들고 설정의 `tunnel`과 `credentials-file` 두 줄만 바꾼다.
- 그 터널을 쓰던 호스트마다 `cloudflared tunnel route dns --overwrite-dns <새 터널> <호스트>`로 DNS를 옮긴다.
- 옮기기 전에 호스트마다 응답을 본다. 1033인 호스트만 옮긴다. 200인 호스트는 다른 길로 나가고 있을 수 있다. 이번에는 `chat`이 Tailscale IP를 직접 가리켜 살아 있었다.
- Cloudflare Access가 앞에 있는 호스트는 터널이 죽어도 302를 준다. 302를 정상으로 읽지 않는다.

## 검증

2026-11-08 새 터널 `5758cd66` 등록 뒤 530 호스트가 12개에서 0개가 됐다. `claude2`는 502로 남았다. 서버 17333 포트에 프로세스가 없어서다. 터널과 무관하다.
같은 증상을 다른 원인으로 낸 사례는 확인 안 됨.

## 근거

- `spec/moss-deploy.md` — 결정 첫 세 줄과 진행 표
- 서버 `/etc/cloudflared/config.yml.bak.20261108-moss` — 옛 터널 id `4b195f05`를 가리키던 설정
- https://github.com/dong-park/moss/issues/20 — QUIC에서 http2로 바꾸라던 첫 조치
