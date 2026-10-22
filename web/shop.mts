import { canBuy } from './campaign.mjs';
import type { PurchaseRun, ShopItem } from './campaign.mjs';

type Item = ShopItem & { name: string; description: string };
type RecordLayout = {
  index: number;
  active: boolean;
  x: number;
  y: number;
  width: number;
  scale: number;
  image: string;
};
export type ShopData = { shop: { items: Item[]; layout: RecordLayout[] } };
export type ShopRun = PurchaseRun;
export type MenuImage = {
  op: 'blit' | 'scaled' | 'stretch';
  image: string;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  sx?: number;
  sy?: number;
  radians?: number;
  alpha?: number;
};
export type MenuText = {
  op: 'text';
  text: string;
  x: number;
  y: number;
  size: number;
  align: number;
  rgb: number[];
  alpha?: number;
  scale?: number[];
};
export type MenuFill = { op: 'fill'; rect: number[]; rgba: number[] };
export type MenuCommand = MenuImage | MenuText | MenuFill;
export type MenuButton = {
  text: string;
  rect: number[];
  action: () => void;
  normal?: string;
  pressed?: string;
  maxScale?: number;
};
const white = [255, 255, 255],
  yellow = [255, 255, 0],
  blue = [0, 205, 255];
const categories = [
  'Door Upgrades',
  'Sacrificers',
  'Tower Upgrades 1',
  'Tower Upgrades 2',
  'Tower Upgrades 3',
  'Gun Weapon',
  'Roof Weapon',
];
const headingWidths = [310, 314, 366, 334, 345, 340, 0];
const group = (index: number) => (index < 10 ? 0 : index < 80 ? 1 : Math.floor(index / 10) - 6);
const label = (text: string, x: number, y: number, rgb = white, size = 1, align = 2): MenuText => ({
  op: 'text',
  text,
  x,
  y,
  rgb,
  size,
  align,
});

export const resultAssets = [
  'frame_name.png',
  'shop_background.jpg',
  'shop_button_pas.png',
  'shop_button_act.png',
  'shop_buble.png',
];
export function shopAssets(data: ShopData) {
  return [
    'shop_background.jpg',
    'shop_button_pas.png',
    'shop_button_act.png',
    'shop_buble.png',
    'icon_gold.png',
    'icon_sacrifice.png',
    'font_interface.png',
    'hole_per.png',
    ...data.shop.layout.filter((r) => r.active).map((r) => r.image),
  ];
}

export function shopLayout(data: ShopData, run: ShopRun) {
  const disabled = run.config.disabledShopCategories;
  let width = 0;
  const items: (RecordLayout & { left: number; item: Item })[] = [];
  for (const record of data.shop.layout) {
    const category = categories[group(record.index)];
    if (disabled.includes(category)) {
      // The original retains the basic wooden door and its spacer even when door upgrades are disabled.
      if (record.index === 5) width += record.width;
      if (record.index !== 0) continue;
    }
    if (record.active) {
      const item = data.shop.items.find((i) => i.index === record.index);
      if (!item) throw Error(`Missing shop item ${record.index}`);
      items.push({
        ...record,
        left: width,
        item,
      });
    }
    width += record.width + (record.active ? 10 : 0);
  }
  return { items, width };
}

export function shopScene(data: ShopData, run: ShopRun, offset: number): MenuCommand[] {
  const commands: MenuCommand[] = [
    { op: 'stretch', image: 'shop_background.jpg', x: 0, y: 320, x2: 480, y2: 0 },
  ];
  for (const record of shopLayout(data, run).items) {
    const left = Math.trunc(offset) + record.left;
    if (left < -300 || left > 680) continue;
    const item = record.item,
      owned = run.inventory[item.inventoryIndex] === item.upgradeIndex;
    const affordable = run.gold >= item.goldCost && run.sacrifices >= item.sacrificeCost;
    const rgb = owned ? [100, 255, 100] : affordable ? white : [255, 55, 55];
    const alpha = owned || affordable ? 1 : 105 / 255,
      x = left + Math.trunc(record.x / 2);
    commands.push({
      op: 'scaled',
      image: record.image,
      x: left + record.x,
      y: 40 + record.y,
      sx: record.scale,
      sy: -record.scale,
      alpha,
    });
    commands.push(label(item.name, x, 80, rgb, Math.fround(0.66)));
    if (owned) commands.push(label(' In\nuse', x, 222, rgb, Math.fround(0.66)));
    else {
      commands.push(label(String(item.goldCost), x, 222, yellow, Math.fround(0.66)));
      if (item.sacrificeCost)
        commands.push(label(String(item.sacrificeCost), x + 4, 235, blue, Math.fround(0.66)));
    }
    if (item.inventoryIndex === 1)
      commands.push({
        op: 'scaled',
        image: 'hole_per.png',
        x: left + record.x + 8,
        y: 54 + record.y,
        sx: record.scale,
        sy: -record.scale,
        alpha,
      });
  }
  let x = Math.trunc(Math.fround(offset + 60));
  categories.forEach((category, i) => {
    if (run.config.disabledShopCategories.includes(category)) return;
    commands.push(label(`-${category}-`, x, 48, white, 1, 0));
    x += headingWidths[i];
  });
  commands.push(
    { op: 'blit', image: 'icon_gold.png', x: 1, y: 292 },
    label(String(run.gold), 22, 294, yellow, 1, 0),
    { op: 'blit', image: 'icon_sacrifice.png', x: 110, y: 287 },
    label(String(run.sacrifices), 133, 294, blue, 1, 0),
  );
  return commands;
}

export function shopHit(data: ShopData, run: ShopRun, offset: number, x: number, y: number) {
  if (y > 201 || y < 0) return null;
  let distance = 80,
    selected: Item | null = null;
  for (const record of shopLayout(data, run).items) {
    const d = Math.abs(record.left + record.x + Math.trunc(offset) - x);
    if (d < distance) {
      distance = d;
      selected = record.item;
    }
  }
  return selected && canBuy(data, run, selected.index) ? selected : null;
}

export class ShopScroll {
  offset = -525;
  frameOffset = -525;
  velocity = -300;
  dragging = false;
  lastX = 0;
  travel = 0;
  constructor(public width: number) {}
  down(x: number) {
    this.dragging = true;
    this.lastX = x;
    this.travel = 0;
  }
  move(x: number) {
    const delta = this.lastX - x;
    this.offset = Math.fround(this.offset - delta);
    this.velocity = Math.fround(this.velocity + delta);
    this.travel += delta;
    this.lastX = x;
  }
  up() {
    this.dragging = false;
    return Math.abs(this.travel) <= 19;
  }
  step() {
    const f = Math.fround,
      dt = f(1 / 60);
    if (!this.dragging) {
      if (this.offset > 25) this.offset = f(this.offset + f(dt * -400));
      this.offset = f(this.offset + f(f(dt * -10) * this.velocity));
    }
    this.velocity = f(this.velocity * 0.91);
    this.offset = Math.min(15, this.offset);
    // Native layout precedes the lower clamp, so hit testing uses the last drawn offset.
    this.frameOffset = this.offset;
    this.offset = Math.max(480 - this.width, this.offset);
  }
}

export class ResultScore {
  constructor(
    public score: number,
    public gold: number,
    public sacrifices: number,
    private difficulty: number,
  ) {}
  get active() {
    return this.gold > 0 || this.sacrifices > 0;
  }
  step() {
    if (this.gold > 0) {
      this.gold -= 2000;
      this.score += 2000;
    }
    if (this.sacrifices > 0) {
      this.sacrifices -= 2;
      this.score += this.difficulty * 4000;
    }
  }
}

export class PurchaseMotion {
  elapsed = 0;
  scale = 0;
  buttonScale = 0;
  get alpha() {
    return Math.trunc(Math.min(255, Math.fround(this.elapsed * 350))) / 255;
  }
  get active() {
    return this.alpha < 1;
  }
  step() {
    const f = Math.fround,
      dt = f(1 / 60);
    this.elapsed = f(this.elapsed + dt);
    this.scale = Math.min(1, f(this.scale + f(dt + dt)));
    this.buttonScale = Math.min(1, f(this.buttonScale + f(0.05)));
  }
}

export function buttonScene(
  button: Omit<MenuButton, 'action'>,
  pressed = false,
  motion?: { buttonScale: number; alpha: number },
): MenuCommand[] {
  const [x, y, w, h] = button.rect;
  const scale = Math.min(button.maxScale ?? 1, motion?.buttonScale ?? 1),
    alpha = motion?.alpha ?? 1;
  return [
    {
      op: 'scaled',
      image: pressed
        ? (button.pressed ?? 'shop_button_act.png')
        : (button.normal ?? 'shop_button_pas.png'),
      x: x + Math.trunc(w / 2),
      y: y + Math.trunc(h / 2),
      sx: scale,
      sy: -scale,
      alpha,
    },
    {
      ...label(
        button.text,
        x - 12 + Math.trunc(w / 2),
        y + Math.trunc(h / 2) - 15 + Number(pressed),
        white,
        scale,
      ),
      alpha,
    },
  ];
}

export function purchaseScene(description: string, motion?: PurchaseMotion): MenuCommand[] {
  return [
    ...dialogScene('Are you sure you want to\npurchase this?', motion),
    {
      ...label(description, 238, 122, yellow, motion?.scale ?? 1),
      alpha: motion?.alpha ?? 1,
    },
  ];
}

export function dialogScene(message: string, motion?: PurchaseMotion): MenuCommand[] {
  const scale = motion?.scale ?? 1,
    alpha = motion?.alpha ?? 1;
  return [
    {
      op: 'fill',
      rect: [0, 0, 320, 480],
      rgba: [105, 105, 5, Math.trunc(Math.fround(scale * 191))],
    },
    { op: 'scaled', image: 'shop_buble.png', x: 238, y: 138, sx: scale, sy: -scale, alpha },
    {
      ...label(message, 95, 70, white, scale, 0),
      alpha,
    },
  ];
}

export function resultScene(
  run: { phase: string; mode: string; day: number; kills: number; score: number },
  days: number,
  dayKills: number,
  score = run.score,
): MenuCommand[] {
  if (run.phase === 'shop')
    return [
      { op: 'blit', image: 'shop_background.jpg', x: 0, y: 0 },
      label(
        run.mode === 'campaign' ? `Day ${run.day} of ${days} results:` : `Day ${run.day} results:`,
        236,
        95,
        yellow,
      ),
      label(`Enemies Killed: ${dayKills}`, 240, 130, yellow),
      label(`Score: ${run.score}`, 240, 160, yellow),
    ];
  return [
    { op: 'stretch', image: 'shop_background.jpg', x: 0, y: 320, x2: 480, y2: -90 },
    label(run.phase === 'complete' ? 'Victory!' : 'Defeat!', 236, 120, yellow),
    label(`Day ${run.day} reached.`, 236, 150, yellow),
    label(`Total Enemies Killed: ${run.kills}`, 240, 180, yellow),
    label(`Final Score: ${score}`, 240, 210, yellow),
    ...(run.mode !== 'campaign'
      ? [
          { op: 'blit' as const, image: 'frame_name.png', x: 115, y: 30 },
          label('Enter your name:', 210, 5, yellow),
        ]
      : []),
  ];
}
