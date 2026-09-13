"use client";

/* ─────────────────────────────────────────────────────────────
 * FEAT-sticky-redesign n4 — 메모 창 헤더의 블록 추가 메뉴(이미지·링크·녹음·파일).
 *
 * MemoExpandDialog가 Dialog.Content 전체를 MilkdownProvider로 감싸므로(헤더 +
 * 본문이 같은 인스턴스 공유) 이 컴포넌트도 useInstance()로 같은 에디터를 잡는다.
 *
 * 삽입 전략: 커서 위치에 직접 노드를 꽂는 대신, 현재 문서를 마크다운으로
 * 직렬화(serializerCtx) → 새 블록 줄을 덧붙이고(state/blocks.ts의 serializeBlock) →
 * 전체를 다시 파싱(parserCtx)해 문서를 교체한다(entire-doc replace, @milkdown/utils
 * replaceAll과 동일 원리를 한 액션에 합침). 커서가 문서 끝이 아니어도 항상 "본문
 * 끝에 새 문단으로 추가"된다 — 정확한 커서 위치 삽입은 갭으로 남긴다(구현 메모).
 *
 * 각 블록 타입은 state/blocks.ts의 serializeBlock으로 문자열을 만든다 — 그래야
 * memoBlockDecorations(blockView.ts)가 같은 정규형을 인식해 위젯으로 그린다.
 * ───────────────────────────────────────────────────────────── */

import { useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { useInstance } from "@milkdown/react";
import type { Ctx } from "@milkdown/ctx";
import { editorViewCtx, parserCtx, serializerCtx } from "@milkdown/core";
import { Slice } from "@milkdown/prose/model";

import { useT } from "@/i18n/Provider";
import { useToasts } from "@/state/notifications";
import { makeAttachmentFilename, putBlob } from "@/state/db/opfs";
import { serializeBlock } from "@/state/blocks";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // FEAT-memo-image-paste와 동일 한도.
const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // spec §11: 녹음·파일 50MB.
const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

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

  /** 현재 문서 끝에 markdown 한 줄을 새 문단으로 덧붙이고 전체를 교체한다. */
  const appendMarkdown = (markdown: string) => {
    if (loading) return;
    getEditor().action((ctx: Ctx) => {
      const view = ctx.get(editorViewCtx);
      const serializer = ctx.get(serializerCtx);
      const parser = ctx.get(parserCtx);
      const current = serializer(view.state.doc);
      // commonmark는 "\n" 한 줄만으로는 같은 문단 안 줄바꿈(soft break)일 뿐이다 —
      // 새 문단(블록)으로 분리하려면 빈 줄("\n\n")이 필요하다(실경로 확인 중 발견).
      const next = current === "" ? markdown : `${current.replace(/\n+$/, "")}\n\n${markdown}`;
      const doc = parser(next);
      if (!doc) return;
      const tr = view.state.tr.replace(
        0,
        view.state.doc.content.size,
        new Slice(doc.content, 0, 0),
      );
      view.dispatch(tr.scrollIntoView());
    });
  };

  /* ── 이미지 ─────────────────────────────────────────────────── */
  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!SUPPORTED_IMAGE_TYPES.has(file.type)) {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.imageUnsupported") });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.imageTooBig") });
      return;
    }
    try {
      const ref = await putBlob(makeAttachmentFilename(file.type), file);
      appendMarkdown(serializeBlock({ type: "image", ref }));
    } catch {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.saveFailed") });
    }
  };

  /* ── 파일 ───────────────────────────────────────────────────── */
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.fileTooBig") });
      return;
    }
    try {
      const ref = await putBlob(makeAttachmentFilename(file.type), file);
      appendMarkdown(serializeBlock({ type: "file", ref, filename: file.name }));
    } catch {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.saveFailed") });
    }
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
    appendMarkdown(md);
    setLinkOpen(false);
  };

  /* ── 녹음 ───────────────────────────────────────────────────── */
  const openAudioDialog = () => {
    setAudioOpen(true);
    setRecording(false);
    void startRecording();
  };

  const startRecording = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices || typeof MediaRecorder === "undefined") {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.audioDenied") });
      setAudioOpen(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
          appendMarkdown(serializeBlock({ type: "audio", ref }));
        } catch {
          push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.saveFailed") });
        }
      };
      setRecording(true);
      rec.start();
    } catch {
      push({ tone: "warn", title: t("workspace.memoEditor.blockMenu.audioDenied") });
      setAudioOpen(false);
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
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
