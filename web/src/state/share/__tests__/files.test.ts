import { afterEach, describe, expect, test, vi } from "vitest";
import { AuthRequestError } from "@/state/auth";
import { realFilesApi } from "../files";

type Call = [string, RequestInit];

function stubFetch(response: Response): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return response;
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("share/files — n10a Ktor 첨부 계약", () => {
  test("upload는 multipart part 'file'로 POST하고 BoardFile을 돌려준다", async () => {
    const saved = { id: "f-1", name: "cat.png", size: 3, contentType: "image/png" };
    const calls = stubFetch(
      new Response(JSON.stringify(saved), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const file = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const result = await realFilesApi.upload("b1", file, "cat.png", "access");

    expect(result).toEqual(saved);
    const [url, init] = calls[0];
    expect(url).toBe("http://localhost:8080/boards/b1/files");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access");
    const form = init.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("file")).toBeTruthy();
  });

  test("download는 fileId 경로에서 blob을 받는다", async () => {
    const calls = stubFetch(new Response(new Uint8Array([9, 8]), { status: 200 }));

    const blob = await realFilesApi.download("b1", "f-1", "access");

    expect(blob.size).toBe(2);
    const [url, init] = calls[0];
    expect(url).toBe("http://localhost:8080/boards/b1/files/f-1");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer access");
  });

  test("실패 상태코드는 AuthRequestError로 전파한다", async () => {
    stubFetch(new Response(null, { status: 403 }));
    await expect(realFilesApi.upload("b1", new Blob(), "x", "access")).rejects.toBeInstanceOf(
      AuthRequestError,
    );
  });
});
