import { describe, expect, it } from "vitest";
import {
  MEMO_LOD_SCALE,
  ZOOM_MIN_SCREEN_PX,
  firstLine,
  zoomCompensatedPx,
  zoomCompensatedSize,
} from "../zoomLod";

/**
 * 줌 역보정 + 메모 LOD 순수 유틸. 라벨 font-size가 --zoom을 쓰는지(줌마다 React
 * 리렌더 없이 CSS가 계산), 임계·첫 줄 추출이 계약대로인지 본다.
 */
describe("zoomLod · --zoom 역보정", () => {
  it("기본 라벨은 max(기본, calc(11px / var(--zoom))) 식을 만든다", () => {
    expect(zoomCompensatedPx(12)).toBe("max(12px, calc(11px / var(--zoom, 1)))");
    expect(ZOOM_MIN_SCREEN_PX).toBe(11);
  });

  it("clamp() 기본값도 그대로 감싼다", () => {
    expect(zoomCompensatedSize("clamp(8px, 4.5cqw, 10px)")).toBe(
      "max(clamp(8px, 4.5cqw, 10px), calc(11px / var(--zoom, 1)))",
    );
  });

  it("최소 화면 크기를 지정할 수 있다", () => {
    expect(zoomCompensatedPx(15, 13)).toBe(
      "max(15px, calc(13px / var(--zoom, 1)))",
    );
  });

  it("LOD 임계는 0.6", () => {
    expect(MEMO_LOD_SCALE).toBe(0.6);
  });
});

describe("zoomLod · firstLine", () => {
  it("첫 비어있지 않은 줄을 평문으로 뽑는다", () => {
    expect(firstLine("\n\n  \n첫 줄\n둘째 줄")).toBe("첫 줄");
  });

  it("마크다운 마커를 벗긴다", () => {
    expect(firstLine("# 제목\n본문")).toBe("제목");
    expect(firstLine("- 첫 항목\n- 둘째")).toBe("첫 항목");
    expect(firstLine("**굵게** 본문")).toBe("굵게 본문");
  });

  it("빈 문자열·공백뿐이면 빈 문자열", () => {
    expect(firstLine("")).toBe("");
    expect(firstLine("\n  \n")).toBe("");
  });
});
