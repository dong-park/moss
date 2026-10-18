import { expect, test } from "bun:test";
import * as Y from "yjs";
import { NOTE_FIELDS, NOTES_MAP, readFields, writeFields } from "@moss/doc-model";

test("sync가 공용 모델로 웹이 쓴 메모 필드(color·textSize·autoWidth 포함)를 읽는다", () => {
  const doc = new Y.Doc();
  const map = new Y.Map<unknown>();
  const note = { id: "n1", kind: "text", x: 1, y: 2, color: "red", textSize: 18, autoWidth: true };
  doc.getMap<Y.Map<unknown>>(NOTES_MAP).set("n1", map);
  writeFields(map, note, NOTE_FIELDS);
  expect(readFields<typeof note>(map, NOTE_FIELDS)).toEqual(note);
});
