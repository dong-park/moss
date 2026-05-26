"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { getBlobUrl, makeAttachmentFilename, putBlob } from "@/state/db/opfs";
import { useT } from "@/i18n/Provider";
import { cardSurface } from "../_shared/surface";
import { useAutoFocusOnEdit } from "../_shared/useAutoFocusOnEdit";
import type { CardContentProps } from "../_shared/types";

/* ─────────────────────────────────────────────────────────────
 * Audio — MediaRecorder 자동 시작, 정지 시 OPFS 저장.
 * 녹음 완료(attachmentRef 보유) 후에는 재생 UI + 표준 미디어 단축키
 * (Space 재생/일시정지, ←/→ 5초 탐색, M 음소거)를 노출한다.
 * Esc는 모든 상태에서 commit (편집 종료).
 * ───────────────────────────────────────────────────────────── */

const audioStartedFor = new Set<string>();
const SEEK_STEP_SEC = 5;

interface RecorderState {
  status: "idle" | "recording" | "denied" | "unsupported";
  elapsedMs: number;
  durationMs: number | null;
}

function pickAudioMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported?.(c)) return c;
  }
  return undefined;
}

export function AudioCardContent({
  card,
  editing,
  onCommitEdit,
}: CardContentProps) {
  const t = useT();
  const setAttachment = useWorkspace((s) => s.setAttachment);
  const [state, setState] = useState<RecorderState>(() => ({
    status: "idle",
    elapsedMs: 0,
    durationMs: null,
  }));
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // ── 재생 (attachmentRef 있을 때) ─────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // FEAT-card-entry-mode §6: audio 자동 포커스 타겟 = button[data-card-record].
  // 녹음 시작/정지 버튼 모두에 같은 attr을 부여하고 mount 직후 ref가 가리키는 버튼에 포커스.
  const recordButtonRef = useRef<HTMLButtonElement>(null);
  useAutoFocusOnEdit(recordButtonRef, editing && !card.attachmentRef);

  const stopRecording = useCallback(() => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setState((s) => ({ ...s, status: "unsupported" }));
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setState((s) => ({ ...s, status: "unsupported" }));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const finalMs =
          startedAtRef.current !== null
            ? Date.now() - startedAtRef.current
            : 0;
        const blob = new Blob(chunksRef.current, {
          type: mimeType ?? "audio/webm",
        });
        chunksRef.current = [];
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setState({ status: "idle", elapsedMs: 0, durationMs: finalMs });
        if (blob.size > 0) {
          try {
            const filename = makeAttachmentFilename(blob.type);
            const ref = await putBlob(filename, blob);
            setAttachment(card.id, ref, {
              content: `${Math.round(finalMs / 1000)}s`,
              mediaType: blob.type,
            });
          } catch (err) {
            console.warn("OPFS putBlob failed", err);
          }
        }
      };
      startedAtRef.current = Date.now();
      setState({ status: "recording", elapsedMs: 0, durationMs: null });
      rec.start();
    } catch (err) {
      const name = (err as { name?: string } | undefined)?.name;
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setState({ status: "denied", elapsedMs: 0, durationMs: null });
      } else {
        setState({ status: "unsupported", elapsedMs: 0, durationMs: null });
      }
    }
  }, [card.id, setAttachment]);

  // 자동 시작 (1회). startRecording은 async — setState는 await 이후에 일어남.
  useEffect(() => {
    if (!editing) return;
    if (card.attachmentRef) return;
    if (audioStartedFor.has(card.id)) return;
    audioStartedFor.add(card.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async sync from external (getUserMedia)
    void startRecording();
  }, [editing, card.attachmentRef, card.id, startRecording]);

  // 카드 unmount → 진행 중인 녹음 정지
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* noop */
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // 경과 시간 timer
  useEffect(() => {
    if (state.status !== "recording") return;
    const id = window.setInterval(() => {
      const start = startedAtRef.current ?? Date.now();
      setState((s) =>
        s.status === "recording"
          ? { ...s, elapsedMs: Date.now() - start }
          : s,
      );
    }, 200);
    return () => window.clearInterval(id);
  }, [state.status]);

  // attachmentRef → blob URL (재생용)
  useEffect(() => {
    let cancelled = false;
    const ref = card.attachmentRef;
    // null 케이스도 promise 콜백에서 set하여 effect 본문 동기 setState를 피한다
    // (react-hooks/set-state-in-effect).
    void Promise.resolve(ref ? getBlobUrl(ref) : null).then((url) => {
      if (!cancelled) setAudioUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [card.attachmentRef]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play();
    } else {
      el.pause();
    }
  }, []);

  const seek = useCallback((deltaSec: number) => {
    const el = audioRef.current;
    if (!el) return;
    const next = (el.currentTime ?? 0) + deltaSec;
    el.currentTime = Math.max(0, next);
  }, []);

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }, []);

  /**
   * 카드 컨테이너 키보드. attachmentRef 부재(녹음 전·중·실패) 상태에서는
   * 미디어 단축키가 의미 없으므로 Esc만 처리. attachmentRef 있을 때만 Space/←→/M 활성.
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCommitEdit();
      return;
    }
    if (!card.attachmentRef) return;
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      seek(-SEEK_STEP_SEC);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      seek(SEEK_STEP_SEC);
    } else if (e.key === "m" || e.key === "M") {
      e.preventDefault();
      toggleMute();
    }
  };

  const sec = (ms: number) => `${Math.floor(ms / 1000)}s`;

  return (
    <div
      className="rounded-[6px] relative h-full"
      style={{
        ...cardSurface("audio"),
      }}
      tabIndex={editing ? 0 : -1}
      onKeyDown={onKeyDown}
    >
      {/*
       * inset: PNG 좌측 32%는 검은 녹음기 일러스트, 우측 흰 종이에 콘텐츠.
       * 측정값 — top 8% / left 32% / right 3% / bottom 6%. (spec §6 P2-C)
       */}
      <div
        className="absolute flex items-center gap-3"
        style={{ top: "8%", left: "32%", right: "3%", bottom: "6%" }}
      >
        {state.status === "recording" ? (
          <>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: "var(--color-accent-red, #e1574f)" }}
              aria-hidden
            />
            <span className="flex-1 text-[12px] text-text">
              {t("capture.audio.recording")} · {sec(state.elapsedMs)}
            </span>
            <button
              ref={recordButtonRef}
              type="button"
              data-card-record
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                stopRecording();
              }}
              className="cursor-pointer rounded border border-border px-2 py-0.5 text-[11px] hover:bg-panel"
            >
              {t("capture.audio.stop")}
            </button>
          </>
        ) : state.status === "denied" ? (
          <span className="text-[12px] text-text-soft">
            {t("capture.audio.denied")}
          </span>
        ) : state.status === "unsupported" ? (
          <span className="text-[12px] text-text-soft">
            {t("capture.audio.unsupported")}
          </span>
        ) : card.attachmentRef ? (
          <>
            <button
              type="button"
              aria-label={playing ? "Pause" : "Play"}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                togglePlay();
              }}
              className="cursor-pointer rounded border border-border px-2 py-0.5 text-[11px] hover:bg-panel"
            >
              {playing ? "⏸" : "▶"}
            </button>
            <span className="flex-1 text-[12px] text-text">
              {card.content || t("capture.audio.savedFallback")}
            </span>
            {/*
             * waveform placeholder — 실제 waveform 렌더링 전까지 위치 표시 + 시각 cue.
             * 카드 안에서 muted 상태도 노출.
             */}
            <span
              data-testid="audio-waveform"
              aria-hidden
              className="h-3 w-12 shrink-0 rounded-sm"
              style={{
                background:
                  "repeating-linear-gradient(90deg, var(--color-text-muted, #999) 0 2px, transparent 2px 4px)",
                opacity: muted ? 0.35 : 1,
              }}
            />
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                preload="metadata"
              />
            )}
          </>
        ) : (
          <button
            ref={recordButtonRef}
            type="button"
            data-card-record
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              void startRecording();
            }}
            onKeyDown={(e) => {
              // Space — 녹음 시작 (spec §6 P2-C 의도).
              if (e.key === " " || e.code === "Space") {
                e.preventDefault();
                void startRecording();
              }
            }}
            className="flex-1 text-left text-[12px] text-text-soft cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-border"
          >
            {t("capture.audio.placeholder")}
          </button>
        )}
      </div>
    </div>
  );
}
