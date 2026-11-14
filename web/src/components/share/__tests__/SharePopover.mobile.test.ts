import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('suppresses the canvas privacy control only while mobile share is open', () => {
  const css = readFileSync('src/app/globals.css', 'utf8');
  expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*body:has\(\[data-share-popover\]\)[\s\S]*data-canvas-control="privacy"[\s\S]*visibility: hidden/);
  expect(readFileSync('src/components/share/SharePopover.tsx', 'utf8')).toContain('data-share-popover');
});
