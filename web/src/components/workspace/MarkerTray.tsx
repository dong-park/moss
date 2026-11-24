"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/state/workspace";
import { isClothHeld, isPhoneViewport } from "@/state/marker/heldTool";
import {
  MARKER_COLORS,
  MARKER_COLOR_VALUE,
  type MarkerColor,
} from "@/state/marker/tokens";
import { useT } from "@/i18n/Provider";
import { MarkerPanel } from "./MarkerPanel";

/** 마카를 이만큼 누르고 있으면 패널이 열린다(ms). */
const LONG_PRESS_MS = 450;

/**
 * 휴대폰 크기인가. 첫 렌더는 모른다(null) — 서버·하이드레이션과 맞추려 마운트 뒤에 잰다.
 * 화면 짧은 변이 600px 미만이면 휴대폰(D10=A). 크기가 바뀌면 따라간다.
 */
function usePhoneViewport(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null);
  useEffect(() => {
    const read = () => setPhone(isPhoneViewport());
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);
  return phone;
}

/**
 * wall-marker n2: 마카 트레이 — 독 왼쪽에 마카 4개와 천이 놓인다(D11=A).
 *
 * - 마카·천을 누르면 집힌다(트레이 위로 비스듬히 들린다). 들린 것을 다시 누르면 내려놓는다.
 * - 마카를 길게 누르거나 오른쪽 클릭하면 그 마카를 집고 패널(색·굵기)을 연다.
 * - 휴대폰 크기에서는 렌더하지 않고, 들고 있던 것은 내려놓는다.
 */
export function MarkerTray() {
  const t = useT();
  const phone = usePhoneViewport();
  const heldTool = useWorkspace((s) => s.heldTool);
  const holdMarker = useWorkspace((s) => s.holdMarker);
  const holdCloth = useWorkspace((s) => s.holdCloth);
  const releaseTool = useWorkspace((s) => s.releaseTool);
  const [panelOpen, setPanelOpen] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 길게 눌러 패널을 연 직후의 click은 집기·내려놓기로 치지 않는다. */
  const swallowClick = useRef(false);

  const clearPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);
  useEffect(() => clearPress, [clearPress]);

  // 휴대폰 크기가 되면 든 것을 내려놓는다 — 트레이 없이 마카만 들려 있는 상태를 만들지 않는다.
  useEffect(() => {
    if (phone) useWorkspace.getState().releaseTool();
  }, [phone]);

  // 패널은 마카가 들려 있을 때만 의미가 있다 — 내려놓거나 천으로 바꾸면 닫는다.
  // 렌더 중 자기 상태를 맞추는 패턴이다(효과에서 setState하면 한 프레임 늦게 닫힌다).
  const markerColor = heldTool && heldTool.kind === "marker" ? heldTool.color : null;
  const [prevMarkerColor, setPrevMarkerColor] = useState(markerColor);
  if (prevMarkerColor !== markerColor) {
    setPrevMarkerColor(markerColor);
    if (markerColor === null && panelOpen) setPanelOpen(false);
  }

  // 패널 밖을 누르면 닫는다.
  useEffect(() => {
    if (!panelOpen) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setPanelOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [panelOpen]);

  if (phone !== false) return null;

  const markerLabels: Record<MarkerColor, string> = {
    black: t("workspace.marker.item.black"),
    blue: t("workspace.marker.item.blue"),
    red: t("workspace.marker.item.red"),
    green: t("workspace.marker.item.green"),
  };

  const toggleMarker = (color: MarkerColor) => {
    if (markerColor === color) releaseTool();
    else holdMarker(color);
  };

  const openPanelFor = (color: MarkerColor) => {
    if (markerColor !== color) holdMarker(color);
    setPanelOpen(true);
  };

  return (
    <>
      <div
        ref={rootRef}
        role="group"
        aria-label={t("workspace.marker.tray")}
        data-marker-tray="true"
        className="relative flex h-full items-end gap-1 pb-2"
      >
        {MARKER_COLORS.map((color) => {
          const lifted = markerColor === color;
          return (
            <button
              key={color}
              type="button"
              aria-label={markerLabels[color]}
              aria-pressed={lifted}
              title={markerLabels[color]}
              data-marker-color={color}
              data-lifted={lifted ? "true" : "false"}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                clearPress();
                swallowClick.current = false;
                pressTimer.current = setTimeout(() => {
                  pressTimer.current = null;
                  swallowClick.current = true;
                  openPanelFor(color);
                }, LONG_PRESS_MS);
              }}
              onPointerUp={clearPress}
              onPointerLeave={clearPress}
              onPointerCancel={clearPress}
              onContextMenu={(e) => {
                e.preventDefault();
                clearPress();
                swallowClick.current = false;
                openPanelFor(color);
              }}
              onClick={() => {
                if (swallowClick.current) {
                  swallowClick.current = false;
                  return;
                }
                toggleMarker(color);
              }}
              className="flex h-10 w-7 shrink-0 cursor-pointer items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-focus,#4f7cf3)]"
            >
              <MarkerGlyph color={color} lifted={lifted} />
            </button>
          );
        })}

        <button
          type="button"
          aria-label={t("workspace.marker.cloth")}
          aria-pressed={isClothHeld(heldTool)}
          title={t("workspace.marker.cloth")}
          data-marker-cloth="true"
          data-lifted={isClothHeld(heldTool) ? "true" : "false"}
          onClick={() => (isClothHeld(heldTool) ? releaseTool() : holdCloth())}
          className="ml-1 flex h-10 w-9 shrink-0 cursor-pointer items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-focus,#4f7cf3)]"
        >
          <ClothGlyph lifted={isClothHeld(heldTool)} />
        </button>

        {panelOpen && markerColor !== null && <MarkerPanel />}
      </div>
      <div className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
    </>
  );
}

/**
 * 트레이에 놓인 마카. 눕혀 놓이고, 들리면 위로 떠올라 비스듬히 선다.
 * 색은 이름에서 tokens 표로 읽는다.
 */
function MarkerGlyph({ color, lifted }: { color: MarkerColor; lifted: boolean }) {
  const fill = MARKER_COLOR_VALUE[color];
  return (
    <svg
      aria-hidden="true"
      width="40"
      height="16"
      viewBox="0 0 40 16"
      className="origin-bottom-left transition-transform duration-150 ease-out"
      style={{
        transform: lifted
          ? "translate(-2px, -14px) rotate(-38deg)"
          : "translate(-6px, 0) rotate(0deg)",
        filter: lifted ? "drop-shadow(0 3px 2px rgba(0,0,0,0.22))" : "none",
      }}
    >
      <rect x="1" y="3" width="25" height="10" rx="3" fill={fill} />
      <rect x="24" y="4" width="10" height="8" rx="1.5" fill="#efeade" stroke="rgba(0,0,0,0.25)" strokeWidth="0.8" />
      <path d="M34 5.2 L39 8 L34 10.8 Z" fill={fill} />
    </svg>
  );
}

function ClothGlyph({ lifted }: { lifted: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="30"
      height="18"
      viewBox="0 0 30 18"
      className="transition-transform duration-150 ease-out"
      style={{
        transform: lifted ? "translateY(-10px) rotate(-8deg)" : "none",
        filter: lifted ? "drop-shadow(0 3px 2px rgba(0,0,0,0.22))" : "none",
      }}
    >
      <rect x="1" y="2" width="28" height="14" rx="5" fill="#f4f1e8" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <path d="M6 7h18M6 11h12" stroke="rgba(0,0,0,0.18)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
