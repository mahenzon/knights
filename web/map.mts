import type { MenuCommand, MenuText } from './shop.mjs';

type Completed = Record<string, unknown>;
type Level = { mapPosition: number[] };
export type CastleRecord = { last: number; best: number };
type MapDraw = {
  op: string;
  image: string;
  x: number;
  y: number;
  radians?: number;
  sx?: number;
  sy?: number;
  alpha?: number;
  blend?: GlobalCompositeOperation;
};

type MarkerFrame = { scale: number; selected: boolean; flash: boolean };
type MapFrame = { markers: MarkerFrame[]; panel: number; time: number };

export const campaignCompleteText = '   Contratulations!\n You have defended all\n     castles.';

// mapMode draws the map before easing its camera, but the panels after moving them.
export class MapMotion {
  levels: Level[];
  selected = 0;
  camera = [-420, -180];
  target = [0, 0];
  manualCamera = true;
  pendingSelection = false;
  delay = 0;
  panel = 128;
  panelOpen = true;
  markers: (MarkerFrame & { flashTime: number })[];
  frameCamera: number[];
  frame: MapFrame;
  pointer: number[] | null = null;
  burst: { x: number; y: number; size: number; alpha: number } | null = null;
  constructor(levels: Level[]) {
    this.levels = levels;
    this.markers = levels.map((_, i) => ({
      scale: 0,
      selected: i === 0,
      flash: false,
      flashTime: 0,
    }));
    this.frameCamera = [...this.camera];
    this.frame = { markers: this.markers.map((m) => ({ ...m })), panel: this.panel, time: 0 };
  }
  enter(selected: number, won = false) {
    this.selected = selected;
    const [x, y] = this.levels[selected].mapPosition;
    this.panel = 128;
    this.panelOpen = true;
    this.manualCamera = true;
    this.pendingSelection = false;
    this.delay = 0;
    this.pointer = null;
    this.burst = null;
    if (won) {
      this.markers[selected].flash = true;
      this.markers[selected].flashTime = 1;
      this.burst = {
        x: Math.trunc(x + this.camera[0] + 16),
        y: Math.trunc(y + this.camera[1] + 6),
        size: Math.fround(0.2),
        alpha: 255,
      };
      this.markers.forEach((m, i) => {
        m.selected = selected < 11 && i === selected;
      });
      if (selected < 11) {
        const [nx, ny] = this.levels[selected + 1].mapPosition;
        this.target = [240 - nx, 160 - ny];
        this.manualCamera = false;
        this.pendingSelection = true;
        this.delay = 1.5;
      }
    }
    this.camera = [240 - x, 160 - y];
    this.frameCamera = [...this.camera];
    this.frame.panel = this.panel;
  }
  select(index: number) {
    this.manualCamera = true;
    this.markers.forEach((marker, i) => {
      marker.selected = i === index;
    });
    this.panelOpen = index >= 0;
    if (index >= 0) this.selected = index;
  }
  down(x: number, y: number, dialog = false) {
    this.manualCamera = true;
    if (dialog) return;
    this.pointer = [x, y];
    if (y >= 260) return;
    const index = this.levels.findIndex(
      ({ mapPosition: [mx, my] }) =>
        Math.trunc(x - mx - this.camera[0]) ** 2 + Math.trunc(y - my - this.camera[1]) ** 2 <= 2499,
    );
    this.select(index);
  }
  move(x: number, y: number, dialog = false) {
    if (dialog || !this.pointer) return;
    this.camera = mapCamera(
      this.camera[0] + x - this.pointer[0],
      this.camera[1] + y - this.pointer[1],
    );
    this.pointer = [x, y];
  }
  up() {
    this.pointer = null;
  }
  get active() {
    return (
      Boolean(this.pointer) ||
      Boolean(this.burst) ||
      this.panel !== (this.panelOpen ? 0 : 128) ||
      this.markers.some((m) => m.selected || m.flash || m.scale !== 1)
    );
  }
  step(time: number) {
    const f = Math.fround,
      dt = f(1 / 60);
    for (const marker of this.markers) {
      marker.scale = Math.max(1, Math.min(1.5, f(marker.scale + (marker.selected ? dt : -dt))));
      if (marker.flash) {
        marker.flashTime = f(marker.flashTime - dt);
        if (marker.flashTime < 0) marker.flash = false;
      }
    }
    this.frameCamera = [...this.camera];
    this.frame = { markers: this.markers.map((m) => ({ ...m })), panel: this.panel, time };
    this.delay = f(this.delay - dt);
    if (!this.manualCamera && this.delay < 0) {
      this.camera = this.camera.map((v, i) => f(v + f(f(dt * 10) * f(this.target[i] - v))));
      if (this.pendingSelection) {
        this.selected++;
        this.markers.forEach((m, i) => {
          m.selected = i === this.selected;
        });
        this.pendingSelection = false;
      }
    }
    this.panel = Math.max(0, Math.min(128, f(this.panel + f(dt * (this.panelOpen ? -350 : 350)))));
    this.frame.panel = this.panel;
    this.camera = mapCamera(...(this.camera as [number, number]));
    if (this.burst && this.burst.alpha <= 0) this.burst = null;
    if (this.burst) {
      this.burst.size = f(this.burst.size + f(dt * 7));
      this.burst.alpha = f(this.burst.alpha + f(dt * -120));
    }
  }
  effects(): MapDraw[] {
    return this.burst
      ? [
          {
            op: 'scaled',
            image: 'flamer_gun_fx_flash.png',
            x: this.burst.x,
            y: this.burst.y,
            radians: 0,
            sx: this.burst.size,
            sy: this.burst.size,
            alpha: Math.max(0, Math.trunc(this.burst.alpha)) / 255,
            blend: 'lighter',
          },
        ]
      : [];
  }
}

// Original mapMode: twelve 256px tiles, LevelData coordinates and camera bounds.
export const developerMode = (search: string) => new URLSearchParams(search).get('dev') === '1';
export const castleCompleted = (completed: Completed, index: number) =>
  ['easy', 'normal', 'hard'].some((d) => completed[`${d}:${index}`] === true);
export const castleAvailable = (completed: Completed, index: number) =>
  index === 0 || castleCompleted(completed, index) || castleCompleted(completed, index - 1);
export const mapCamera = (x: number, y: number) => [
  Math.max(-540, Math.min(-420, x)),
  Math.max(-430, Math.min(0, y)),
];
export function mapScene(
  levels: Level[],
  completed: Completed,
  camera: number[],
  selected: number,
  frame?: MapFrame,
) {
  const [dx, dy] = camera,
    draws: MapDraw[] = [];
  for (let i = 0; i < 12; i++)
    draws.push({
      op: 'blit',
      image: `map_${String(i + 1).padStart(2, '0')}.jpg`,
      x: dx + (i % 4) * 256,
      y: dy + Math.floor(i / 4) * 256,
    });
  levels.forEach((level, i) => {
    const [x, y] = level.mapPosition;
    const marker = frame?.markers[i],
      highlighted = marker?.selected ?? i === selected,
      scale = marker
        ? Math.fround(
            marker.scale +
              (highlighted ? Math.sin(Math.fround((frame?.time ?? 0) * 16)) * Math.fround(0.1) : 0),
          )
        : 1;
    draws.push({
      op: 'scaled',
      image: castleCompleted(completed, i)
        ? 'point_defending.png'
        : castleAvailable(completed, i)
          ? 'point_open.png'
          : 'point_capture.png',
      x: Math.fround(Math.fround(x + dx) + 14),
      y: Math.fround(Math.fround(y + dy) + 8),
      radians: 0,
      sx: scale,
      sy: -scale,
    });
    if (highlighted)
      draws.push({
        op: 'scaled',
        image: 'point_fx.png',
        x: Math.fround(Math.fround(x + dx) + 14),
        y: Math.fround(Math.fround(y + dy) + 8),
        radians: 0,
        sx: scale,
        sy: -scale,
      });
    if (marker?.flash)
      draws.push({
        op: 'scaled',
        image: 'freeze_gun_fx_flash.png',
        x: Math.fround(Math.fround(x + dx) + 14),
        y: Math.fround(Math.fround(y + dy) + 8),
        radians: 0,
        sx: scale,
        sy: Math.fround(-scale + Math.sin(Math.fround((frame?.time ?? 0) * 10)) * 0.3),
        blend: 'screen',
      });
  });
  draws.push(
    { op: 'blit', image: 'map_interface.png', x: 0, y: Math.fround(192 + (frame?.panel ?? 0)) },
    { op: 'blit', image: 'map_interface_up.png', x: 0, y: -(frame?.panel ?? 0) || 0 },
  );
  return draws;
}

export const mapControls = [
  { text: 'Menu', rect: [-4, 270, 115, 61] },
  { text: 'Play', rect: [378, 270, 115, 61] },
  {
    text: '',
    label: 'Castle hint',
    rect: [326, 265, 60, 60],
    normal: 'button_i_pass.png',
    pressed: 'button_i_act.png',
  },
];

export function readCastleRecords(raw: string | null): CastleRecord[] {
  let records: unknown;
  try {
    records = JSON.parse(raw ?? 'null');
  } catch {}
  return Array.from({ length: 12 }, (_, i) => {
    const row = Array.isArray(records) ? records[i] : null;
    return row &&
      typeof row === 'object' &&
      [row.last, row.best].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff)
      ? { last: row.last, best: row.best }
      : { last: 0, best: 0 };
  });
}

export function recordCastleScore(records: CastleRecord[], castle: number, score: number) {
  if (
    !Number.isInteger(castle) ||
    castle < 0 ||
    castle >= 12 ||
    !Number.isSafeInteger(score) ||
    score < 0 ||
    score > 0xffffffff
  )
    throw Error('Invalid castle score');
  return records.map((row, i) =>
    i === castle ? { last: score, best: Math.max(row.best, score) } : row,
  );
}

export function mapDetails(
  level: { name: string; dayCount: number },
  selected: number,
  completed: boolean,
  record: CastleRecord,
  panel = 0,
): MenuCommand[] {
  const label = (
    text: string,
    x: number,
    y: number,
    rgb: number[],
    size = 0.8,
    align = 0,
  ): MenuText => ({
    op: 'text',
    text,
    x: Math.fround(x),
    y: Math.fround(y),
    rgb,
    size: Math.fround(size),
    align,
    alpha: 1,
  });
  const score = (n: number) => (n ? String(n).padStart(3, '0') : '---');
  const commands: MenuCommand[] = [
    label(`Level ${selected + 1}`, 126, 278 + panel, [255, 175, 60], 0.8, 2),
    label(level.name, 244, 278 + panel, [255, 255, 40], 0.8, 2),
    label(`Survive ${level.dayCount} days`, 115, 297 + panel, [255, 255, 255]),
    label('Last Score:', 5, 2 - panel, [0, 255, 255], 0.7),
    label(score(record.last), 99, 1 - panel, [245, 245, 245]),
    label('Best Score:', 191, 2 - panel, [245, 215, 0], 0.7),
    label(score(record.best), 286, 1 - panel, [245, 245, 245]),
  ];
  if (completed) {
    const stars = Math.max(
      1,
      Math.min(5, Math.trunc(Math.fround(Math.trunc(record.best / level.dayCount) / 4500))),
    );
    for (let i = 0; i < stars; i++)
      commands.push({ op: 'blit', image: 'mapstar.png', x: 378 + i * 20, y: 2 - panel });
  }
  return commands;
}
