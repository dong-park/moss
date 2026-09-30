"use client";

import { useEffect, useRef, useState } from "react";
import {
  onFilesMapChange,
  resolveAttachment,
  type AttachmentResolution,
} from "@/state/share/attachments";

export type PhotoResolution = { state: "loading"; url: null } | AttachmentResolution;

const MISSING: PhotoResolution = { state: "missing", url: null };

/**
 * attachmentRef → 그릴 수 있는 blob URL. 카드와 크게 보기 창이 같이 쓴다.
 * 공유 보드에서 fileId가 뒤늦게 동기화되면 다시 풀어 자리표시자를 사진으로 바꾼다.
 */
export function usePhotoUrl(ref: string | undefined): PhotoResolution {
  const urlRef = useRef<string | null>(null);
  const [res, setRes] = useState<PhotoResolution>({ state: "loading", url: null });

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    const apply = (next: AttachmentResolution) => {
      if (cancelled) return;
      if (urlRef.current && urlRef.current !== next.url) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next.url;
      setRes(next);
    };
    const run = () => {
      void resolveAttachment(ref).then(apply);
    };
    run();
    const off = onFilesMapChange(run);
    return () => {
      cancelled = true;
      off();
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [ref]);

  // 참조가 없으면 effect 안에서 상태를 바꾸지 않고 렌더에서 바로 missing이다.
  return ref ? res : MISSING;
}
