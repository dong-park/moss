# Radix 모달 안에서 body로 portal한 떠 있는 UI에는 pointer-events:auto를 준다

## 맥락

펼친 메모 창(Radix Dialog, modal)에서 글자를 긁으면 서식 버블이 떴다. 버블은 `document.body`로 portal한 position:fixed 툴바다. 화면에는 보였지만 B를 누르면 서식이 안 바뀌고 창이 닫혔다.
Radix 모달은 열려 있는 동안 `body.style.pointerEvents = "none"`을 건다. body 직속 버블이 이 값을 상속했다. 클릭이 버블을 뚫고 뒤의 Dialog.Overlay에 닿아 창이 닫혔다.
스펙은 처음에 "Radix가 버블을 바깥으로 판정해 닫는다"고 썼다. 실제로 Radix 1.2.1 dismissable-layer는 React 트리 기준으로 안팎을 가른다. 버블은 Content의 React 자손이라 바깥이 아니었다. 원인은 pointer-events 상속 하나였다.

## 다음에 할 일

- Radix 모달 안 컴포넌트가 body로 portal하는 떠 있는 UI(버블, 팝오버, 툴팁)를 그리면 그 루트에 `pointer-events: auto`를 준다.
- 버튼이 안 눌리면 먼저 버튼 중심의 `document.elementFromPoint(x, y)`를 본다. 버튼이 아니라 오버레이가 잡히면 pointer-events 문제다.
- 같은 모달의 다른 버튼(펜·닫기 줄)은 Content의 자식으로 둔다. Content 밖 형제로 두면 같은 이유로 안 눌린다.

## 검증

수정 전 실측(a03b687 이전): 버블과 body의 pointerEvents가 'none'이었다. B 중심 elementFromPoint는 오버레이였고 누르자 [role=dialog]가 1에서 0이 됐다.
수정 뒤(a03b687): prover가 실제 포인터로 B와 H1을 눌렀다. elementFromPoint가 각 버튼이었고 굵게·제목이 들어갔으며 창은 열려 있었다. `BubbleMenuHost.test.tsx`가 열린 버블의 style.pointerEvents 'auto'를 본다.

## 근거

- `web/src/components/workspace/cards/_shared/editor/BubbleMenuHost.tsx` — 버블 루트 style의 `pointerEvents: "auto"`
- `web/node_modules/@radix-ui/react-dismissable-layer/dist/index.mjs:113` — body pointer-events none, `:314` React 트리 기준 안팎 판정
- 스펙 `spec/memo-paper-expand/spec.md` 실패 모드 1, 결정 D9
