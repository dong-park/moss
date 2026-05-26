import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderCard } from "./setupCard";

/**
 * Image 카드 UX 테스트 — P2-A.
 * spec §6 P2-A 키보드 표:
 *   Esc → commit / Enter → alt commit / Tab → 메타 이동(기본) / Space → 파일 피커
 *
 * 자동 dialog open(mount 시 setTimeout 0)은 file input.click()을 1회 부르지만
 * jsdom에서 file 선택 없이 onChange 발생 없고 부수효과도 없어 무시 가능.
 */
describe("ImageCardContent · UX 강화", () => {
  it("render — cards/v2/image.png 표면과 placeholder가 표시된다", () => {
    const { container } = renderCard("image", { content: "", editing: false });

    // surface PNG가 background에 포함되는 컨테이너가 존재
    const surface = container.querySelector(
      "[style*=\"cards/v2/image.png\"]",
    ) as HTMLElement | null;
    expect(surface).not.toBeNull();

    // placeholder 텍스트 노출
    expect(screen.getByText("이미지를 선택하세요")).toBeTruthy();
  });

  it("Space — 이미지 영역 포커스 시 파일 피커(input.click) 호출", () => {
    const { container } = renderCard("image", { content: "", editing: false });

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const clickSpy = vi.spyOn(fileInput!, "click");

    const picker = screen.getByRole("button", {
      name: "이미지를 선택하세요",
    }) as HTMLElement;
    fireEvent.keyDown(picker, { key: " " });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it("alt 입력 — onChange로 alt 텍스트가 전달된다", () => {
    const { onChange } = renderCard("image", { content: "", editing: true });

    const altInput = screen.getByPlaceholderText("설명…") as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: "고양이 사진" } });

    expect(onChange).toHaveBeenCalledWith("고양이 사진");
  });

  it("Enter — alt 입력에서 commit이 호출된다", () => {
    const { onCommit } = renderCard("image", {
      content: "기존 alt",
      editing: true,
    });

    const altInput = screen.getByPlaceholderText("설명…") as HTMLInputElement;
    altInput.focus();
    fireEvent.keyDown(altInput, { key: "Enter" });
    // EditableLine은 Enter/Esc 시 blur → onCommit 발화

    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it("Esc — alt 입력에서 commit이 호출된다", () => {
    const { onCommit } = renderCard("image", {
      content: "alt",
      editing: true,
    });

    const altInput = screen.getByPlaceholderText("설명…") as HTMLInputElement;
    altInput.focus();
    fireEvent.keyDown(altInput, { key: "Escape" });

    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});
