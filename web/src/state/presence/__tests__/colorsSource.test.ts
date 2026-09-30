import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P2: 참여자 색은 colors.ts(SYSTEM_COLORS)가 단일 출처다. globals.css의
 * `--collab-1~8` 변수가 같은 값을 중복 정의하면 한쪽만 바뀌어 색이 어긋난다.
 */
describe("참여자 색 단일 출처", () => {
  it("globals.css는 --collab-* 색을 중복 정의하지 않는다", () => {
    const css = readFileSync(
      join(__dirname, "../../../app/globals.css"),
      "utf-8",
    );
    expect(css).not.toMatch(/--collab-[1-8]\s*:/);
  });
});
