/**
 * useAutoFocusOnEdit 단위 테스트 — FEAT-card-entry-mode §6 헬퍼.
 *  - isEditing=false: focus 호출 안 됨
 *  - isEditing=true: focus 호출
 *  - textarea ref: setSelectionRange(end, end) 호출
 *  - input ref: setSelectionRange(end, end) 호출
 */
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { useRef } from "react";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";

function TextareaHarness({
  editing,
  initialValue = "",
}: {
  editing: boolean;
  initialValue?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoFocusOnEdit(ref, editing);
  return <textarea ref={ref} defaultValue={initialValue} />;
}

function InputHarness({
  editing,
  initialValue = "",
}: {
  editing: boolean;
  initialValue?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useAutoFocusOnEdit(ref, editing);
  return <input ref={ref} type="text" defaultValue={initialValue} />;
}

function ButtonHarness({ editing }: { editing: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  useAutoFocusOnEdit(ref, editing);
  return (
    <button ref={ref} type="button">
      ok
    </button>
  );
}

describe("useAutoFocusOnEdit", () => {
  it("isEditing=false — focus 호출 안 됨", () => {
    const { container } = render(<TextareaHarness editing={false} />);
    const el = container.querySelector("textarea")!;
    expect(document.activeElement).not.toBe(el);
  });

  it("isEditing=true — mount 직후 focus 호출됨 (textarea)", () => {
    const { container } = render(<TextareaHarness editing={true} />);
    const el = container.querySelector("textarea")!;
    expect(document.activeElement).toBe(el);
  });

  it("isEditing=true — mount 직후 focus 호출됨 (input)", () => {
    const { container } = render(<InputHarness editing={true} />);
    const el = container.querySelector("input")!;
    expect(document.activeElement).toBe(el);
  });

  it("textarea ref — setSelectionRange(end, end) 호출", () => {
    const spy = vi.spyOn(
      HTMLTextAreaElement.prototype,
      "setSelectionRange",
    );
    render(<TextareaHarness editing={true} initialValue="hello" />);
    // selectionStart/End가 값 끝(5)으로 호출
    expect(spy).toHaveBeenCalledWith(5, 5);
    spy.mockRestore();
  });

  it("input ref — setSelectionRange(end, end) 호출", () => {
    const spy = vi.spyOn(HTMLInputElement.prototype, "setSelectionRange");
    render(<InputHarness editing={true} initialValue="abc" />);
    expect(spy).toHaveBeenCalledWith(3, 3);
    spy.mockRestore();
  });

  it("button ref — focus만, setSelectionRange 미호출", () => {
    const taSpy = vi.spyOn(
      HTMLTextAreaElement.prototype,
      "setSelectionRange",
    );
    const inSpy = vi.spyOn(HTMLInputElement.prototype, "setSelectionRange");
    const { container } = render(<ButtonHarness editing={true} />);
    const el = container.querySelector("button")!;
    expect(document.activeElement).toBe(el);
    expect(taSpy).not.toHaveBeenCalled();
    expect(inSpy).not.toHaveBeenCalled();
    taSpy.mockRestore();
    inSpy.mockRestore();
  });

  it("isEditing false → true 전이 시 focus 호출됨", () => {
    const Harness = ({ editing }: { editing: boolean }) => {
      const ref = useRef<HTMLTextAreaElement>(null);
      useAutoFocusOnEdit(ref, editing);
      return <textarea ref={ref} />;
    };
    const { container, rerender } = render(<Harness editing={false} />);
    const el = container.querySelector("textarea")!;
    expect(document.activeElement).not.toBe(el);
    rerender(<Harness editing={true} />);
    expect(document.activeElement).toBe(el);
  });
});
