# moss 캔버스 카드 — 베이스 판 이미지 생성 프롬프트

> 캔버스 위 11종 카드(text · highlight · checklist · code · image · file · audio · handwriting · mindmap · link · comment)의 **베이스 판**(콘텐츠가 위에 얹히는 배경 종이/판) 이미지를 생성하기 위한 프롬프트 모음.
> 사이드바 아이콘과 동일한 톤(`docs/icon-prompts.md`). nano-banana, GPT-4o Image, Imagen, DALL-E 3, Midjourney 등에 그대로 투입 가능.
> moss 정체성: "감독의 핀보드 · 조용한 사무 책상 · 정리된 지능감 · 미완성 허용".

---

## 사이드바 아이콘과의 차이

| 항목 | 사이드바 아이콘 | 카드 베이스 (이 문서) |
|---|---|---|
| 크기 | 44×44 (retina 88×88) | 가변 폭 240~480px, 높이 80~400px |
| 비율 | 1:1 정사각형 | 1:1 기본 + 3:2 가로 변형 |
| 역할 | 단일 픽토그램 | 콘텐츠가 위에 얹히는 무대 |
| 콘텐츠 영역 | 사물 자체가 주인공 | **중앙은 비워두기**(UI 텍스트가 얹힘) |
| 합성 방식 | `<img>` 단독 | 카드의 `background-image` 또는 absolute 레이어 |

**핵심 원칙**: 실제 UI 텍스트(`card.content`, 체크박스, 입력창)가 이 베이스 위에 얹힌다. 그러니 베이스 안에 들어가는 글씨/표식은 모두 **illegible**(읽을 수 없는 흐릿한 표식). 콘텐츠가 들어갈 중앙 영역은 깨끗한 면을 유지.

---

## 0. 공통 스타일 가이드 (모든 프롬프트에 prepend)

```
- View: top-down, 90° overhead shot (or slight tilt within ±5°)
- Lighting: soft natural daylight from upper-left, gentle diffused shadow falling lower-right
- Surface: neutral matte office desktop in off-white or very light warm gray, subtle paper or laminate texture (or transparent background)
- Color palette: neutral office supplies. Off-white paper, light gray plastic, brushed steel, graphite black, clear acrylic, muted cork, restrained accents only. Avoid an overall yellow or beige cast. NO SaaS blue, NO neon, NO oversaturation
- Composition: subject card/object occupies 80–88% of frame width, centered with ~7% safe margin on all sides so corner curls and shadows are not clipped
- **Content area must remain visually empty** — the inner ~70% of the card is reserved for real UI text/widgets that will be layered on top. No mock paragraphs, no fake UI, no readable words anywhere in the image
- Aspect: 1:1 square unless specified otherwise
- Realism: photorealistic OR high-fidelity 3D render. NOT illustrated, NOT cartoon, NOT line art, NOT flat icon
- Imperfection encouraged: slight curls, scuffs, dust specks, hand-touched feel, subtle asymmetry
- Text on objects: illegible (font hallucination 회피). Faint pencil strokes only at the edges, never across the content area
- Mood: quiet intelligence, a real office desk, a director's pinboard. Lived-in, not staged
```

## 출력 사양 (공통)

| 항목 | 값 |
|---|---|
| 기본 비율 | 1:1 (정사각형) — CSS `background-size: cover` 합성용 |
| 변형 비율 | 3:2 가로 — 가로 폭 우선 카드(image, link)용 |
| 해상도 | 1024×1024 이상 (retina 합성 시 2048×2048 권장) |
| 포맷 | PNG (배경 투명 또는 desktop tone 일체) |
| 색공간 | sRGB |
| 톤 | neutral office, real materials, daylight |

## 후처리 가이드

1. **배경 처리**: 카드가 책상 위에 놓인 컴포지션이라면 desktop tone째로 저장(투명 X). 카드 단독 컷이라면 `remove.bg`로 배경 제거 후 transparent PNG.
2. **사이즈 정규화**: 11종 모두 1024×1024 (retina 2048×2048) 1장씩. 카드별 변형(예: image-wide)이 필요하면 같은 파일명 + `-wide` suffix.
3. **CSS 적용**:
   ```css
   .card-text {
     background-image: url('/cards/text.png');
     background-size: cover;
     background-position: center;
   }
   ```
   또는 React에서 `<Image src="/cards/text.png" fill style={{ objectFit: "cover" }} />` 후 콘텐츠를 그 위 `<div className="relative">`로 얹기.
4. **콘텐츠 가독성 확보**: 베이스가 어둡거나 패턴이 짙으면 `.card > .content` 위에 살짝 `rgba(255,255,255,0.6)` overlay. 단, 콘텐츠 영역을 비워둔 프롬프트가 잘 통하면 overlay 불필요.
5. **SVG 트레이싱 비권장**: 종이 결·자연 그림자 디테일 손실. PNG 그대로 사용.

---

## 1. Text — 일반 텍스트 메모

**의미**: 가장 기본. 흐르는 생각 한 토막.
**실물 컨셉**: 작은 흰 메모지 한 장이 책상 위에 놓인 모습. 우측 하단 모서리만 살짝 들림. 콘텐츠 영역은 깨끗한 흰 면.

**Prompt (EN)**:
> A single small clean white office memo sheet lying flat on a neutral light-gray office desktop, photographed from directly above. The sheet has crisp clean edges, very subtle paper fiber texture, and one slightly curled lower-right corner. **The inner 70% of the sheet is completely empty white paper — no markings, no text, no lines.** Only at the very top-left edge are two or three barely visible pale graphite scuff marks, suggesting hand handling. Soft natural daylight from upper-left, gentle diffused shadow falling lower-right. Centered composition, sheet occupies 85% of frame with 7% safe margin. Photorealistic, fine paper grain visible at edges only. Color palette: clean white paper, very faint graphite scuffs at edges, neutral light-gray desk surface. Avoid yellow sticky-note tone, avoid lined notebook paper, avoid any readable or pseudo-readable writing. 1:1 aspect.

**한국어 보조**: 책상 위 흰 메모지 한 장. 우하단 모서리 살짝 들림. **중앙은 완전히 빈 흰 면** — 글씨·줄·표식 없음. 가장자리에만 흐릿한 손때 자국. 노란 포스트잇 느낌 금지.

**Variants**:
- 모서리 두 곳이 들린 변형
- 살짝 비스듬히 놓인(rotation 1.5°) 변형

---

## 2. Highlight — 인용

**의미**: 외부 문장 인용·강조. 출처가 있는 한 줄.
**실물 컨셉**: 작은 흰 메모 슬립의 **왼쪽 가장자리**에 차분한 노란 형광 잉크 띠가 세로로 그어진 모습. 본문 영역은 빈 흰 종이.

**Prompt (EN)**:
> A small white office memo slip resting on a neutral light-gray desktop, photographed from directly above. **Along the left edge of the slip runs a single soft muted-yellow highlighter stripe, about 6% of the card width**, applied with a chisel-tip highlighter — slightly uneven ink saturation, visible brush start and end. The rest of the slip is completely empty clean white paper, no text, no lines, no marks. One corner is very slightly raised. Soft natural daylight from upper-left, gentle shadow lower-right. Centered, slip occupies 85% of frame. Photorealistic, visible paper fiber and slight ink absorption where the highlighter passed. Color palette: white paper, one restrained muted-yellow accent stripe on the left, neutral desk surface. Avoid neon yellow, avoid full-page highlight, avoid digital marker icons, avoid readable text. 1:1 aspect.

**한국어 보조**: 흰 메모 슬립의 **왼쪽 가장자리에만** 차분한 노란 형광 띠 세로 한 줄. 나머지는 빈 종이. 네온·전체 색칠·디지털 마커 느낌 금지.

**Variants**:
- 왼쪽 띠 + 우상단에 작은 은색 페이퍼클립
- 왼쪽 띠 색을 차분한 코랄(인용) / 차분한 청회색(소스)으로 교체

---

## 3. Checklist — 체크리스트

**의미**: 정리되지 않은 작은 행동 목록.
**실물 컨셉**: 작은 사무용 클립보드 — 상단에 금속 클립, 본문 영역은 **빈 흰 패드 종이**. 콘텐츠 영역은 비워두고, 위 헤더 띠만 베이스로 살림.

**Prompt (EN)**:
> A small office clipboard photographed from directly above on a neutral light-gray desktop, holding a clean white checklist pad sheet. The top ~12% of the clipboard is a brushed-steel spring clip with subtle reflections. **The paper itself is completely blank — no checkbox rows printed, no horizontal lines, no text, no marks** — just pure white pad paper with subtle paper fiber. The clipboard backing peeks slightly past the paper edges in soft light gray. Soft natural daylight from upper-left, gentle shadow lower-right, layered shadow between paper and board. Centered composition, clipboard occupies 86% of frame. Photorealistic, visible paper fiber, brushed-metal clip detail, subtle board edge. Color palette: white paper, light-gray board, brushed steel clip, neutral desk surface. Avoid yellow paper, avoid printed checkboxes (the UI draws those on top), avoid readable text. 1:1 aspect.

**한국어 보조**: 작은 클립보드 — 위쪽 ~12%만 금속 클립, 나머지는 **빈 흰 패드**. 체크박스·줄·글씨 일체 없음(실제 체크박스는 UI가 위에 그림). 노란 종이 느낌 금지.

**Variants**:
- 클립이 검정 더블클립으로 교체된 변형
- 패드 모서리가 살짝 닳은 변형

---

## 4. Code — 코드

**의미**: 코드 블록·구조화된 스니펫·개발 메모.
**실물 컨셉**: 흰 인덱스 카드 — 상단에 회색 라벨 띠(언어 라벨 자리), 본문은 빈 흰 면. 옆에 검정 파인라이너 펜이 사선으로 살짝 보임.

**Prompt (EN)**:
> A small white office index card lying on a neutral light-gray desktop, photographed from directly above. **The top ~10% of the card is a flat darker matte band — a subtle gray printed strip running horizontally, like a label header.** The band has no readable text, only a uniform muted graphite-gray tone with faint paper grain showing through. The rest of the card (the lower 90%) is completely blank clean white paper — no code lines, no monospace marks, no symbols. A slim matte-black fine-liner pen rests partly visible along the right edge of the frame at a slight diagonal, only the front third of the pen entering frame. Soft natural daylight from upper-left, gentle shadow lower-right. Centered composition, card occupies 85% of frame. Photorealistic, real stationery materials. Color palette: white paper, muted graphite-gray label band, matte black pen, brushed steel pen tip, neutral desk surface. Avoid screens, keyboards, glowing UI, SaaS blue, any readable text or pseudo-code marks. 1:1 aspect.

**한국어 보조**: 흰 인덱스 카드 — 상단 ~10%에 무광 회색 라벨 띠(언어 라벨 자리), 나머지는 **빈 흰 면**. 우측 가장자리에 검정 파인라이너 펜 일부만 살짝 보임. 화면/디지털 UI 느낌 금지.

**Variants**:
- 라벨 띠가 더 어두운 차콜 회색인 변형 (다크 모드 카드용)
- 펜 위치를 좌하단 사선으로 옮긴 변형

---

## 5. Image — 이미지 첨부

**의미**: 사진·시각 자료 첨부.
**실물 컨셉**: 흰 테두리 사진 출력물 한 장. 사진 영역은 회색 빈 면(실제 이미지가 위에 얹힘). 상단에 작은 은색 페이퍼클립.

**Prompt (EN)**:
> A small matte photo print with a clean white 8mm border, lying on a neutral light-gray office desktop, photographed from directly above. The print is held at the top edge by a small silver paper clip. **The image area inside the white border is a uniform soft neutral mid-gray surface with very subtle paper-grain texture — completely empty, no scene, no subject, no recognizable image.** It reads as a placeholder photo waiting to be filled. One lower corner of the print is slightly raised. Soft natural daylight from upper-left, gentle shadow lower-right. Centered composition, print occupies 82% of frame width. Photorealistic, paper grain on white border and gentle matte sheen on the inner gray area. Color palette: white border, neutral mid-gray photo area, silver paper clip, neutral desk surface. Avoid vintage polaroid yellow, avoid any actual image content, avoid readable text. 1:1 aspect (or 3:2 wide variant for landscape-favored images).

**한국어 보조**: 흰 테두리 사진 출력물 — **사진 영역은 텅 빈 중성 회색 면**(실제 이미지는 UI가 위에 깔음). 상단 은색 페이퍼클립. 빈티지 폴라로이드 노란빛 금지.

**Variants**:
- 3:2 가로 변형 (landscape 이미지용 — `image-wide.png`)
- 페이퍼클립이 검정 더블클립으로 교체된 변형

---

## 6. File — 첨부 파일

**의미**: 임의 MIME의 첨부 파일(PDF·docx·zip·...).
**실물 컨셉**: 라벨 탭이 달린 흰 마닐라 폴더의 앞면 — 좌상단에 작은 라벨 영역(파일 확장자 자리), 본문은 빈 흰 면.

**Prompt (EN)**:
> A clean off-white office file folder lying flat on a neutral light-gray desktop, photographed from directly above. The folder has a small rectangular tab in the top-left corner (~14% of card width, ~10% of height) printed in slightly darker pale gray — a label area, **completely blank with no readable text**. The rest of the folder surface is uniform clean off-white paper-board with very subtle fiber texture. The right edge shows a soft folded crease line. One lower corner is slightly bent up. Soft natural daylight from upper-left, gentle shadow lower-right, layered shadow along the folded edge. Centered composition, folder occupies 86% of frame. Photorealistic, real card-stock texture. Color palette: off-white folder, pale-gray tab area, soft crease shadow, neutral desk surface. Avoid bright manila yellow, avoid printed text on the tab, avoid binder rings. 1:1 aspect.

**한국어 보조**: 라벨 탭이 좌상단에 달린 흰 폴더 — 탭은 **빈 회색 영역**(확장자/파일명은 UI가 그 위에 깔음). 본문은 빈 흰 면. 노란 마닐라 폴더 느낌 금지.

**Variants**:
- 탭이 우상단인 변형 (RTL 레이아웃용)
- 폴더 우측에 작은 검정 더블클립이 끼워진 변형

---

## 7. Audio — 음성 녹음

**의미**: 음성 캡처, 녹음된 한마디.
**실물 컨셉**: 책상 면에 검정 보이스 레코더의 **윗부분만** 살짝 보이고, 그 옆 본문 영역은 빈 흰 메모 슬립. 좌측 보이스 레코더 + 우측 메모 슬립 구성.

**Prompt (EN)**:
> A horizontal composition photographed from directly above on a neutral light-gray office desktop. **On the left ~25% of the frame sits the top portion of a small matte-black digital voice recorder** — only the upper third visible, showing tiny speaker grille holes, one restrained muted-red record button dot, and brushed-metal microphone strip. **The right ~70% is a clean white memo slip**, completely blank, no text, no lines, no marks. A very thin shadow line separates the two objects. The recorder body has subtle scuffs suggesting use. Soft natural daylight from upper-left, gentle shadow lower-right. Centered composition, both objects together occupy 88% of frame. Photorealistic, real plastic and paper textures. Color palette: matte graphite-black recorder, brushed metal accent, one tiny muted red dot, white memo paper, neutral desk surface. Avoid microphones on stands, avoid music equipment, avoid glowing screens, avoid waveform graphics, avoid readable text. 1:1 aspect.

**한국어 보조**: 가로 구성 — 왼쪽 ~25%에 검정 보이스 레코더 윗부분(스피커 구멍·작은 빨간 녹음 버튼·금속 마이크 띠), 오른쪽 ~70%는 **빈 흰 메모 슬립**. 마이크 스탠드·음악 장비·디지털 화면 금지.

**Variants**:
- 레코더 위치를 우측으로 미러링한 변형
- 메모 슬립 위에 가는 흑연 파형 한 줄(매우 흐릿하게)이 있는 변형 — UI 파형이 위에 얹힐 때 가이드

---

## 8. Handwriting — 손글씨

**의미**: 손으로 그린 스케치·필기.
**실물 컨셉**: 빈 흰 스케치 종이 — 우측 또는 하단에 검정 기계식 연필 한 자루가 사선으로 일부만 살짝 진입. 본문 영역은 깨끗한 흰 면.

**Prompt (EN)**:
> A clean white sketch paper sheet lying flat on a neutral light-gray desktop, photographed from directly above. The sheet is completely blank white — no stroke lines, no scribbles, no marks of any kind across the surface. Only at the lower-right edge of the frame, a single matte-black mechanical pencil enters at a diagonal, with about the front 40% of the pencil visible — fine graphite tip, small brushed-metal grip, subtle scuffs. The pencil casts a soft delicate shadow along its right side. The paper has very subtle fiber texture and one slightly curled upper-left corner. Soft natural daylight from upper-left, gentle shadow lower-right. Centered composition, paper occupies 85% of frame. Photorealistic, real paper grain and metal/plastic pencil texture. Color palette: white paper, matte black pencil, brushed steel grip, graphite tip, neutral desk surface. Avoid wooden yellow pencil, avoid any drawn strokes on the paper, avoid readable text. 1:1 aspect.

**한국어 보조**: **완전히 빈 흰 스케치 종이** + 우하단에 검정 기계식 연필 일부만 사선 진입(약 40%). 종이 위에 그려진 선·낙서 일체 없음(필기 자체는 UI가 위에 그림). 노란 나무 연필 느낌 금지.

**Variants**:
- 연필 위치를 좌상단 사선으로 옮긴 변형
- 종이 위에 매우 흐릿한 모눈선(가는 회색)이 있는 변형 — 손글씨 가이드용

---

## 9. Mindmap — 마인드맵

**의미**: 중심 생각에서 가지를 뻗는 구조.
**실물 컨셉**: 작은 코르크 보드 또는 흰 카드 면. 본문 영역은 깨끗하게 두되, **모서리에 작은 핀과 가는 회색 실 한 가닥**만 살짝 보여 마인드맵 컨셉을 암시. 실제 노드는 UI가 위에 그림.

**Prompt (EN)**:
> A small square office surface photographed from directly above on a neutral desktop — the surface is a clean off-white card-board panel, like a flat pinboard. **The center 75% of the panel is completely empty**, with very subtle paper-board fiber texture. Only at the four corners are tiny details: top-left corner has one muted-black office push-pin (about 4% of frame), top-right has one steel pin, bottom corners each have a barely-visible end of thin gray cotton thread tucked under, hinting at unseen connections. No nodes, no diagram, no cards on top, no readable text. Soft natural daylight from upper-left, gentle shadows from the pin heads. Centered composition, panel occupies 88% of frame. Photorealistic, real cork-board / card-stock texture. Color palette: muted off-white panel, muted black + steel pins, faint gray thread, neutral desk surface. Avoid digital node graphs, avoid bright colors, avoid yellow cork tone, avoid readable text. 1:1 aspect.

**한국어 보조**: 흰 코르크/카드보드 판 — **중앙 75%는 깨끗한 빈 면**. 네 모서리에만 작은 핀(검정 1개·은색 1개)과 회색 실 끝자락이 살짝 보임(실제 노드는 UI가 위에 그림). 디지털 노드 그래프 느낌 금지.

**Variants**:
- 코르크 질감을 더 강하게 살린 변형(노란기 없는 차분한 회갈색)
- 핀이 한 개만(중앙 상단) 박힌 변형

---

## 10. Link — 외부 링크 OG 프리뷰

**의미**: URL 첨부, OG 메타데이터 카드.
**실물 컨셉**: 흰 카드 + 상단에 작은 사진 출력물 한 장이 페이퍼클립으로 부착된 모습. 사진 영역과 본문 영역 둘 다 비워둠.

**Prompt (EN)**:
> A vertical card composition photographed from directly above on a neutral light-gray desktop. **The upper 40% is a small matte photo print** with a clean thin white border, held in place by a small silver paper clip at the top edge — **the photo image area is a uniform soft neutral mid-gray surface with subtle grain**, completely empty, no scene. **The lower 60% is a clean white index card** (the same card the photo is clipped onto), completely blank — no title text, no URL, no marks. A very thin shadow line separates the photo print from the card below. One bottom corner of the card is slightly raised. Soft natural daylight from upper-left, gentle shadow lower-right, layered shadows between photo, clip, and card. Centered composition, the entire stack occupies 85% of frame. Photorealistic, paper grain on both surfaces, brushed steel clip detail. Color palette: white card, neutral mid-gray photo placeholder area, silver paper clip, neutral desk surface. Avoid readable text, avoid actual photo content, avoid SaaS blue or any UI styling. 1:1 aspect (or 3:2 wide variant for landscape OG thumbs — `link-wide.png`).

**한국어 보조**: 세로 구성 — 상단 40%는 회색 빈 사진 영역(은색 페이퍼클립으로 부착), 하단 60%는 빈 흰 인덱스 카드. **OG title·URL·thumbnail은 UI가 위에 깔음**. 사진/카드 영역 모두 빈 면. 디지털 UI 톤 금지.

**Variants**:
- 3:2 가로 변형 (`link-wide.png`) — 사진이 좌측, 카드가 우측인 가로 분할
- 페이퍼클립이 검정 더블클립으로 교체된 변형

---

## 11. Comment — 댓글·쪽지

**의미**: 짧은 메모·대화·의견 첨부.
**실물 컨셉**: 반으로 한 번 접힌 작은 흰 메모 슬립의 펼친 면 — 우상단에 작은 은색 페이퍼클립으로 고정. 본문 영역은 빈 흰 면, 좌측에 접힌 자국 그림자만 미세하게.

**Prompt (EN)**:
> A small white office memo slip resting flat on a neutral light-gray desktop, photographed from directly above. **A faint vertical fold crease runs about 6% from the left edge**, casting a delicate hairline shadow — suggesting the slip was once folded once and reopened. A tiny silver paper clip is attached to the upper-right corner of the slip. **The main writing surface is completely empty clean white paper**, no text, no marks, no signature. The paper has subtle fiber texture and one slightly worn lower edge. Soft natural daylight from upper-left, gentle shadow lower-right. Centered composition, slip occupies 85% of frame. Photorealistic, fine paper grain and brushed-metal clip detail. Color palette: white paper, faint graphite fold shadow, silver clip, neutral desk surface. Avoid yellow or aged paper, avoid speech-bubble shapes, avoid readable text, avoid signature marks. 1:1 aspect.

**한국어 보조**: 흰 메모 슬립 — 왼쪽에서 ~6% 지점에 미세한 세로 접힘 그림자 한 줄, 우상단에 작은 은색 페이퍼클립. 본문은 **빈 흰 면**(댓글 본문·작성자·시각은 UI가 위에 깔음). 누런 종이·말풍선 모양 금지.

**Variants**:
- 접힘이 가로(상단 ~10% 지점)인 변형
- 페이퍼클립이 검정 미니 더블클립으로 교체된 변형

---

## 일관성 체크리스트 (11종 모두 생성 후)

생성한 이미지들을 11장 한 화면에 나란히 놓고 다음 확인:

- [ ] 광원 방향이 모두 동일 (좌상단 45°)
- [ ] 배경 톤이 모두 같은 off-white / light gray 계열
- [ ] 카드/사물 크기(프레임 점유율)가 균일 (82–88% 범위)
- [ ] 그림자 강도가 비슷 (어느 하나만 진하지 않음)
- [ ] 전체가 노랗거나 베이지로 치우치지 않음
- [ ] 콘텐츠 영역(중앙 ~70%)이 **모두 비어있음** — 위에 UI를 얹어도 가독성 보장
- [ ] 사이드바 아이콘 17종과 같은 톤·재질감 (책상·종이·금속·흑연 일관)
- [ ] 디테일 수준이 같음 (어느 하나만 너무 정교/단순하지 않음)

일관성 깨진 게 있으면 그 1개만 다시 생성. 11개 한 번에 다시 돌리지 말 것 (token 낭비).

## 사이드바 17종과 합쳐서 체크하면 좋은 것

카드 베이스 11종 + 사이드바 아이콘 17종 = **총 28장**을 같은 시야에서 나란히 펴고:

- [ ] 책상 톤이 28장 전부 동일한 light gray
- [ ] 그림자 방향이 28장 전부 우하단
- [ ] 흰 종이 톤이 28장 전부 같은 off-white (한 장만 더 차갑거나 더 따뜻하지 않음)
- [ ] 금속 디테일(클립·핀·펜 그립)이 28장 전부 동일한 brushed steel 톤
- [ ] 노란 형광 / 빨간 핀 / 빨간 녹음 버튼 같은 작은 액센트가 28장 통틀어 채도가 비슷

---

## 모델별 팁

**nano-banana (Gemini 2.5 Flash Image)**:
- 한국어 prompt도 잘 이해. 단 영문이 더 일관됨.
- "the inner 70% of the card is completely empty" 같은 명시적 비율 지시가 잘 통함.
- aspect 1:1 명시 필수 (기본 4:3).
- "no readable text anywhere in the image" 두 번 강조 권장.

**GPT-4o Image**:
- 자연어 단락 prompt 선호. 위 EN prompt 그대로 투입 추천.
- "no text" / "illegible" / "blank" 명시 안 하면 가짜 글씨 들어감 — 3번씩 강조해도 무방.
- 한 번에 1장씩 — 11회 호출.

**Imagen / DALL-E 3**:
- "Style: photorealistic product photography, top-down flat lay" prefix 추가하면 더 안정적.
- 배경 제거가 까다로움 — 처음부터 "isolated on a neutral light-gray background" 지정 후 후처리.
- DALL-E 3는 "completely blank" 지시를 자주 어김 — 결과 검수 강화.

**Midjourney**:
- `--ar 1:1 --style raw --q 2` 파라미터 추가.
- "v6" 또는 "v7" 모델 사용.
- moss 톤 키워드: `neutral office still life, stationery flat lay product photography, soft daylight, real materials, blank surface`.

---

## 라이브 자산 디렉토리 컨벤션

생성한 이미지는 `web/public/cards/` 에 저장:

```
web/public/cards/
  text.png
  highlight.png
  checklist.png
  code.png
  image.png
  image-wide.png       # 3:2 가로 변형 (선택)
  file.png
  audio.png
  handwriting.png
  mindmap.png
  link.png
  link-wide.png        # 3:2 가로 변형 (선택)
  comment.png
```

retina 자산이라면 2x suffix 컨벤션:

```
text.png        (1024×1024)
text@2x.png     (2048×2048)
```

## 컴포넌트 적용 (참고)

`web/src/components/workspace/cards/CardContent.tsx`의 각 `*CardContent` 함수에서 최상위 `<div>`의 `style.background`를 다음과 같이 교체:

```tsx
// 예: TextCardContent
<div
  className="rounded-[6px] h-full flex flex-col relative"
  style={{
    minHeight: 80,
    backgroundImage: "url('/cards/text.png')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    boxShadow: "var(--shadow-card)",
  }}
>
```

기존 `var(--gradient-paper)` 그라데이션은 fallback으로 남겨두고, 이미지가 로드되면 위에 덮어쓰는 방식이 안전:

```tsx
style={{
  background:
    "url('/cards/text.png') center / cover no-repeat, var(--gradient-paper)",
  boxShadow: "var(--shadow-card)",
}}
```

콘텐츠 가독성이 떨어지면 카드 안쪽에 살짝 흰 반투명 레이어를 추가:

```tsx
<div className="absolute inset-0 bg-white/40 pointer-events-none rounded-[6px]" />
```

단, 베이스 이미지 자체가 콘텐츠 영역을 빈 흰 면으로 뽑혔다면 이 overlay는 불필요하다.
