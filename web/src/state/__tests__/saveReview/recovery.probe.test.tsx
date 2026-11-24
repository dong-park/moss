import {it,expect,vi,afterEach} from 'vitest';
import {openBoardDoc,boardDocName,discardBoardDocRecovery,type BoardDocHandle} from '@/state/ydoc/doc';
import {useSaveFeedback,boardSavePhase} from '@/state/saveFeedback';
import {clearDocument} from 'y-indexeddb';
const handles:BoardDocHandle[]=[];let id='';
afterEach(async()=>{vi.restoreAllMocks();for(const h of handles)await h.destroy();if(id){await discardBoardDocRecovery(id);await clearDocument(boardDocName(id));}useSaveFeedback.setState({boards:{}});});
it('re-entry during asynchronous close must retain the unsaved source snapshot',async()=>{
 id='probe-recovery-'+crypto.randomUUID();const h=openBoardDoc(id);handles.push(h);await h.whenLoaded;
 await vi.waitFor(()=>expect(boardSavePhase(useSaveFeedback.getState().boards[id])).toBe('saved'));
 const db=h.persistence.db!;const transaction=db.transaction.bind(db);
 vi.spyOn(db,'transaction').mockImplementationOnce((...args:Parameters<typeof db.transaction>)=>{const tx=transaction(...args);queueMicrotask(()=>tx.abort());return tx;});
 h.doc.getMap('probe').set('text','unsaved latest');
 const closing=h.destroy(); // activeDoc.closeBoardDocByKey intentionally does not await
 const returned=openBoardDoc(id);handles.push(returned);
 await closing;await returned.whenLoaded;
 await vi.waitFor(()=>expect(boardSavePhase(useSaveFeedback.getState().boards[id])).toBe('saved'));
 expect(returned.doc.getMap('probe').get('text')).toBe('unsaved latest');
});
