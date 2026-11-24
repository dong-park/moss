import { describe, expect, test } from "bun:test";
import {
  BOARD_FIELDS, CONNECTION_FIELDS, LOCAL_REF_PREFIX, NOTE_FIELDS, PROVENANCE_FIELDS, escapeBlockLabel,
  fileBlockMarkdown, imageBlockMarkdown, isUploadFailedKey, localRefName, readFields, toLocalRef, toMarkdownUrl,
  unescapeBlockLabel, uploadFailedKey, writeFields,
} from "../src/index.ts";

describe("doc-model fields", () => {
  test("메모 필드에 color·textSize·autoWidth가 있고 기기 로컬 필드는 없다", () => {
    expect(NOTE_FIELDS).toContain("color");
    expect(NOTE_FIELDS).toContain("textSize");
    expect(NOTE_FIELDS).toContain("autoWidth");
    expect(NOTE_FIELDS).not.toContain("lastVisitedAt" as never);
    expect(BOARD_FIELDS).not.toContain("lastOpenedAt" as never);
    expect(BOARD_FIELDS).not.toContain("remote" as never);
    expect(new Set(CONNECTION_FIELDS).size).toBe(CONNECTION_FIELDS.length);
  });

  test("writeFields/readFields 왕복: undefined는 키를 만들지 않고 비원시 값은 버린다", () => {
    const store = new Map<string, unknown>();
    writeFields(store as never, { id: "n1", x: 3, color: undefined, title: null }, NOTE_FIELDS);
    expect(store.has("color")).toBe(false);
    store.set("content", { evil: true });
    expect(readFields(store as never, NOTE_FIELDS)).toEqual({ id: "n1", x: 3, title: null });
  });
});

describe("doc-model files map keys", () => {
  test("실패 표시 키는 첨부 참조와 겹치지 않고 서로 알아볼 수 있다", () => {
    const ref = `${LOCAL_REF_PREFIX}a.png`;
    expect(uploadFailedKey(ref)).toBe("!failed:opfs:a.png");
    expect(isUploadFailedKey(uploadFailedKey(ref))).toBe(true);
    expect(isUploadFailedKey(ref)).toBe(false);
    expect(localRefName(ref)).toBe("a.png");
    expect(localRefName("plain.png")).toBe("plain.png");
  });

  test("출처 칸은 메모·연결 필드 목록 밖에 있어 web이 읽고 쓰지 않는다", () => {
    for (const field of PROVENANCE_FIELDS) {
      expect(NOTE_FIELDS as readonly string[]).not.toContain(field);
      expect(CONNECTION_FIELDS as readonly string[]).not.toContain(field);
    }
  });
});

describe("doc-model block markdown", () => {
  test("참조 키와 본문 URL을 오가고, 이미지·파일 블록을 web 형식 그대로 만든다", () => {
    const ref = `${LOCAL_REF_PREFIX}mcp-1-a.pdf`;
    expect(toMarkdownUrl(ref)).toBe("opfs://mcp-1-a.pdf");
    expect(toLocalRef(toMarkdownUrl(ref))).toBe(ref);
    expect(imageBlockMarkdown(ref)).toBe("![](opfs://mcp-1-a.pdf)");
    expect(fileBlockMarkdown(ref, "a.pdf")).toBe('[a.pdf](opfs://mcp-1-a.pdf "moss-file")');
  });

  test("파일명의 괄호·따옴표·대괄호·역슬래시는 이스케이프되어 되돌아오고, 개행은 공백이 된다", () => {
    const name = '보고서 (최종) "v2" [초안] \\ 끝';
    const label = escapeBlockLabel(name);
    expect(label).toBe('보고서 \\(최종\\) \\"v2\\" [초안\\] \\\\ 끝');
    expect(unescapeBlockLabel(label)).toBe(name);
    expect(escapeBlockLabel("한 줄\n두 줄")).toBe("한 줄 두 줄");
  });
});
