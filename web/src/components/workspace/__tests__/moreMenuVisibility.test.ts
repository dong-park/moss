import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('compact open menu hides zoom and dock labels without removing the menu trigger', () => {
  const dock = readFileSync('src/components/workspace/Dock.tsx', 'utf8');
  const css = readFileSync('src/app/globals.css', 'utf8');
  expect(dock).toContain('data-mobile-more-open={compact && moreOpen}');
  expect(css).toContain('body:has([data-mobile-more-open="true"]) [data-canvas-control="zoom"][data-compact="true"]');
  expect(css).toContain('[data-mobile-more-open="true"] [data-dock-label="true"]');
  expect(css).toMatch(/visibility: hidden;\s*pointer-events: none;/);
});
