"use client";

import { useEffect } from "react";

/**
 * 앱 셸 SW 등록. 화면에 아무것도 그리지 않음.
 * 개발 모드에서는 자주 바뀌는 청크 캐시가 디버깅을 해치므로 등록하지 않는다.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;

    const url = "/sw.js";
    navigator.serviceWorker.register(url, { scope: "/" }).catch((err) => {
      // 등록 실패는 치명적이지 않음. 콘솔에만 남긴다.
      console.warn("[sw] register failed", err);
    });
  }, []);

  return null;
}
