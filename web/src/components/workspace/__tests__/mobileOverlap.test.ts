import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = (file: string) => readFileSync(`${process.cwd()}/src/components/workspace/${file}`, 'utf8');
it('keeps compact zoom inside the viewport and hides duplicate selected zoom', () => {
  expect(css('canvasControls.module.css')).toContain('flex-wrap: wrap');
  expect(css('canvasControls.module.css')).toContain('.zoom[data-compact="true"][data-selected="true"]');
});
it('marks both workspace header rows for link dialog positioning', () => {
  expect(css('WorkspaceShell.tsx').match(/\bdata-workspace-editor-header(?=\s)/g)).toHaveLength(2);
});

it('places compact dock labels inside their touch buttons', () => {
  expect(css('Dock.tsx')).toContain('data-dock-label="true"');
  expect(css('canvasControls.module.css')).toContain('.dock[data-compact="true"] [data-dock-label="true"]');
  expect(css('canvasControls.module.css')).toContain('position: static');
});
