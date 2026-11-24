import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { I18nProvider } from "@/i18n/Provider";
import { MobileResizeControls } from "../MobileResizeControls";
import type { Card } from "@/state/workspace";
it("width draft is committed on blur and invalid values never reach the store", () => {
  const apply=vi.fn();
  render(<I18nProvider locale="ko"><MobileResizeControls card={{id:'a',kind:'text',x:0,y:0,width:240,content:''} as Card} apply={apply} close={()=>{}} /></I18nProvider>);
  const input=screen.getByRole('spinbutton',{name:'폭'});
  fireEvent.change(input,{target:{value:'300'}});expect(apply).not.toHaveBeenCalled();
  fireEvent.blur(input);expect(apply).toHaveBeenLastCalledWith({width:300});
  apply.mockClear();fireEvent.change(input,{target:{value:''}});fireEvent.blur(input);
  expect(apply).not.toHaveBeenCalled();expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.queryByRole('spinbutton',{name:'높이'})).toBeNull();
});
it("frame exposes independent height while preserving width", () => {
  const apply=vi.fn();
  render(<I18nProvider locale="ko"><MobileResizeControls card={{id:'f',kind:'frame',x:0,y:0,width:320,height:220,content:''} as Card} apply={apply} close={()=>{}} /></I18nProvider>);
  fireEvent.change(screen.getByRole('spinbutton',{name:'높이'}),{target:{value:'280'}});
  fireEvent.blur(screen.getByRole('spinbutton',{name:'높이'}));
  expect(apply).toHaveBeenCalledWith({width:320,height:280});
});
