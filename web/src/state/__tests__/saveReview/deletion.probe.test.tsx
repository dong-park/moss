import {it,expect,vi,afterEach} from 'vitest';
import {useStorage} from '@/state/storage';
import {getDB,resetDB} from '@/state/db/schema';
import {useSaveFeedback,retryBoardSave} from '@/state/saveFeedback';
import {destroyBoardDocs} from '@/state/ydoc/activeDoc';
afterEach(async()=>{vi.restoreAllMocks();await destroyBoardDocs();await resetDB();useSaveFeedback.setState({boards:{}});});
it('permanent removal must revoke failed mirror retries, including noncurrent bridge deletes',async()=>{
 const db=getDB();await db.open();
 await useStorage.getState().saveNote({id:'probe-deleted-frame',kind:'frame',boardId:'probe-deleted-board',content:'old'});
 const put=vi.spyOn(db.notes,'put').mockImplementationOnce(()=>{throw Error('quota');});
 await expect(useStorage.getState().saveNote({id:'probe-deleted-frame',kind:'frame',boardId:'probe-deleted-board',content:'new'})).rejects.toThrow('quota');
 put.mockRestore();
 await useStorage.getState().removeNote('probe-deleted-frame'); // mossBridge.ts:492
 expect(await db.notes.get('probe-deleted-frame')).toBeUndefined();
 expect(await db.trash.get('probe-deleted-frame')).toBeUndefined();
 await retryBoardSave('probe-deleted-board');
 expect(await db.notes.get('probe-deleted-frame')).toBeUndefined();
});
