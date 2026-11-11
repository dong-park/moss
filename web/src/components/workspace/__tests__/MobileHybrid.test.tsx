import {fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {I18nProvider} from "@/i18n/Provider";
import {useWorkspace,type Card} from "@/state/workspace";
import {Canvas} from "../Canvas";
import {Dock} from "../Dock";
import {useMobileCanvas} from "../mobileCanvas";
vi.mock("@/components/workspace/cards/_shared/MarkdownEditor",()=>({default:()=> <div/>,ExpandedMarkdownEditor:()=> <div/>}));
const width=window.innerWidth;
function pointer(el:Element|Window,type:string,pointerType:string){const e=new MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:450,clientY:100});Object.defineProperties(e,{pointerType:{value:pointerType},pointerId:{value:1}});fireEvent(el,e);}
beforeEach(()=>{
 window.innerWidth=1200;
 vi.stubGlobal("matchMedia",vi.fn(()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()})));
 useMobileCanvas.getState().close();
 useWorkspace.setState({cards:[{id:"a",kind:"text",x:0,y:0,width:240,content:"source"},{id:"b",kind:"text",x:400,y:0,width:240,content:"target"}] as Card[],connections:[],selectedIds:[],currentBoardId:"hybrid",view:"canvas",penMode:false,editingId:null,expandedCardId:null,canvasHasFitted:true,viewport:{x:0,y:0,scale:1}});
});
afterEach(()=>{window.innerWidth=width;vi.unstubAllGlobals();});
it("a touch-started connection survives switching to mouse on a wide fine-pointer device",()=>{
 const {container}=render(<I18nProvider locale="ko"><Canvas/><Dock/></I18nProvider>);
 const a=container.querySelector('[data-card-id="a"]')!;
 pointer(a,"pointerdown","touch");pointer(window,"pointerup","touch");
 fireEvent.click(screen.getByRole("button",{name:"연결"}));
 pointer(container.querySelector('[data-card-id="b"]')!,"pointerdown","mouse");pointer(window,"pointerup","mouse");
 expect(useWorkspace.getState().connections).toHaveLength(1);
});
