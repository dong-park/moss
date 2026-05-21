# moss 사이드바 아이콘 — 오피스 물품 이미지 생성 프롬프트

> Milanote 라인 SVG 아이콘 17종을 **사무실에서 실제로 쓰이는 물품 이미지**(메모패드·페이퍼클립·클립보드·서류 트레이·기계식 연필 등)로 대체하기 위한 프롬프트 모음.
> Google nano-banana (Gemini 2.5 Flash Image), GPT-4o Image, Imagen, DALL-E 3, Midjourney 등에 그대로 투입 가능.
> moss 정체성: "감독의 핀보드 · 조용한 사무 책상 · 정리된 지능감 · 미완성 허용". 디지털 cleanness 지양, **실물 오피스 물품·자연광·재질감** 우선.

---

## 0. 공통 스타일 가이드 (모든 프롬프트에 prepend)

```
- View: top-down, 90° overhead shot (or slight tilt within ±5°)
- Lighting: soft natural daylight from upper-left, gentle diffused shadow falling lower-right
- Surface: neutral matte office desktop in off-white or very light warm gray, subtle paper or laminate texture (or transparent background)
- Color palette: neutral office supplies. Use off-white paper, light gray plastic, brushed steel, graphite black, clear acrylic, muted cork, and small restrained accents only. Avoid an overall yellow or beige cast. NO SaaS blue, NO neon, NO oversaturation
- Object language: each icon should read as a distinct real office object, not a generic yellow paper object
- Composition: subject occupies ~60–70% of frame, perfectly centered
- Aspect: 1:1 square
- Realism: photorealistic OR high-fidelity 3D render. NOT illustrated, NOT cartoon, NOT line art, NOT flat icon
- Imperfection encouraged: slight curls, scuffs, dust specks, hand-touched feel, asymmetry. Resist digital perfection
- Text on objects: illegible (font hallucination 회피)
- Mood: quiet intelligence, a real office desk, a director's pinboard. Lived-in, not staged
```

## 출력 사양 (공통)

| 항목 | 값 |
|---|---|
| 비율 | 1:1 (정사각형) |
| 해상도 | 1024×1024 이상 (retina 자산용 2048×2048 권장) |
| 포맷 | PNG with alpha (배경 투명) 권장 |
| 색공간 | sRGB |
| 톤 | neutral office, real materials, daylight |

## 후처리 가이드

1. **배경 제거**: `remove.bg` 또는 Photoshop Magic Wand. 투명 PNG로 저장.
2. **사이즈 정규화**: 17개 모두 44×44 (retina 88×88) PNG로 export. 사물의 중심점·여백 일관성 유지.
3. **사이드바 적용**: 박스 안에 그대로 `<Image src="/icons/note.png" />`. 박스 배경은 `bg-box-white` 또는 투명.
4. **활성 상태 처리**: 활성 시 살짝 들어올려 보이는 효과 (CSS `transform: translateY(-1px)` + 강한 그림자). 컬러 박스(파란) 대체 가능 — 또는 활성 상태에서만 채색된 액자/핀 추가 이미지 사용.
5. **SVG 트레이싱 비권장**: 종이 결·자연 그림자 디테일 손실. PNG 그대로 사용.

---

## 1. Note — 메모지

**의미**: 짧은 메모, 즉시 캡처. 모든 사고의 출발점.
**실물 컨셉**: 흰 메모패드에서 뜯은 작은 사무용 메모지. 연한 회색 줄과 흐릿한 펜 메모.

**Prompt (EN)**:
> A single small white office memo pad sheet photographed from directly above, resting on a neutral light-gray office desktop. The sheet has very faint gray ruled lines and one slightly curled lower corner. Faint illegible ballpoint pen strokes suggest two or three quick notes. Soft natural daylight from upper-left, gentle diffused shadow falling lower-right. Centered composition, note occupies 65% of frame. Photorealistic, fine paper grain and subtle fiber visible. Color palette: clean white paper, pale gray ruling, graphite-black ink, neutral desk surface. Avoid yellow sticky-note color. No legible text, no logos. 1:1 aspect, transparent background preferred. Lived-in, hand-touched feel.

**한국어 보조**: 밝은 회색 사무 책상 위 흰 메모패드 종이 한 장. 연한 회색 줄, 모서리 살짝 들림, 흐릿한 펜 메모 2-3줄. 노란 포스트잇 느낌 금지.

**Variants**:
- 작은 흰 인덱스 카드 + 검정 볼펜 짧은 줄
- 메모패드 두 장이 살짝 겹친 형태

---

## 2. Link — 연결

**의미**: 외부 자료 첨부, 두 생각의 연결.
**실물 컨셉**: 사무실에서 쓰는 은색 페이퍼클립 두 개가 서로 걸린 모습.

**Prompt (EN)**:
> Two small silver paper clips interlocked at a 45° angle, photographed from directly above on a neutral light-gray office desktop. The clips are slightly bent from real use, with brushed stainless-steel highlights and tiny scratches catching soft daylight from upper-left. Centered composition, occupies 55% of frame. Macro photorealistic, detailed metal texture. Color palette: cool silver metal, soft graphite shadow, neutral desk surface. Avoid brass or yellow tones. 1:1 aspect, transparent background preferred. Soft shadow lower-right.

**한국어 보조**: 은색 페이퍼클립 두 개가 서로 걸린 모습. 약간 휘어진 사용감, 스테인리스 질감, 노란 금속 느낌 금지.

**Variants**:
- 은색 페이퍼클립 한 개를 크게
- 작은 검정 더블클립 두 개가 맞물린 형태

---

## 3. To-do — 할 일

**의미**: 정리되지 않은 작은 행동 목록.
**실물 컨셉**: 작은 사무용 클립보드에 체크리스트 종이가 끼워진 모습.

**Prompt (EN)**:
> A small office clipboard photographed from directly above on a neutral light-gray desk, holding a white checklist sheet. The top of the clipboard has a simple brushed-metal clip. The paper shows two faint checkbox rows; the top checkbox is marked with a soft graphite check mark and the bottom checkbox is empty. Beside each box are illegible short pencil scribbles suggesting tasks. Soft natural daylight from upper-left, gentle shadow lower-right. Centered, occupies 65% of frame. Photorealistic, visible paper fiber and subtle metal clip reflections. Color palette: white paper, light gray board, brushed steel, graphite marks. Avoid yellow paper. No legible text. 1:1 aspect, transparent background preferred.

**한국어 보조**: 작은 클립보드 위 흰 체크리스트. 상단 금속 클립, 체크박스 두 줄, 위는 체크, 아래는 빈 박스. 전체 노란 종이 느낌 금지.

**Variants**:
- 미니 체크리스트 패드 + 검정 더블클립
- 사무용 플래너 카드 + 체크 표시

---

## 4. Line — 선·연결

**의미**: 두 점/카드를 잇는 연결선. 사고의 흐름.
**실물 컨셉**: 교정용 빨간 연필 또는 얇은 제도용 선긋기 도구가 사선으로 놓인 모습.

**Prompt (EN)**:
> A single slim red editing pencil lying diagonally from bottom-left to top-right on a neutral light-gray office desktop, photographed from directly above. The pencil has a sharpened graphite-red tip, a matte lacquer body, and slight wear from office use. Soft natural daylight from upper-left casting a delicate shadow along the right side of the pencil. Centered composition, pencil spans 75% of the diagonal. Photorealistic, fine wood grain and muted red pigment visible on the tip. Color palette: muted red accent, natural wood tip, graphite shadow, neutral desk surface. Avoid warm yellow cast. 1:1 aspect, transparent background preferred.

**한국어 보조**: 사무실 교정용 빨간 연필 한 자루가 좌하 → 우상 사선으로 놓임. 끝이 뾰족하게 깎여있고 전체 톤은 중성 회색 배경 중심.

**Variants**:
- 투명 아크릴 자 한 개가 사선으로 놓인 형태
- 검정 제도용 펜 한 자루가 사선으로 놓인 형태

---

## 5. Board — 보드 (활성 상태 메인)

**의미**: 생각이 모이는 자유 캔버스. moss 메인 메타포.
**실물 컨셉**: 사무실 코르크 보드 미니어처에 흰 메모 4장이 핀으로 꽂힌 모습.

**Prompt (EN)**:
> A small square office cork pinboard photographed from directly above, with four small white paper notes pinned to it in a loose 2x2 grid arrangement. The pins are mixed office push-pins in muted black, steel, and one restrained red accent. Each note has illegible faint pencil markings. The cork texture is natural and matte with visible grain, but not overly yellow. Soft natural daylight from upper-left, casting subtle shadows from the pins and curling note corners. Centered composition, board occupies 75% of frame. Photorealistic. Color palette: muted cork brown, white paper, steel/black pins, one small red accent. Avoid a golden/yellow overall tone. 1:1 aspect, transparent background preferred.

**한국어 보조**: 미니 사무용 코르크 보드에 흰 메모 4장. 검정/은색 핀과 작은 빨간 포인트 핀. 코르크가 노랗게 과장되지 않게.

**Variants** (활성용 강조 버전):
- 같은 보드 + 살짝 들어올려진 각도 (떠 있는 느낌, 활성 상태용)
- 메모 5장 (1장은 비뚤게, 살아있는 느낌)

---

## 6. Column — 컬럼

**의미**: 정렬된 항목 묶음, 카드의 세로 스택.
**실물 컨셉**: 회색 탭이 달린 흰 파일 폴더 또는 서류 카드가 세로로 정렬된 작은 더미.

**Prompt (EN)**:
> A neat vertical stack of about five white office file cards with small pale-gray tabs, photographed from directly above on a neutral light-gray desk. The top card has a single horizontal dark ink line near the top edge, suggesting a header. The stack edges are slightly uneven, with a hand-stacked office feel. Soft natural daylight from upper-left, layered shadows between cards. Centered composition, stack occupies 60% of frame. Photorealistic, paper fiber, tab edges, and slight handling marks visible. Color palette: white paper, pale gray tabs, soft ink black, neutral desk surface. Avoid cream/yellow dominance. 1:1 aspect, transparent background preferred.

**한국어 보조**: 회색 탭이 달린 흰 사무용 파일 카드 5장이 세로 스택으로 정렬됨. 맨 위에 검정 잉크 가로선 하나. 노란 종이 더미처럼 보이지 않게.

**Variants**:
- 얇은 회색 플라스틱 서류 트레이에 쌓인 흰 카드
- 탭 폴더 3장이 살짝 계단식으로 겹친 형태

---

## 7. Comment — 댓글·쪽지

**의미**: 짧은 메모/대화/의견 첨부.
**실물 컨셉**: 사무실 메모 슬립이 반으로 접혀 있고 작은 클립으로 고정된 모습.

**Prompt (EN)**:
> A small white office memo slip folded once like a short comment note, held at one corner by a tiny silver paper clip, photographed from directly above on a neutral light-gray desk. The fold crease is crisp, casting a delicate line of shadow. The paper has faint illegible pencil writing visible. Soft natural daylight from upper-left, gentle shadow lower-right. Centered composition, note occupies 60% of frame. Photorealistic, fine paper grain, subtle metal clip detail. Color palette: white paper, graphite writing, silver clip, neutral desk surface. Avoid yellow or aged paper tones. 1:1 aspect, transparent background preferred.

**한국어 보조**: 반으로 접힌 흰 메모 슬립 한 장과 작은 은색 페이퍼클립. 접힌 자국, 흐릿한 연필 글씨. 누런 종이 느낌 금지.

**Variants**:
- 작은 말풍선 모양 점착 메모 대신 흰 사무 메모 슬립
- 검정 미니 더블클립으로 고정된 코멘트 카드

---

## 8. More — 더보기

**의미**: 추가 옵션, 숨겨진 항목.
**실물 컨셉**: 작은 검정 압정 머리 3개 또는 미니 더블클립 3개가 가로로 나란히 놓인 모습.

**Prompt (EN)**:
> Three small black office push-pin heads lined up horizontally with even spacing on a neutral light-gray desk, photographed from directly above. Each pin head is round, slightly glossy, and subtly different from use, with a faint highlight from soft natural daylight from upper-left. Gentle shadows fall lower-right. Centered composition, the three pin heads together occupy 60% of frame width. Photorealistic, detailed plastic and metal rim texture. Color palette: charcoal black, soft graphite highlights, neutral desk surface. Avoid stones, ink dots, yellow paper, or decorative objects. 1:1 aspect, transparent background preferred.

**한국어 보조**: 검정 사무용 압정 머리 3개가 가로로 같은 간격. 둥글고 약간 광택 있음. 돌이나 잉크 자국처럼 보이지 않게.

**Variants**:
- 검정 미니 더블클립 3개를 아주 작게 나열
- 검정 자석 3개를 나란히 배치

---

## 9. Add image — 이미지 추가

**의미**: 시각 자료 첨부. 폴라로이드/사진.
**실물 컨셉**: 사무용 사진 출력물 한 장이 클립으로 고정된 모습.

**Prompt (EN)**:
> A small matte photo print with a clean white border, lying on a neutral light-gray office desktop and held at the top edge by a small silver paper clip, photographed from directly above. The photo image area shows a softly blurred neutral landscape or abstract reference image with no recognizable subject. One corner of the print is slightly raised, casting a soft shadow. Soft natural daylight from upper-left. Centered composition, photo print occupies 70% of frame. Photorealistic, paper grain and subtle photo sheen. Color palette: white border, neutral gray desk, muted image colors, silver clip. Avoid vintage yellow polaroid aging and golden cast. 1:1 aspect, transparent background preferred.

**한국어 보조**: 흰 테두리의 작은 사진 출력물 한 장, 상단에 은색 페이퍼클립. 사진 안은 흐릿한 중성 톤 이미지. 빈티지 노란 폴라로이드 느낌 금지.

**Variants**:
- 작은 사진 프린트 + 검정 더블클립
- 사진 프루프 시트 한 장

---

## 10. Upload — 업로드

**의미**: 외부 파일을 가져옴.
**실물 컨셉**: 사무용 인박스 트레이에 서류 한 장이 들어가거나 빠져나오는 모습.

**Prompt (EN)**:
> A shallow light-gray plastic office inbox tray with a single white sheet of paper halfway sliding into it, photographed from directly above on a neutral office desktop. The paper sheet has faint illegible printed marks and a slight lifted corner. The tray has subtle molded plastic edges and small scuffs from use. Soft natural daylight from upper-left, layered shadows between paper and tray. Centered composition, tray plus paper occupies 65% of frame. Photorealistic, visible paper fiber and plastic texture. Color palette: white paper, light gray plastic tray, graphite marks, neutral desk surface. Avoid cream envelope or yellow paper tone. 1:1 aspect, transparent background preferred.

**한국어 보조**: 밝은 회색 사무용 인박스 트레이에 흰 서류 한 장이 절반 들어가는 모습. 플라스틱 트레이 질감, 흰 종이. 봉투/노란 종이 느낌 금지.

**Variants**:
- 얇은 금속 서류 트레이 + 흰 문서
- 파일 홀더에 문서가 꽂히는 모습

---

## 11. Draw — 그리기

**의미**: 손글씨/스케치 도구.
**실물 컨셉**: 사무실에서 쓰는 검정 기계식 연필 또는 제도 샤프 한 자루가 사선으로 놓임.

**Prompt (EN)**:
> A single black mechanical pencil with a fine graphite tip and small metal grip, lying diagonally on a neutral light-gray office desktop, photographed from directly above. The pencil body has matte black plastic, subtle scuffs, a brushed-steel tip, and a tiny eraser cap. Soft natural daylight from upper-left, casting a delicate shadow along its right side. Centered composition, pencil spans 75% of the diagonal. Photorealistic, fine graphite and metal texture visible. Color palette: matte black, brushed steel, graphite, neutral desk surface. Avoid yellow wooden pencil color. 1:1 aspect, transparent background preferred.

**한국어 보조**: 검정 기계식 연필 또는 제도 샤프 한 자루. 금속 그립과 흑연 팁, 무광 검정 바디. 노란 나무 연필 느낌 금지.

**Variants**:
- 검정 파인라이너 펜 한 자루
- 샤프와 얇은 지우개가 겹쳐진 형태

---

## 12. Trash — 휴지통

**의미**: 버려진 메모/구겨진 생각.
**실물 컨셉**: 작은 금속 메시 휴지통 안에 흰 구겨진 종이가 들어있는 모습.

**Prompt (EN)**:
> A small round silver wire-mesh office trash bin viewed from directly above, with one crumpled white paper ball inside. The paper ball is lightly crushed by hand, with natural folds and faint illegible pencil marks on exposed surfaces. The mesh bin has fine metal grid texture and subtle reflections. Soft natural daylight from upper-left, gentle internal shadows inside the bin. Centered composition, trash bin occupies 60% of frame. Photorealistic, fine paper fiber and metal mesh detail visible. Color palette: white paper, cool silver mesh, graphite marks, neutral shadow. Avoid cream/yellow paper dominance. 1:1 aspect, transparent background preferred.

**한국어 보조**: 작은 은색 금속 메시 휴지통을 위에서 본 모습. 안에 흰 구겨진 종이 한 덩이. 누런 종이보다 흰 종이와 은색 금속 질감 중심.

**Variants**:
- 흰 구겨진 종이 한 덩이만 단순하게
- 회색 플라스틱 미니 휴지통 + 흰 종이

---

## 13. Code — 코드

**의미**: 코드 블록, 개발 메모, 구조화된 스니펫.
**실물 컨셉**: 작은 흰 인덱스 카드에 코드처럼 보이는 기호가 인쇄되고, 검정 파인라이너 펜이 곁에 놓인 모습.

**Prompt (EN)**:
> A small white office index card photographed from directly above on a neutral light-gray office desktop, with a few dark graphite marks resembling a code snippet: angle-bracket-like symbols, slashes, and short indented lines, but no readable words. A slim black fine-liner pen rests partly beside the card at a slight diagonal. The paper has crisp edges, faint handling marks, and subtle fiber texture. Soft natural daylight from upper-left, gentle diffused shadow lower-right. Centered composition, card and pen occupy 65% of frame. Photorealistic, real office stationery materials. Color palette: white paper, graphite-black ink, matte black pen, brushed steel pen tip, neutral desk surface. Avoid screens, keyboards, glowing UI, blue SaaS colors, or legible text. 1:1 aspect, transparent background preferred.

**한국어 보조**: 작은 흰 인덱스 카드에 코드처럼 보이는 꺾쇠·슬래시·들여쓰기 선이 있지만 읽을 수 있는 단어는 없음. 옆에 검정 파인라이너 펜. 화면/키보드/디지털 UI 느낌 금지.

**Variants**:
- 프린트된 코드 조각이 있는 흰 종이 카드 + 검정 더블클립
- 모서리가 살짝 접힌 개발 메모 카드 + 제도 샤프

---

## 14. Highlight — 강조

**의미**: 인용·하이라이트·중요 문장 표시.
**실물 컨셉**: 무채색 사무용 형광펜과 노란 강조선이 그어진 흰 메모 슬립.

**Prompt (EN)**:
> A neutral gray office highlighter pen lying beside a small white memo slip, photographed from directly above on a light-gray office desktop. The memo slip has one soft muted-yellow highlighted stripe across faint illegible pencil marks. The highlighter has a matte light-gray barrel, a chisel tip with restrained yellow ink, and slight scuffs from use. Soft natural daylight from upper-left, gentle shadow lower-right. Centered composition, objects occupy 65% of frame. Photorealistic, visible paper grain and plastic marker texture. Color palette: white paper, light-gray plastic, graphite marks, one muted yellow highlight accent, neutral desk surface. Avoid neon yellow, oversaturation, readable text, or digital marker icons. 1:1 aspect, transparent background preferred.

**한국어 보조**: 흰 메모 슬립 위에 차분한 노란 강조선 한 줄, 옆에 밝은 회색 형광펜. 네온 형광색이나 디지털 아이콘 느낌 금지.

**Variants**:
- 노란 강조선이 그어진 작은 인쇄물 + 은색 페이퍼클립
- 뚜껑이 열린 회색 형광펜 한 자루

---

## 15. Audio — 녹음

**의미**: 음성 캡처, 녹음 시작, 말로 남긴 생각.
**실물 컨셉**: 작은 검정 디지털 보이스 레코더 또는 회의용 녹음기.

**Prompt (EN)**:
> A compact black digital voice recorder photographed from directly above on a neutral light-gray office desktop. The recorder has a matte black body, tiny speaker grille holes, a small blank dark display with no readable text, and one restrained red record button. Slight scuffs and fingerprints make it feel used, not pristine. Soft natural daylight from upper-left, gentle shadow lower-right. Centered composition, recorder occupies 60% of frame. Photorealistic, detailed plastic, rubber button, and brushed metal microphone grille textures. Color palette: graphite black, dark gray, tiny muted red accent, neutral desk surface. Avoid microphones on stands, music equipment, glowing screens, waveform graphics, logos, or legible text. 1:1 aspect, transparent background preferred.

**한국어 보조**: 작은 검정 보이스 레코더. 빈 어두운 디스플레이, 스피커 구멍, 작은 빨간 녹음 버튼. 마이크 스탠드나 음악 장비처럼 보이지 않게.

**Variants**:
- 미니 회의용 레코더 + 작은 은색 클립
- 검정 휴대용 녹음기와 짧은 회색 케이블

---

## 16. Mindmap — 마인드맵

**의미**: 중심 생각에서 가지를 뻗는 구조.
**실물 컨셉**: 작은 흰 메모 카드 여러 장이 얇은 실과 핀으로 연결된 핀보드 조각.

**Prompt (EN)**:
> Four small white office memo cards arranged like a simple mind map, photographed from directly above on a neutral light-gray office desktop. One central card is connected to three surrounding cards with thin gray cotton thread and tiny office push-pins. Each card has faint illegible pencil marks, slightly uneven paper edges, and subtle curled corners. Pins are muted black, steel, and one restrained red accent. Soft natural daylight from upper-left, gentle shadows from the thread and raised paper corners. Centered composition, cluster occupies 70% of frame. Photorealistic, tactile paper, thread, and pin materials. Color palette: white paper, graphite marks, gray thread, steel/black pins, one muted red accent, neutral desk surface. Avoid digital node graphs, bright colors, or readable text. 1:1 aspect, transparent background preferred.

**한국어 보조**: 중앙 흰 메모 카드 1장과 주변 카드 3장이 얇은 회색 실과 핀으로 연결된 모습. 디지털 노드 그래프가 아니라 실제 책상 위 핀보드 조각처럼.

**Variants**:
- 작은 코르크 조각 위에 카드 4장 + 실 연결
- 중심 카드와 주변 인덱스 카드 3장, 선 대신 가는 연필선

---

## 17. Signals — 시그널스

**의미**: 반복 패턴, 연결 제안, 사고의 흐름을 비춰주는 AI 패널.
**실물 컨셉**: 투명 아크릴 확대 렌즈가 작은 연결 지도 메모 위에 놓인 모습.

**Prompt (EN)**:
> A small white analysis note card on a neutral light-gray office desktop, photographed from directly above, with a clear acrylic magnifying lens placed over a tiny cluster of graphite dots connected by faint lines. The note card has no readable words, only subtle marks suggesting patterns and connections. One small muted red pin marks a single signal point. The acrylic lens has realistic transparent edges and a soft highlight, but no strong reflections. Soft natural daylight from upper-left, gentle diffused shadow lower-right. Centered composition, card and lens occupy 65% of frame. Photorealistic, real office materials: paper fiber, clear acrylic, graphite, tiny push-pin. Color palette: white paper, graphite gray, clear acrylic, steel/black pin, one muted red accent, neutral desk surface. Avoid radar screens, sparkle icons, glowing UI, sci-fi styling, blue SaaS colors, logos, or readable text. 1:1 aspect, transparent background preferred.

**한국어 보조**: 작은 분석 메모 카드 위에 투명 아크릴 확대 렌즈. 렌즈 아래에는 점과 흐린 연결선, 작은 빨간 핀 하나. 레이더 화면·반짝이·AI 느낌의 빛나는 UI 금지.

**Variants**:
- 투명 확대경 + 연결선이 그어진 흰 인덱스 카드
- 작은 메모 3장 위에 붉은 핀 하나와 흐린 연필 연결선

---

## 일관성 체크리스트 (17개 모두 생성 후)

생성한 이미지들을 17장 한 화면에 나란히 놓고 다음 확인:

- [ ] 광원 방향이 모두 동일 (좌상단 45°)
- [ ] 배경 톤이 모두 같은 off-white / light gray 계열
- [ ] 사물 크기(프레임 점유율)가 균일 (55–75% 범위)
- [ ] 그림자 강도가 비슷 (어느 하나만 진하지 않음)
- [ ] 전체가 노랗거나 베이지로 치우치지 않음
- [ ] 물품별 재질이 구분됨 (종이, 금속, 플라스틱, 코르크, 흑연)
- [ ] 디테일 수준이 같음 (어느 하나만 너무 정교/단순하지 않음)

일관성 깨진 게 있으면 그 1개만 다시 생성. 17개 한 번에 다시 돌리지 말 것 (token 낭비).

## 모델별 팁

**nano-banana (Gemini 2.5 Flash Image)**:
- 한국어 prompt도 잘 이해. 단 영문이 더 일관됨.
- "photorealistic, top-down, neutral light-gray office desktop" 강조어 작동 잘함.
- aspect 1:1 명시 필수 (기본 4:3).

**GPT-4o Image**:
- 자연어 단락 prompt 선호. 위 EN prompt 그대로 투입 추천.
- "no text" / "illegible text" 명시 안 하면 가짜 글씨 들어감.
- 한 번에 1장씩 — 17회 호출.

**Imagen / DALL-E 3**:
- "Style: photorealistic product photography" prefix 추가하면 더 안정적.
- 배경 제거가 까다로움 — 처음부터 "isolated on a perfectly flat solid chroma-key background" 또는 "isolated on a neutral light-gray background" 지정 후 후처리.

**Midjourney**:
- `--ar 1:1 --style raw --q 2` 파라미터 추가.
- "v6" 또는 "v7" 모델 사용.
- moss 톤 키워드: `neutral office still life, stationery product photography, soft daylight, real materials`.

---

## 라이브 자산 디렉토리 컨벤션

생성한 이미지는 `web/public/icons/` 에 저장:

```
web/public/icons/
  note.png
  link.png
  todo.png
  line.png
  board.png
  board-active.png   # 활성 상태용 (들어올린 각도)
  column.png
  comment.png
  more.png
  image.png
  upload.png
  draw.png
  code.png
  highlight.png
  audio.png
  mindmap.png
  signals.png
  trash.png
```

`Sidebar.tsx`에서 라인 SVG 컴포넌트를 `<img src="/icons/note.png" />`로 교체. retina 자산이라면 2x suffix 컨벤션:

```
note.png        (44×44)
note@2x.png     (88×88)
```

또는 SVG 컨테이너 안에서 `<image>` 태그로 임베드 (CSS filter 적용 가능).
