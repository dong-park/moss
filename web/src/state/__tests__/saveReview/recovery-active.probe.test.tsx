import {it,expect,vi,afterEach} from 'vitest';
import {getOrOpenBoardDoc,activateBoardDoc,destroyBoardDocs} from '@/state/ydoc/activeDoc';
import {boardDocName,discardBoardDocRecovery} from '@/state/ydoc/doc';
import {useSaveFeedback,boardSavePhase} from '@/state/saveFeedback';
import {clearDocument} from 'y-indexeddb';
const ids:string[]=[];
afterEach(async()=>{vi.restoreAllMocks();await destroyBoardDocs();for(const id of ids){await discardBoardDocRecovery(id);await clearDocument(boardDocName(id));}useSaveFeedback.setState({boards:{}});});
it('actual activeDoc A->B->A during aborted write returns latest source rather than stale new handle',async()=>{
 const a='a-'+crypto.randomUUID(),b='b-'+crypto.randomUUID();ids.push(a,b);
 const h=await activateBoardDoc(a);await getOrOpenBoardDoc(b).whenLoaded;
 await vi.waitFor(()=>expect(boardSavePhase(useSaveFeedback.getState().boards[a])).toBe('saved'));
 const db=h.persistence.db!;const transaction=db.transaction.bind(db);
 vi.spyOn(db,'transaction').mockImplementationOnce((...args:Parameters<typeof db.transaction>)=>{const tx=transaction(...args);queueMicrotask(()=>tx.abort());return tx;});
 h.doc.getMap('probe').set('text','latest before navigation');
 await activateBoardDoc(b);
 const returned=await activateBoardDoc(a);
 await vi.waitFor(()=>expect(boardSavePhase(useSaveFeedback.getState().boards[a])).toBe('saved'));
 expect(returned.doc.getMap('probe').get('text')).toBe('latest before navigation');
});
