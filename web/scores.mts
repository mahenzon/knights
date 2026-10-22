import type { MenuCommand, MenuText } from './shop.mjs';
import { playScene } from './play.mjs';

export type ScoreEntry = { name: string; score: number; highlighted: boolean };
export type ScoreTables = [ScoreEntry[], ScoreEntry[]];
export function scoreName(name: string) {
  let result = '';
  for (const letter of name) {
    if (new TextEncoder().encode(result + letter).length > 14) break;
    result += letter;
  }
  return result || 'PLAYER';
}
export function readScores(raw: string | null): ScoreTables {
  try {
    const value: unknown = JSON.parse(raw ?? 'null');
    if (Array.isArray(value) && value.length === 2) {
      const lists = value.map((list) =>
        Array.isArray(list)
          ? list
              .filter(
                (row): row is ScoreEntry =>
                  row !== null &&
                  typeof row === 'object' &&
                  typeof row.name === 'string' &&
                  new TextEncoder().encode(row.name).length <= 14 &&
                  Number.isSafeInteger(row.score) &&
                  row.score >= 0 &&
                  row.score <= 0xffffffff &&
                  typeof row.highlighted === 'boolean',
              )
              .sort((a, b) => b.score - a.score)
              .slice(0, 100)
          : [],
      );
      return [lists[0], lists[1]];
    }
  } catch {}
  return [[], []];
}
export function addScore(
  tables: ScoreTables,
  mode: 'endless' | 'madness',
  name: string,
  score: number,
): ScoreTables {
  if (!Number.isSafeInteger(score) || score < 0 || score > 0xffffffff) throw Error('Invalid score');
  const next: ScoreTables = [[], []];
  tables.forEach((list, i) => {
    next[i] = list.map((row) => ({ ...row, highlighted: false }));
  });
  const list = next[mode === 'endless' ? 0 : 1];
  list.push({ name: scoreName(name), score, highlighted: true });
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, 100);
  return next;
}
export const scoreButtons = [
  { text: 'Done', rect: [40, 267, 146, 48] },
  { text: 'Global', rect: [285, 267, 146, 48] },
];
export function scoreScene(tables: ScoreTables, offset = 0): MenuCommand[] {
  const label = (
    text: string,
    x: number,
    y: number,
    rgb = [255, 255, 255],
    size = 1,
    align = 2,
  ): MenuText => ({
    op: 'text',
    text,
    x,
    y,
    rgb,
    size,
    align,
    alpha: 1,
  });
  const commands: MenuCommand[] = [
    ...playScene(),
    label('-HIGH SCORES-', 230, 10, [70, 255, 0]),
    label('Endless Siege', 110, 45),
    label('Madness', 340, 45),
  ];
  for (let rank = 0; rank < 25; rank++) {
    const y = 70 + rank * 20 + offset;
    if (y < 70 || y > 230) continue;
    tables.forEach((list, mode) => {
      const x = 40 + mode * 230,
        entry = list[rank],
        size = Math.fround(0.7);
      commands.push(label(`${rank + 1}.`, x - 15, y, undefined, size, 0));
      if (entry) {
        commands.push(label(entry.name, x + 10, y, [215, 170, 20], size, 0));
        if (entry.highlighted) commands.push(label(entry.name, x + 10, y, [255, 255, 40], size, 0));
        commands.push(label(String(entry.score), x + 150, y, undefined, size));
      } else
        commands.push(
          label('-No Record-', x + 25, y, [170, 170, 170], size, 0),
          label('---', x + 175, y, [200, 200, 200], size),
        );
    });
  }
  return commands;
}
export class ScoreScroll {
  offset = 0;
  velocity = 0;
  dragging = false;
  lastY = 0;
  down(y: number) {
    this.lastY = Math.trunc(y);
  }
  move(y: number) {
    const delta = this.lastY - Math.trunc(y);
    this.velocity = Math.fround(delta * 20);
    this.offset = Math.min(0, Math.fround(this.offset - delta));
    this.lastY = Math.trunc(y);
    this.dragging = true;
  }
  up() {
    this.dragging = false;
  }
  step() {
    if (!this.dragging) {
      this.offset = Math.min(
        0,
        Math.fround(this.offset - Math.fround(Math.fround(1 / 60) * this.velocity)),
      );
      this.velocity = Math.fround(this.velocity * 0.9);
    }
  }
  get active() {
    return this.dragging || Math.abs(this.velocity) >= 0.05;
  }
}
