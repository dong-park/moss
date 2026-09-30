import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const resolveAttachment = vi.fn();
let filesChanged: (() => void) | null = null;
vi.mock("@/state/share/attachments", () => ({
  resolveAttachment: (...args: unknown[]) => resolveAttachment(...args),
  onFilesMapChange: (cb: () => void) => {
    filesChanged = cb;
    return () => {};
  },
}));

import { usePhotoUrl } from "@/components/workspace/cards/photo/usePhotoUrl";

const revoke = vi.fn();
URL.revokeObjectURL = revoke;

afterEach(() => {
  resolveAttachment.mockReset();
  revoke.mockReset();
  filesChanged = null;
});

describe("usePhotoUrl", () => {
  it("이미 그린 사진은 files 맵이 바뀌어도 다시 풀지 않는다", async () => {
    resolveAttachment.mockResolvedValue({ state: "ready", url: "blob:a" });
    const { result } = renderHook(() => usePhotoUrl("opfs:a.png"));
    await waitFor(() => expect(result.current.state).toBe("ready"));

    act(() => filesChanged?.());
    act(() => filesChanged?.());
    expect(resolveAttachment).toHaveBeenCalledTimes(1);
  });

  it("자리표시자인 동안에는 files 맵 변화에 다시 푼다", async () => {
    resolveAttachment.mockResolvedValueOnce({ state: "pending", url: null });
    resolveAttachment.mockResolvedValueOnce({ state: "ready", url: "blob:b" });
    const { result } = renderHook(() => usePhotoUrl("opfs:b.png"));
    await waitFor(() => expect(result.current.state).toBe("pending"));

    act(() => filesChanged?.());
    await waitFor(() => expect(result.current.state).toBe("ready"));
  });

  it("언마운트 뒤 도착한 URL도 회수한다", async () => {
    let finish: (v: unknown) => void = () => {};
    resolveAttachment.mockReturnValue(new Promise((r) => (finish = r)));
    const { unmount } = renderHook(() => usePhotoUrl("opfs:c.png"));
    unmount();

    await act(async () => finish({ state: "ready", url: "blob:late" }));
    expect(revoke).toHaveBeenCalledWith("blob:late");
  });

  it("참조가 없으면 바로 missing이다", () => {
    const { result } = renderHook(() => usePhotoUrl(undefined));
    expect(result.current.state).toBe("missing");
    expect(resolveAttachment).not.toHaveBeenCalled();
  });
});
