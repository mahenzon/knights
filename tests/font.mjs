import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseFont, fontLayout } from '../build/web/font.mjs';
const glyphs = parseFont(fs.readFileSync('dist/assets/font_interface.fnt', 'utf8'));
assert.equal(glyphs.size, 95);
const native = JSON.parse(fs.readFileSync('tests/fixtures/font-layout.json', 'utf8'));
for (const sample of native.samples) {
  const draws = fontLayout(
    glyphs,
    sample.text,
    sample.x,
    sample.y,
    sample.size,
    ['left', 'right', 'center'][sample.align],
  );
  assert.equal(draws.length, sample.draws.length);
  for (const [i, draw] of draws.entries()) {
    const expected = sample.draws[i],
      g = draw.glyph;
    assert.deepEqual([g.y, g.x, g.y + g.h, g.x + g.w], expected.rect);
    assert.ok(Math.abs(draw.x - expected.x) < 0.0001, `${sample.text}: glyph ${i} x`);
    assert.equal(draw.y, expected.y, `${sample.text}: glyph ${i} y`);
  }
}
console.log(`Font: ${native.samples.length} original constructor/render traces match.`);
