type Glyph = { x: number; y: number; w: number; h: number };
export function parseFont(source: string) {
  const glyphs = new Map<string, Glyph>();
  for (const line of source.split(/\r?\n/)) {
    const m = line.match(/^Char="(.*)",(\d+),(\d+),(\d+),(\d+),(-?\d+),(-?\d+)/);
    // The original constructor discards both bearing fields in the font file.
    if (m) glyphs.set(m[1], { x: +m[2], y: +m[3], w: +m[4], h: +m[5] });
  }
  return glyphs;
}

export function fontLayout(
  glyphs: Map<string, Glyph>,
  value: string,
  x: number,
  y: number,
  size = 1,
  align = 'left',
) {
  const draws: { glyph: Glyph; x: number; y: number }[] = [];
  const f = Math.fround,
    height = Math.max(...[...glyphs.values()].map((g) => g.h)),
    lines = value.split('\n'),
    widths = lines.map((line) =>
      [...line].reduce((sum, ch) => sum + ((glyphs.get(ch) ?? glyphs.get('?'))?.w ?? 16) - 16, 0),
    );
  size = f(size);
  for (const [index, line] of lines.entries()) {
    // Native alignment measures the widest remaining line, including following lines.
    const width = f(Math.max(...widths.slice(index)) * size);
    let cursor = f(
      x - (align === 'center' ? Math.trunc(width / 2) : align === 'right' ? width : 0),
    );
    for (const ch of line) {
      const g = glyphs.get(ch) ?? glyphs.get(' ');
      if (!g) continue;
      if (g === glyphs.get(' ')) cursor = f(cursor + 5);
      draws.push({ glyph: g, x: cursor, y });
      // Application initialization sets tracking to -16 for all three font aliases.
      cursor = f(cursor + f((g.w - 16) * size));
    }
    y = f(y + Math.trunc(f(height * size)));
  }
  return draws;
}
