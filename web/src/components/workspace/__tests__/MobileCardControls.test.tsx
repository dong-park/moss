import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { serializeBlock } from "@/state/blocks";
import { CARD_MAX_WIDTH, useWorkspace, type Card } from "@/state/workspace";
import { Dock } from "../Dock";
import { Canvas } from "../Canvas";
import { useMobileCanvas } from "../mobileCanvas";
vi.mock("../useCompactControls", () => ({ useCompactControls: () => true }));
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor", () => ({ default: () => <div />, ExpandedMarkdownEditor: () => <div /> }));
const source: Card = { id: "a", kind: "text", x: 0, y: 0, width: 240, content: serializeBlock({ type: "link", url: "https://example.com/a" })! };
beforeEach(() => {
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  useMobileCanvas.getState().close();
  useWorkspace.setState({ cards: [source, { ...source, id: "b", x: 400 }], currentBoardId: "mobile-ui", connections: [], selectedIds: ["a"], penMode: false, editingId: null, expandedCardId: null, expandedCardMode: null, canvasHasFitted: true, view: "canvas", viewport: { x: 0, y: 0, scale: 1 } });
});
function mount(){return render(<I18nProvider locale="ko"><Canvas /><Dock /></I18nProvider>);}
function pointer(el: Element | Window,type:string,id:number,x:number,y:number,pointerType="touch"){const e=new MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperties(e,{pointerId:{value:id},pointerType:{value:pointerType}});fireEvent(el,e);}
it("selected mobile link offers explicit open/edit and selecting it leaves the keyboard closed", () => {
  mount();
  expect(screen.getByRole("link", { name: "열기" }).getAttribute("href")).toBe("https://example.com/a");
  expect(screen.queryByRole("textbox", { name: "링크" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "주소 수정" }));
  expect(screen.getByRole("dialog", { name: "링크 주소 수정" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
it("touching the target in connection mode connects without selecting or opening it", () => {
  const {container}=mount();
  fireEvent.click(screen.getByRole("button", {name:"연결"}));
  const target=container.querySelector('[data-card-id="b"]')!;
  pointer(target,"pointerdown",1,450,100);pointer(window,"pointerup",1,450,100);
  expect(useWorkspace.getState().connections).toHaveLength(1);
  expect(useWorkspace.getState().selectedIds).toEqual(["a"]);
  expect(useWorkspace.getState().expandedCardId).toBeNull();
});
it("dragging while choosing a connection target pans without connecting", () => {
  const {container}=mount();
  fireEvent.click(screen.getByRole("button", {name:"연결"}));
  pointer(container.querySelector('[data-card-id="b"]')!,"pointerdown",1,450,100);
  pointer(window,"pointermove",1,475,125);pointer(window,"pointerup",1,475,125);
  expect(useWorkspace.getState().connections).toHaveLength(0);
  expect(useMobileCanvas.getState().operation.kind).toBe("connect");
  expect(useWorkspace.getState().viewport).toMatchObject({x:25,y:25});
});

it("connection target controls cannot activate through the compatibility click", () => {
  const {container}=mount();
  fireEvent.click(screen.getByRole("button", {name:"연결"}));
  const checkbox=document.createElement("input"); checkbox.type="checkbox";
  const activate=vi.fn(); checkbox.addEventListener("click",activate);
  container.querySelector('[data-card-id="b"]')!.appendChild(checkbox);
  pointer(checkbox,"pointerdown",1,450,100); pointer(window,"pointerup",1,450,100);
  fireEvent.click(checkbox);
  expect(useWorkspace.getState().connections).toHaveLength(1);
  expect(activate).not.toHaveBeenCalled(); expect(checkbox.checked).toBe(false);
});
it("mouse input can finish an explicit mobile connection mode on hybrid devices", () => {
  const {container}=mount(); fireEvent.click(screen.getByRole("button",{name:"연결"}));
  const target=container.querySelector('[data-card-id="b"]')!;
  pointer(target,"pointerdown",4,450,100,"mouse"); pointer(window,"pointerup",4,450,100,"mouse");
  expect(useWorkspace.getState().connections).toHaveLength(1);
  expect(useMobileCanvas.getState().operation.kind).toBe("idle");
});
it("keeps numeric resize controls above the mobile keyboard", () => {
  const viewport=Object.assign(new EventTarget(), {height:300,offsetTop:0});
  vi.stubGlobal("visualViewport",viewport);
  mount(); fireEvent.click(screen.getByRole("button",{name:"크기"}));
  const toolbar=screen.getByRole("toolbar",{name:"선택한 카드 도구"});
  expect(toolbar.style.bottom).toContain(`${window.innerHeight-300+20}px`);
});
it("numeric input reflects the clamped width even when the card is already at its limit",()=>{
  useWorkspace.setState(s=>({cards:s.cards.map(c=>c.id==="a"?{...c,width:CARD_MAX_WIDTH}:c)}));
  mount();fireEvent.click(screen.getByRole("button",{name:"크기"}));
  const input=screen.getByRole("spinbutton",{name:"폭"}) as HTMLInputElement;
  fireEvent.change(input,{target:{value:"99999"}});fireEvent.blur(input);
  expect(Number(input.value)).toBe(useWorkspace.getState().cards.find(c=>c.id==="a")!.width);
});

it("link actions keep URL editing as the only edit entry while retaining explicit movement",()=>{
 mount();expect(screen.queryByRole("button",{name:"편집"})).toBeNull();
 expect(screen.getByRole("button",{name:"주소 수정"})).toBeTruthy();
 expect(screen.getByRole("button",{name:"끌어서 이동"})).toBeTruthy();
});
it.each(["연결","크기","주소 수정"])("hides the floating move action during %s",name=>{
 mount();fireEvent.click(screen.getByRole("button",{name}));
 expect(screen.queryByRole("button",{name:"끌어서 이동"})).toBeNull();
});
it("main memo edit remains singular and enters the explicit edit mode",()=>{
 useWorkspace.setState(s=>({cards:s.cards.map(c=>c.id==="a"?{...c,content:"memo"}:c)}));
 mount();expect(screen.getAllByRole("button",{name:"편집"})).toHaveLength(1);
 fireEvent.click(screen.getByRole("button",{name:"편집"}));
 expect(useWorkspace.getState()).toMatchObject({expandedCardId:"a",expandedCardMode:"edit",editingId:null});
});
