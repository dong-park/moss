/**
 * FEAT-collab-auth n10 — Ktor 보드 첨부 API 클라이언트 (n10a 서버 계약).
 *
 * `POST /boards/{id}/files` — multipart, part 이름 `file`. 성공 201 + `{id,name,size,contentType}`.
 * `GET /boards/{id}/files/{fileId}` — 원본 bytes. 둘 다 Bearer 인증, 보드 멤버만.
 *
 * 로그인 안 한 경로(혼자 쓰는 보드)는 이 모듈을 부르지 않으므로 네트워크 0건이다 (AC-1).
 */
import { apiBaseUrl, AuthRequestError } from "@/state/auth";

export interface BoardFile {
  /** 서버 발급 UUID. Y.Doc의 `files` 맵 값으로 동기화된다. */
  id: string;
  name: string;
  size: number;
  contentType: string;
}

export interface FilesApi {
  upload(
    boardId: string,
    file: Blob,
    filename: string,
    accessToken: string,
  ): Promise<BoardFile>;
  download(boardId: string, fileId: string, accessToken: string): Promise<Blob>;
}

export const realFilesApi: FilesApi = {
  async upload(boardId, file, filename, accessToken) {
    const form = new FormData();
    // Content-Type을 직접 지정하지 않는다 — 브라우저가 multipart boundary를 붙인다.
    form.append("file", file, filename);
    const res = await fetch(`${apiBaseUrl()}/boards/${encodeURIComponent(boardId)}/files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!res.ok) {
      throw new AuthRequestError(`POST files ${res.status}`, res.status);
    }
    return (await res.json()) as BoardFile;
  },

  async download(boardId, fileId, accessToken) {
    const res = await fetch(
      `${apiBaseUrl()}/boards/${encodeURIComponent(boardId)}/files/${encodeURIComponent(fileId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!res.ok) {
      throw new AuthRequestError(`GET file ${res.status}`, res.status);
    }
    return await res.blob();
  },
};
