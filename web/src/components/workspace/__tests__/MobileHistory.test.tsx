import {act,render,waitFor} from "@testing-library/react";
import {afterEach,expect,it} from "vitest";
import {useMobileCanvas} from "../mobileCanvas";
import {mobileHistoryKey,useMobileHistory} from "../useMobileHistory";
import {useWorkspace} from "@/state/workspace";
import {EMPTY_LINK_CONTENT} from "../linkMemo";
function Owner(){const op=useMobileCanvas(s=>s.operation);useMobileHistory(mobileHistoryKey(op));return null;}
afterEach(()=>useMobileCanvas.getState().close());
it("mode switches share one history entry and closing returns to the original entry",async()=>{
 window.history.replaceState({qaOriginal:true},"",window.location.href);
 useWorkspace.setState({cards:[{id:"a",kind:"text",x:0,y:0,width:240,content:EMPTY_LINK_CONTENT}],selectedIds:["a"],currentBoardId:"history",view:"canvas",penMode:false});
 render(<Owner/>);
 act(()=>useMobileCanvas.getState().connect("a"));
 act(()=>useMobileCanvas.getState().editLink("a"));
 act(()=>useMobileCanvas.getState().close());
 await waitFor(()=>expect(window.history.state).toEqual({qaOriginal:true}));
});
