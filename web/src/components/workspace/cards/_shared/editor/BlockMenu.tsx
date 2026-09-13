"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-sticky-redesign n4 — 메모 창 헤더의 블록 추가 메뉴(이미지·링크·녹음·파일).
 *
 * MemoExpandDialog가 Dialog.Content 전체를 MilkdownProvider로 감싸므로(헤더 +
 * 본문이 같은 인스턴스 공유) 이 컴포넌트도 useInstance()로 같은 에디터를 잡는다.
 *
 * 2단계 리뷰 결정 — 삽입 위치는 "커서 위치"다(문서 전체 직렬화→재파싱→교체 금지).
 * 트리거를 누르는 순간(onPointerDown, 메뉴가 열려 포커스를 훔치기 전)의 선택
 * 위치를 `cursorPosRef`에 저장해두고, 실제 삽입 시점엔 `parser(markdown)`으로
 * 새 블록 한 줄만 파싱해 그 문서 조각(Fragment)을 저장된 위치에 `tr.insert`한다
 * (imagePaste.ts의 insertImages가 쓰는 TextSelection+replaceSelectionWith와 같은
 * "한 트랜잭션에 노드만 삽입" 원리). 커서가 없으면(트리거 클릭 시 에디터가
 * 포커스를 갖고 있지 않았으면) 문서 끝에 붙인다. 기존 문서 내용은 건드리지
 * 않으므로 undo 한 번으로 삽입만 사라진다.
 *
 * 2단계 리뷰 P1-6 — 한도(이미지 10MB·파일/녹음 50MB)·지원 이미지 형식은
 * state/attachmentLimits.ts가 유일한 출처이고, 이미지·파일 저장은
 * canvasCapture.ts의 storeImageBlock/storeFileBlock을 그대로 쓴다(OPFS 저장 +
 * serializeBlock + 실패 토스트까지 한 곳에서 처리 — 중복 제거).
 * ───────────────────────────────────────────────────────────── */

import { useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { useInstance } from "@milkdown/react";
import type { Ctx } from "@milkdown/ctx";
import { editorViewCtx, parserCtx } from "@milkdown/core";

import { useT } from "@/i18n/Provider";
import { useToasts } from "@/state/notifications";
import { storeFileBlock, storeImageBlock } from "@/components/workspace/canvasCapture";
import { makeAttachmentFilename, putBlob } from "@/state/db/opfs";
import { serializeBlock } from "@/state/blocks";
import { MAX_ATTACHMENT_BYTES } from "@/state/attachmentLimits";

function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

export function BlockMenu() {
  const t = useT();
  const push = useToasts((s) => s.push);
  const [loading, getEditor] = useInstance();

  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [audioOpen, setAudioOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /* ── 커서 위치 캡처(리뷰 P1-3) ──────────────────────────────────
   * 메뉴가 열리기 직전(포인터다운) 시점의 선택 위치를 저장한다 — 그 뒤
   * 드롭다운·다이얼로그가 포커스를 가져가면 selection을 더는 신뢰할 수 없다. */
  const cursorPosRef = useRef<number | null>(null);

  const captureCursorPos = () => {
    if (loading) {
      cursorPosRef.current = null;
      return;
    }
    getEditor().action((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx);
      if (!view.hasFocus()) {
        cursorPosRef.current = null;
        return;
      }
      try {
        cursorPosRef.current = view.state.selection.$from.after(1);
      } catch {
        cursorPosRef.current = null;
      }
    });
  };

  /** 저장된 커서 위치(없으면 문서 끝)에 블록 한 줄을 새 문단으로 삽입한다. */
  const insertBlockMarkdown = (markdown: string) => {
    if (loading) return;
    getEditor().action((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx);
      const parser = ctx.get(parserCtx);
      const parsedDoc = parser(markdown);
      if (!parsedDoc) return;
      const { state } = view;
      const docSize = state.doc.content.size;
      const pos = cursorPosRef.current;
      const insertPos = pos != null && pos >= 0 && pos <= docSize ? pos : docSize;
      const tr = state.tr.insert(insertPos, parsedDoc.content);
      view.dispatch(tr.scrollIntoView());
      cursorPosRef.current = null;
    });
  };

  /* ── 마운트 해제 정리(리뷰 P1-1: 마이크 누수) ───────────────────
   * 녹음 중 창이 닫히거나 컴포넌트가 사라지면 MediaRecorder와 트랙을 반드시
   * 정지한다. onstop 핸들러를 먼저 떼어 언마운트 후 삽입 액션(getEditor 호출)이
   * 실행되지 않게 한다. */
  const mountedRef = useRef(true);
  const micTokenRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      micTokenRef.current += 1; // 진행 중인 getUserMedia 요청을 무효화한다.
      const rec = recorderRef.current;
      if (rec) {
        rec.ondataavailable = null;
        rec.onstop = null;
        if (rec.state !== "inactive") rec.stop();
        recorderRef.current = null;
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  /* ── 이미지 ─────────────────────────────────────────────────── */
  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const md = await storeImageBlock(file);
    if (md) insertBlockMarkdown(md);
  };

  /* ── 파일 ───────────────────────────────────────────────────── */
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const md = await storeFileBlock(file);
    if (md) insertBlockMarkdown(md);
  };

  /* ── 링크 ───────────────────────────────────────────────────── */
  const openLinkDialog = () => {
    setLinkUrl("");
    setLinkTitle("");
    setLinkOpen(true);
  };

  const submitLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const md = serializeBlock({ type: "link", url, title: linkTitle.trim() || undefined });
    if (!md) {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.linkInvalid") });
      return;
    }
    insertBlockMarkdown(md);
    setLinkOpen(false);
  };

  /* ── 녹음 ───────────────────────────────────────────────────── */
  const openAudioDialog = () => {
    setAudioOpen(true);
    setRecording(false);
    void startRecording();
  };

  const startRecording = async () => {
    const token = ++micTokenRef.current;
    if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.audioDenied") });
      setAudioOpen(false);
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.audioDenied") });
      setAudioOpen(false);
      return;
    }
    // 대기 중 취소됨(다이얼로그 닫힘·컴포넌트 언마운트) — 풀린 스트림을 즉시 버리고
    // 녹음을 시작하지 않는다(리뷰 P1-1).
    if (!mountedRef.current || token !== micTokenRef.current) {
      stream.getTracks().forEach((tr) => tr.stop());
      return;
    }
    streamRef.current = stream;
    const mimeType = pickAudioMimeType();
    const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    recorderRef.current = rec;
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamRef.current = null;
      recorderRef.current = null;
      const blob = new Blob(chunksRef.current, { type: mimeType ?? "audio/webm" });
      chunksRef.current = [];
      setAudioOpen(false);
      setRecording(false);
      if (blob.size === 0) return;
      if (blob.size > MAX_ATTACHMENT_BYTES) {
        push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.fileTooBig") });
        return;
      }
      try {
        const ref = await putBlob(makeAttachmentFilename(blob.type), blob);
        insertBlockMarkdown(serializeBlock({ type: "audio", ref }));
      } catch {
        push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.saveFailed") });
      }
    };
    setRecording(true);
    rec.start();
  };

  const stopRecording = () => {
    micTokenRef.current += 1; // 대기 중인 getUserMedia 요청도 함께 무효화.
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
      return;
    }
    // 레코더가 아직 없다(권한 대기 중) — 도착할 스트림은 토큰 불일치로 폐기된다.
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
  };

  const itemClass =
    "flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-text outline-none transition-colors data-[highlighted]:bg-panel";

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void onPickImage(e)}
      />
      <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => void onPickFile(e)} />

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t("workspace.memoEditor.blockMenu.label")}
            onPointerDown={captureCursorPos}
            className="flex h-7 items-center justify-center rounded px-2 text-xs text-text-soft transition-colors hover:bg-panel hover:text-text data-[state=open]:bg-panel"
          >
            + {t("workspace.memoEditor.blockMenu.label")}
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={6}
            className="z-[var(--z-panel)] min-w-40 rounded-lg border border-border bg-bg p-1 shadow-card-lift"
          >
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => imageInputRef.current?.click()}
            >
              {t("workspace.memoEditor.blockMenu.image")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={openLinkDialog}>
              {t("workspace.memoEditor.blockMenu.link")}
            </DropdownMenu.Item>
            <DropdownMenu.Item className={itemClass} onSelect={openAudioDialog}>
              {t("workspace.memoEditor.blockMenu.audio")}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => fileInputRef.current?.click()}
            >
              {t("workspace.memoEditor.blockMenu.file")}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {/* 링크 입력 */}
      <Dialog.Root open={linkOpen} onOpenChange={setLinkOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/40" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-80 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-3 shadow-card-lift focus:outline-none"
            aria-describedby={undefined}
          >
            <Dialog.Title className="mb-2 text-sm font-semibold text-text">
              {t("workspace.memoEditor.blockMenu.linkDialogTitle")}
            </Dialog.Title>
            <input
              autoFocus
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitLink();
                }
              }}
              placeholder={t("workspace.memoEditor.blockMenu.linkUrlPlaceholder")}
              className="mb-2 w-full rounded border border-border bg-bg px-2 py-1 text-sm text-text outline-none"
            />
            <input
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitLink();
                }
              }}
              placeholder={t("workspace.memoEditor.blockMenu.linkTitlePlaceholder")}
              className="mb-3 w-full rounded border border-border bg-bg px-2 py-1 text-sm text-text outline-none"
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close className="cursor-pointer rounded px-2 py-1 text-xs text-text-soft hover:bg-panel">
                {t("workspace.memoEditor.blockMenu.linkCancel")}
              </Dialog.Close>
              <button
                type="button"
                onClick={submitLink}
                className="cursor-pointer rounded bg-active-bg px-2 py-1 text-xs text-active-fg"
              >
                {t("workspace.memoEditor.blockMenu.linkSubmit")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* 녹음 */}
      <Dialog.Root
        open={audioOpen}
        onOpenChange={(o) => {
          if (!o) stopRecording();
          setAudioOpen(o);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-black/40" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-72 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-bg p-3 shadow-card-lift focus:outline-none"
            aria-describedby={undefined}
          >
            <Dialog.Title className="mb-2 text-sm font-semibold text-text">
              {t("workspace.memoEditor.blockMenu.audioDialogTitle")}
            </Dialog.Title>
            <div className="mb-3 flex items-center gap-2 text-sm text-text">
              {recording && (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: "var(--color-accent-red, #e1574f)" }}
                  aria-hidden
                />
              )}
              <span>{t("capture.audio.recording")}</span>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={stopRecording}
                className="cursor-pointer rounded bg-active-bg px-2 py-1 text-xs text-active-fg"
              >
                {t("workspace.memoEditor.blockMenu.audioStop")}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
