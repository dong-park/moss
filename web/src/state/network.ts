"use client";

import { useEffect, useState } from "react";

/**
 * 브라우저 onLine/offLine 이벤트 기반. 첫 렌더는 서버와 같게 항상 true.
 * Node 21+에도 전역 navigator가 있고 onLine이 undefined라, 초기값에서 읽으면
 * 서버가 오프라인 띠를 그려 hydration이 깨졌다 (/j/[token]).
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine !== false);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  return online;
}
