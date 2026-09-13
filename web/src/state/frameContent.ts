/**
 * FEAT-sticky-redesign — 메모판(frame) Note.content 인코딩 단일 소스.
 *
 * 2단계 리뷰 P2: `JSON.stringify({name})`·기본값 "새 메모판"이 schema.ts(makeFrameNote)·
 * workspace.ts(renameFrame)·cards/frame/Content.tsx(parseFrameName) 세 곳에 흩어져
 * 있었다. 여기 하나로 모은다.
 */

export const FRAME_DEFAULT_NAME = "새 메모판";

interface FrameContentJson {
  name?: string;
}

/** 이름 → frame Note.content. trim 후 1~40자로 정규화, 빈 문자열은 기본 이름으로. */
export function encodeFrameContent(name?: string): string {
  const trimmed = (name ?? "").trim().slice(0, 40);
  const finalName = trimmed === "" ? FRAME_DEFAULT_NAME : trimmed;
  return JSON.stringify({ name: finalName } satisfies FrameContentJson);
}

/** frame Note.content → 표시용 이름. 파싱 실패·빈 이름은 기본값으로 폴백. */
export function decodeFrameContent(content: string): string {
  try {
    const parsed = JSON.parse(content) as FrameContentJson;
    const name = parsed.name?.trim();
    return name ? name : FRAME_DEFAULT_NAME;
  } catch {
    return FRAME_DEFAULT_NAME;
  }
}
