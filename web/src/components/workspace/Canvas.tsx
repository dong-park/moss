"use client";

import { useEffect, useRef, useState } from "react";
import { useWorkspace, SYSTEM_BOARD_ID, widthForKind } from "@/state/workspace";
import { useToasts } from "@/state/notifications";
import { useT } from "@/i18n/Provider";
import { DraggableCard } from "./DraggableCard";
import { SystemBoard } from "./SystemBoard";
import { SystemBoardEmpty } from "./cards/SystemBoardEmpty";
import { ZoomBar } from "./ZoomBar";
import { PenModeHud } from "./PenModeHud";
import { PenToolbar } from "./PenToolbar";
import { MemoSearchLayer } from "./MemoSearchLayer";
import { TrashPanel } from "./TrashPanel";
import { useVirtualizedCards } from "./useVirtualizedCards";
import { ConnectorLayer } from "./connectors/ConnectorLayer";
import { ConnectionHandlesLayer } from "./connectors/ConnectionHandles";
import { fetchLinkPreview, isUrlOnly } from "@/state/cardContent";
import { serializeBlock } from "@/state/blocks";
import {
  DROP_STACK_OFFSET_PX,
  MAX_DROP_FILES,
  extractFilesFromDrop,
  extractImageFilesFromClipboard,
  storeFileBlock,
  storeImageBlock,
  warnDropLimitExceeded,
} from "./canvasCapture";

/** FEAT-home AC-2: 시스템 보드에서 빈 안내로 전환되는 메모 임계치. */
const SYSTEM_EMPTY_THRESHOLD = 10;

/** FEAT-canvas AC-3: 가상화·성능 안내 토스트 임계치 (PRD §26-1, REQ-16). */
const VIRTUALIZATION_TOAST_THRESHOLD = 200;

const WHEEL_ZOOM_INTENSITY = 0.0015;
const MARQUEE_THRESHOLD = 4; // px — 박스로 인식할 최소 드래그 거리

/** FEAT-markdown-memo-pen: 펜 모드 커서 — 펜 모양 SVG. hotspot은 펜촉(좌하단). */
const PEN_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M3 21l3.5-1L17 9.5 14.5 7 4 17.5 3 21z' fill='%23333' stroke='white' stroke-width='1'/%3E%3Cpath d='M15 6.5l2.5 2.5 2-2a1.4 1.4 0 0 0 0-2l-.5-.5a1.4 1.4 0 0 0-2 0l-2 2z' fill='%234f7cf3' stroke='white' stroke-width='1'/%3E%3C/svg%3E\") 2 22, crosshair";

interface Marquee {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  additive: boolean;
  active: boolean;
}

function rectsIntersect(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function Canvas() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Marquee | null>(null);
  const [canvasRect, setCanvasRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>({ left: 0, top: 0, width: 0, height: 0 });

  const cards = useWorkspace((s) => s.cards);
  const currentBoardId = useWorkspace((s) => s.currentBoardId);
  const boardTransitioning = useWorkspace((s) => s.boardTransitioning);
  const viewport = useWorkspace((s) => s.viewport);
  const selectedIds = useWorkspace((s) => s.selectedIds);
  const editingId = useWorkspace((s) => s.editingId);
  const dockDrag = useWorkspace((s) => s.dockDrag);
  const selectMany = useWorkspace((s) => s.selectMany);
  const clearSelection = useWorkspace((s) => s.clearSelection);
  const removeSelected = useWorkspace((s) => s.removeSelected);
  const panBy = useWorkspace((s) => s.panBy);
  const zoomAt = useWorkspace((s) => s.zoomAt);
  const fitToCards = useWorkspace((s) => s.fitToCards);
  // P2-4: 최초 fit 여부를 스토어가 들고 있다 — panToCard(programmatic 이동)와
  // 경쟁하지 않는다(모듈 전역이던 기존 플래그 제거).
  const canvasHasFitted = useWorkspace((s) => s.canvasHasFitted);
  // 캔버스 붙여넣기 — clipboard가 URL만일 때 link 위젯을 바로 생성.
  const addCardAtViewportCenter = useWorkspace((s) => s.addCardAtViewportCenter);
  // FEAT-sticky-redesign n6: 파일 드롭 — 놓은 좌표에 블록 든 메모를 만든다.
  const addCardAt = useWorkspace((s) => s.addCardAt);
  // 무소속 토스트와 함께 임시 숨김(2026-09-22).
  // const promoteCardToNewBoard = useWorkspace((s) => s.promoteCardToNewBoard);
  const setContent = useWorkspace((s) => s.setContent);
  const setEditing = useWorkspace((s) => s.setEditing);
  // FEAT-text-tool AC-2: T 배치 모드 — 캔버스 클릭 지점에 textbox를 만든다.
  const textPlacementArmed = useWorkspace((s) => s.textPlacementArmed);
  const disarmTextPlacement = useWorkspace((s) => s.disarmTextPlacement);
  // FEAT-markdown-memo-pen: 펜 모드 — 전역 커서 변경 + E/[/]/Esc 키.
  const penMode = useWorkspace((s) => s.penMode);
  const setPenMode = useWorkspace((s) => s.setPenMode);
  const setPenTool = useWorkspace((s) => s.setPenTool);
  const setPenWidth = useWorkspace((s) => s.setPenWidth);
  // FEAT-subcanvas: 선택이 없을 때 Esc → 부모 캔버스로 한 단계 위.
  const goToParent = useWorkspace((s) => s.goToParent);
  const pushToast = useToasts((s) => s.push);
  const t = useT();

  /**
   * 사이드바 도구 커스텀 드래그 중 — 커서가 캔버스 위에 있으면 drop hint 점 표시.
   * 좌표는 캔버스 로컬(rect.left/top 기준). 캔버스 밖이거나 드래그 종료면 null.
   */
  const dropHint = (() => {
    if (!dockDrag) return null;
    const x = dockDrag.screenX - canvasRect.left;
    const y = dockDrag.screenY - canvasRect.top;
    if (x < 0 || y < 0 || x > canvasRect.width || y > canvasRect.height) return null;
    return { x, y };
  })();

  /* ─ FEAT-canvas AC-3: viewport 가상화 — viewport 밖 카드는 DOM에서 제외 ─ */
  const visibleCards = useVirtualizedCards({
    cards,
    viewport,
    canvasSize: { width: canvasRect.width, height: canvasRect.height },
    editingId,
  });

  /* ─ 캔버스 실측 위치·크기 추적 (ResizeObserver + window resize) ─ */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setCanvasRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    };
    update();
    window.addEventListener("resize", update);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", update);
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  /* ─ 새로고침 직후 1회: 메모들이 화면에 꽉 차도록 포커싱 ─ */
  const didFitRef = useRef(false);
  useEffect(() => {
    if (didFitRef.current) return;
    // 표에서 돌아온 재마운트·programmatic panToCard 이후면 이미 자리 잡았다 —
    // 사용자가 보던/지정한 뷰포트를 보존한다(P2-4).
    if (canvasHasFitted) {
      didFitRef.current = true;
      return;
    }
    if (cards.length === 0) return;
    if (canvasRect.width <= 0 || canvasRect.height <= 0) return;
    didFitRef.current = true;
    fitToCards({ width: canvasRect.width, height: canvasRect.height });
  }, [cards.length, canvasRect.width, canvasRect.height, fitToCards, canvasHasFitted]);

  /* ─ FEAT-canvas AC-3: 200 임계 도달 시 1회 안내 토스트 ─ */
  const toastFiredRef = useRef(false);
  useEffect(() => {
    if (toastFiredRef.current) return;
    if (cards.length < VIRTUALIZATION_TOAST_THRESHOLD) return;
    toastFiredRef.current = true;
    pushToast({
      tone: "calm",
      title: t("workspace.canvas.virtualization.toastTitle"),
      body: t("workspace.canvas.virtualization.toastBody"),
      duration: 6000,
    });
  }, [cards.length, pushToast, t]);

  /* ─ 캔버스 붙여넣기(FEAT-sticky-redesign n6, spec AC-6·AC-7):
   *   - 클립보드에 이미지 blob이 있으면 이미지 블록 든 text 메모.
   *   - clipboard가 "URL만"이면 링크 블록 든 text 메모.
   *   image·link 종류 행은 늘리지 않는다 — 메모 한 종류 원칙(spec). */
  useEffect(() => {
    const centerSize = () =>
      canvasRect.width > 0 && canvasRect.height > 0
        ? { width: canvasRect.width, height: canvasRect.height }
        : undefined;

    const onPaste = (e: ClipboardEvent) => {
      // 입력 중(카드 편집 input·textarea·contenteditable)이면 기본 붙여넣기에 양보.
      const active = document.activeElement as HTMLElement | null;
      if (active?.matches("input, textarea, [contenteditable='true']")) return;

      const imageFiles = extractImageFilesFromClipboard(e);
      if (imageFiles.length > 0) {
        e.preventDefault();
        void (async () => {
          for (const file of imageFiles) {
            const block = await storeImageBlock(file);
            if (!block) continue;
            const id = addCardAtViewportCenter("text", centerSize());
            setEditing(null);
            setContent(id, block);
          }
        })();
        return;
      }

      const text = e.clipboardData?.getData("text/plain") ?? "";
      const url = text.trim();
      if (!isUrlOnly(url)) return;

      const block = serializeBlock({ type: "link", url });
      // 허용 스킴(http/https/mailto) 밖이면 null — 기존 일반 텍스트 붙여넣기로 떨어뜨린다
      // (1단계 리뷰: javascript: 등 링크 저장형 XSS 차단, blocks.ts 참고).
      if (!block) return;

      e.preventDefault();
      const id = addCardAtViewportCenter("text", centerSize());
      // 위젯(표시 형태)으로 바로 보이게 — 편집 모드 진입 없이 링크 블록만 채운다.
      setEditing(null);
      setContent(id, block);
      // OG 메타는 비동기로 채운다. 실패해도 url만으로 블록 유지.
      // 2단계 리뷰 P2: 도착 시점에 사용자가 이미 내용을 편집했다면(방금 심은
      // 블록과 다르면) 덮어쓰지 않는다 — 레이스로 사용자 편집을 지우는 사고 방지.
      void fetchLinkPreview(url).then((meta) => {
        if (!meta) return;
        const withTitle = serializeBlock({ type: "link", url, title: meta.title });
        if (!withTitle) return;
        const current = useWorkspace.getState().cards.find((c) => c.id === id)?.content;
        if (current !== block) return;
        setContent(id, withTitle);
      });
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canvasRect, addCardAtViewportCenter, setContent, setEditing]);

  /* ─ 캔버스 파일 드롭(FEAT-sticky-redesign n6, spec AC-6·AC-7·§4):
   *   이미지 파일 → 이미지 블록, 그 외 → 파일 블록. 파일마다 메모 1개, 놓은
   *   자리에서 24px씩 비켜 쌓는다. 최대 20개, 초과분 토스트.
   *   시스템 보드에 놓으면 기존 사이드바 드롭 토스트("새 보드로 승격")와 같다. */
  const onCanvasDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer?.types.includes("Files")) return;
    e.preventDefault();
  };

  const onCanvasDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const active = document.activeElement as HTMLElement | null;
    if (active?.matches("input, textarea, [contenteditable='true']")) return;

    const files = extractFilesFromDrop(e.nativeEvent);
    if (files.length === 0) return;
    e.preventDefault();

    const accepted = files.slice(0, MAX_DROP_FILES);
    if (files.length > MAX_DROP_FILES) warnDropLimitExceeded(files.length);

    const rect = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const v = useWorkspace.getState().viewport;
    const cardW = widthForKind("text");
    const baseWx = (sx - v.x) / v.scale - cardW / 2;
    const baseWy = (sy - v.y) / v.scale - 20;

    void (async () => {
      let i = 0;
      // 2단계 리뷰 P2: 시스템 보드에 여러 파일을 떨어뜨려도 "새 보드로 승격" 토스트는
      // 파일마다가 아니라 이 드롭 배치당 1번만 — 만든 카드 id를 모아뒀다가 한 번에.
      const createdOnSystemBoard: string[] = [];
      for (const file of accepted) {
        const block = file.type.startsWith("image/")
          ? await storeImageBlock(file)
          : await storeFileBlock(file);
        if (!block) {
          i += 1;
          continue;
        }
        const wx = baseWx + i * DROP_STACK_OFFSET_PX;
        const wy = baseWy + i * DROP_STACK_OFFSET_PX;
        const id = addCardAt("text", wx, wy);
        setEditing(null);
        setContent(id, block);
        if (useWorkspace.getState().currentBoardId === SYSTEM_BOARD_ID) {
          createdOnSystemBoard.push(id);
        }
        i += 1;
      }
      // 임시 숨김(2026-09-22 사용자 결정): "이 메모는 무소속이에요 / 새 프로젝트" 토스트.
      // 되돌리려면 주석을 푼다.
      // if (createdOnSystemBoard.length > 0) {
      //   pushToast({
      //     tone: "calm",
      //     title: t("workspace.system.drop.toastTitle"),
      //     body: t("workspace.system.drop.toastBody"),
      //     duration: 6000,
      //     action: {
      //       label: t("workspace.system.drop.newBoard"),
      //       onClick: async () => {
      //         await Promise.all(createdOnSystemBoard.map((cid) => promoteCardToNewBoard(cid)));
      //       },
      //     },
      //   });
      // }
    })();
  };

  /* ─ Space + Delete/Backspace 키 처리 ─ */
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el?.matches("input, textarea, [contenteditable='true']");
    };

    const onDown = (e: KeyboardEvent) => {
      // FEAT-connectors: 연결 드래그 중이면 이 핸들러가 Escape를 먼저 잡아 부모 보드로
      // 튕기는 일이 없도록 모든 캔버스 단축키를 양보한다(dragSession이 취소를 처리).
      if (useWorkspace.getState().connectionDraft) return;
      if (e.code === "Space" && !isTyping()) {
        e.preventDefault();
        setSpaceDown(true);
        return;
      }
      // FEAT-markdown-memo-pen: 펜 모드 키 — 다른 캔버스 키보다 우선.
      if (penMode) {
        const mod = e.metaKey || e.ctrlKey;
        if (e.key === "Escape") {
          e.preventDefault();
          setPenMode(false);
        } else if (mod && (e.key === "z" || e.key === "Z")) {
          // FEAT-pen-drawing-engine D3: 펜 그리기 undo/redo (스펙 AC-7).
          e.preventDefault();
          if (e.shiftKey) useWorkspace.getState().penRedo();
          else useWorkspace.getState().penUndo();
        } else if (mod && e.key === "Backspace") {
          e.preventDefault();
          useWorkspace.getState().penClear();
        } else if (!mod && (e.key === "e" || e.key === "E")) {
          e.preventDefault();
          const cur = useWorkspace.getState().penTool;
          setPenTool(cur === "pen" ? "eraser" : "pen");
        } else if (e.key === "[") {
          e.preventDefault();
          setPenWidth(useWorkspace.getState().penWidth - 1);
        } else if (e.key === "]") {
          e.preventDefault();
          setPenWidth(useWorkspace.getState().penWidth + 1);
        }
        return; // 펜 모드 중 삭제 등 다른 키 차단
      }
      if (editingId) return;
      if (isTyping()) return;
      // FEAT-connectors: 선 선택 중엔 Delete로 삭제, Esc로 선택 해제 (AC-5).
      const selectedConnectionId = useWorkspace.getState().selectedConnectionId;
      if (selectedConnectionId) {
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          useWorkspace.getState().removeConnection(selectedConnectionId);
        } else if (e.key === "Escape") {
          e.preventDefault();
          useWorkspace.getState().selectConnection(null);
        }
        return;
      }
      if (selectedIds.length === 0) {
        // FEAT-subcanvas: 선택이 없으면 Esc로 부모 캔버스로 올라간다(루트면 no-op).
        // 단, 모달(펼치기·템플릿·삭제 다이얼로그)이 열려 있으면 그쪽 Esc에 양보한다.
        if (e.key === "Escape") {
          const ws = useWorkspace.getState();
          const modalOpen =
            ws.expandedCardId !== null ||
            ws.templatePickerOpen ||
            ws.deleteDialogBoardId !== null;
          if (!modalOpen) void goToParent();
        }
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if (e.key === "Escape") {
        clearSelection();
      }
    };

    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [
    selectedIds,
    editingId,
    removeSelected,
    clearSelection,
    penMode,
    setPenMode,
    setPenTool,
    setPenWidth,
    goToParent,
  ]);

  /* ─ 휠 줌 (캔버스 위에서 wheel은 항상 줌으로 처리) ─ */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // pinch 트랙패드는 ctrlKey=true로 들어옴. 일반 휠도 줌으로.
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = Math.exp(-e.deltaY * WHEEL_ZOOM_INTENSITY);
      zoomAt(factor, sx, sy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ─ Space+drag / 미들 마우스 팬 — capture phase로 등록해 카드 위에서도 가로챔 ─ */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onMouseDownCapture = (e: MouseEvent) => {
      const isMiddle = e.button === 1;
      const isSpacePan = spaceDown && e.button === 0;
      if (!isMiddle && !isSpacePan) return;

      e.preventDefault();
      e.stopPropagation();
      setPanning(true);
      let lastX = e.clientX;
      let lastY = e.clientY;

      const onMove = (ev: MouseEvent) => {
        panBy(ev.clientX - lastX, ev.clientY - lastY);
        lastX = ev.clientX;
        lastY = ev.clientY;
      };
      const onUp = () => {
        setPanning(false);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    el.addEventListener("mousedown", onMouseDownCapture, true);
    return () =>
      el.removeEventListener("mousedown", onMouseDownCapture, true);
  }, [spaceDown, panBy]);

  /* ─ FEAT-text-tool AC-2: 배치 모드는 capture 단계에서 잡는다 ─
   * 카드(메모판 포함)의 onMouseDown이 stopPropagation으로 버블을 막아, 판 위 클릭은
   * 버블 onMouseDown까지 오지 않는다. 배치 모드일 때만 capture에서 먼저 처리한다.
   * 판(frame)·빈 영역 위 클릭은 클릭 지점에 textbox를 만들고(판이면 frameId 소속),
   * 메모·함 카드 위 클릭은 모드만 풀고 그 카드 기본 동작에 양보한다(P1-3). */
  const onMouseDownCapture = (e: React.MouseEvent) => {
    if (!textPlacementArmed || e.button !== 0 || spaceDown) return;
    const target = e.target as HTMLElement;
    if (target.matches?.("input, textarea, [contenteditable='true']")) return;
    const cardEl = target.closest<HTMLElement>("[data-card-id]");
    if (cardEl) {
      const card = useWorkspace
        .getState()
        .cards.find((c) => c.id === cardEl.dataset.cardId);
      if (!card || card.kind !== "frame") {
        // 메모·함 등 카드 위 — 배치 대신 모드를 풀고 카드 기본 동작 유지.
        disarmTextPlacement();
        return;
      }
    } else if (target !== e.currentTarget) {
      // 캔버스 UI(검색·툴바 등) 위 — 배치 대상이 아니다.
      return;
    }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.preventDefault();
    e.stopPropagation();
    const v = useWorkspace.getState().viewport;
    const wx = (e.clientX - rect.left - v.x) / v.scale;
    const wy = (e.clientY - rect.top - v.y) / v.scale;
    addCardAt("textbox", wx, wy);
    disarmTextPlacement();
  };

  /* ─ 빈 캔버스 좌클릭 → rubber-band 박스 시작 (modifier 없으면 선택 치환, 있으면 합집합) ─ */
  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (spaceDown) return;
    if (e.target !== e.currentTarget) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;

    setMarquee({
      startX: sx,
      startY: sy,
      endX: sx,
      endY: sy,
      additive,
      active: false,
    });

    const onMove = (ev: MouseEvent) => {
      const ex = ev.clientX - rect.left;
      const ey = ev.clientY - rect.top;
      const dist = Math.hypot(ex - sx, ey - sy);
      setMarquee((m) =>
        m
          ? {
              ...m,
              endX: ex,
              endY: ey,
              active: m.active || dist > MARQUEE_THRESHOLD,
            }
          : m,
      );
    };

    const onUp = (ev: MouseEvent) => {
      const ex = ev.clientX - rect.left;
      const ey = ev.clientY - rect.top;
      const dist = Math.hypot(ex - sx, ey - sy);

      if (dist <= MARQUEE_THRESHOLD) {
        // 단순 클릭 → modifier 없으면 선택 해제
        if (!additive) clearSelection();
        setMarquee(null);
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        return;
      }

      // 박스와 교차한 카드 ids 계산 — DOM 실제 bbox 기준
      const canvasEl = canvasRef.current;
      const boxL = Math.min(sx, ex);
      const boxT = Math.min(sy, ey);
      const boxW = Math.abs(ex - sx);
      const boxH = Math.abs(ey - sy);
      const hits: string[] = [];
      if (canvasEl) {
        const cardEls = canvasEl.querySelectorAll<HTMLElement>(
          "[data-card-id]",
        );
        cardEls.forEach((el) => {
          const r = el.getBoundingClientRect();
          const cx = r.left - rect.left;
          const cy = r.top - rect.top;
          if (rectsIntersect(boxL, boxT, boxW, boxH, cx, cy, r.width, r.height)) {
            const id = el.dataset.cardId;
            if (id) hits.push(id);
          }
        });
      }
      selectMany(hits, additive);

      setMarquee(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const cursorClass = panning
    ? "cursor-grabbing"
    : spaceDown
      ? "cursor-grab"
      : textPlacementArmed
        ? "cursor-text"
        : "cursor-default";

  return (
    <div
      ref={canvasRef}
      data-canvas-root="true"
      onMouseDownCapture={onMouseDownCapture}
      onMouseDown={onMouseDown}
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
      className={`relative h-full overflow-hidden bg-bg ${cursorClass}`}
      // FEAT-markdown-memo-pen: 펜 모드면 전역 커서를 펜으로(inline이 class를 덮음).
      style={penMode ? { cursor: PEN_CURSOR } : undefined}
    >
      {/* world layer — viewport transform 적용. 사용자 카드는 항상 렌더한다.
          FEAT-boards AC-4: 보드 전환 시 200ms ease-out fade. */}
      <div
        data-board-transitioning={boardTransitioning ? "true" : "false"}
        className="absolute left-0 top-0 origin-top-left transition-opacity duration-200 ease-out"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
          transformOrigin: "0 0",
          willChange: "transform, opacity",
          opacity: boardTransitioning ? 0 : 1,
        }}
      >
        {visibleCards.map((card) => (
          <DraggableCard key={card.id} card={card} />
        ))}
        {/* FEAT-connectors: 연결선(카드 아래) + hover/드래그 연결점(카드 위 오버레이). */}
        <ConnectorLayer />
        <ConnectionHandlesLayer cards={cards} />
      </div>

      {/* 빈 안내 — 시스템 보드 + 카드가 한 장도 없을 때만. 작업물이 있으면 안내가 가리지 않는다. */}
      {currentBoardId === SYSTEM_BOARD_ID && cards.length === 0 && (
        <div
          className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out"
          style={{ opacity: boardTransitioning ? 0 : 1 }}
        >
          <SystemBoardEmpty />
        </div>
      )}

      {/* FEAT-home AC-1: 시스템 보드 + 메모 ≥ 10 → 큐레이팅 카드 (휴리스틱 MVP).
          가상 카드 — viewport 변환을 받지 않는 screen-fixed 레이어로 렌더해
          selection/drag/zoom 시스템과 완전히 격리된다 (AC-5 자동 충족).
          현재 휴리스틱 UX 미숙으로 임시 비활성화 — 다듬은 뒤 복원. */}
      {false &&
        currentBoardId === SYSTEM_BOARD_ID &&
        cards.length >= SYSTEM_EMPTY_THRESHOLD && (
          <div
            className="pointer-events-none absolute inset-0 transition-opacity duration-200 ease-out"
            style={{ opacity: boardTransitioning ? 0 : 1 }}
          >
            <SystemBoard />
          </div>
        )}

      {/* rubber-band 다중선택 박스 (screen 좌표, viewport 변환 받지 않음) */}
      {marquee && marquee.active && (
        <div
          className="pointer-events-none absolute z-[var(--z-selection)]"
          style={{
            left: Math.min(marquee.startX, marquee.endX),
            top: Math.min(marquee.startY, marquee.endY),
            width: Math.abs(marquee.endX - marquee.startX),
            height: Math.abs(marquee.endY - marquee.startY),
            background: "rgba(79, 124, 243, 0.08)",
            border: "1px solid rgba(79, 124, 243, 0.5)",
            borderRadius: 2,
          }}
        />
      )}

      {/* drop hint */}
      {dropHint && (
        <div
          className="pointer-events-none absolute z-[var(--z-selection)]"
          style={{
            left: dropHint.x - 12,
            top: dropHint.y - 12,
            width: 24,
            height: 24,
            borderRadius: 12,
            border: "2px dashed rgba(79,124,243,0.5)",
          }}
        />
      )}

      {/* FEAT-pen-mode-ux: 펜 모드 가시화 — HUD(B1)·도구 툴바(B3). 둘 다 penMode ON일 때만 렌더. */}
      <PenModeHud />
      <PenToolbar />
      {/* FEAT-memo-fulltext-search (W4): 검색 박스 + 강조/dim 오버레이. */}
      <MemoSearchLayer />
      {/* FEAT-trash: 독 옆 휴지통 패널. */}
      <TrashPanel />

      <ZoomBar />
    </div>
  );
}
