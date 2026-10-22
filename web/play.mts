import { buttonScene, type MenuCommand } from './shop.mjs';

export const mainControls = [
  {
    text: 'Tell a friend',
    rect: [40, 280, 220, 42],
    normal: 'menu_big_button.png',
    pressed: 'menu_big_button_active.png',
  },
  ...[
    { label: 'Play', rect: [285, 20, 190, 42] },
    { label: 'Scores', rect: [290, 80, 190, 42] },
    { label: 'Options', rect: [292, 134, 190, 48] },
    { label: 'Help', rect: [303, 190, 190, 48] },
    { label: 'Credits', rect: [292, 242, 190, 48] },
  ].map((button) => ({ ...button, text: '', pressed: `menu_b_${button.label.toLowerCase()}.png` })),
];

export const mainAssets = mainControls.map((button) => button.pressed);

export function mainScene(motion: PlayMotion, pressed = -1): MenuCommand[] {
  return [
    { op: 'blit', image: 'menu_background.png', x: 0, y: 0 },
    ...buttonScene(mainControls[0], pressed === 0, motion),
    ...(pressed > 0 ? buttonScene(mainControls[pressed], true) : []),
  ];
}

export function friendMail(pageUrl: string): string {
  const game = new URL('.', pageUrl);
  const link =
    new URL(pageUrl).searchParams.get('legacyShare') === '1'
      ? 'http://itunes.apple.com/WebObjects/MZStore.woa/wa/viewSoftware?id=297805402&mt=8'
      : `${game.origin}${game.pathname}`;
  const body = `\nKnights Onrush:\n${link}\n`;
  return `mailto:?subject=${encodeURIComponent('Knights Onrush')}&body=${encodeURIComponent(body)}`;
}

let sharing = false;
export async function tellFriend(
  page: Pick<Location, 'href'>,
  device: Pick<Navigator, 'share'>,
): Promise<void> {
  if (sharing) return;
  const pageUrl = page.href;
  if (new URL(pageUrl).searchParams.get('legacyShare') === '1' || !device.share) {
    page.href = friendMail(pageUrl);
    return;
  }
  sharing = true;
  try {
    const game = new URL('.', pageUrl);
    // Call before any await so the native sheet retains the button's user activation.
    await device.share({ title: 'Knights Onrush', url: `${game.origin}${game.pathname}` });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'AbortError') page.href = friendMail(pageUrl);
  } finally {
    sharing = false;
  }
}

export const helpControls = [
  { text: 'Exit', rect: [12, 6, 80, 45], maxScale: Math.fround(0.85) },
  ...Array.from({ length: 5 }, (_, i) => ({ text: '', rect: [5, 53 + i * 47, 60, 46] })),
];

export const creditsControls = [
  { text: 'Done', rect: [25, 265, 100, 48] },
  { text: 'Visit', rect: [340, 265, 100, 48] },
];

export class CreditsMotion {
  scales: number[];
  buttonScale = 0;
  alpha = 1;
  constructor(random = Math.random) {
    this.scales = [3, 6, 10].map((base) => base + Math.floor(random() * 5));
  }
  get active() {
    return this.scales.some((scale) => scale > 1) || this.buttonScale < 1;
  }
  step() {
    this.scales = this.scales.map((scale) =>
      Math.max(1, Math.fround(scale + Math.fround(Math.fround(1 / 60) * -12))),
    );
    this.buttonScale = Math.min(1, Math.fround(this.buttonScale + Math.fround(0.05)));
  }
}

export function creditsScene(scales: number[]): MenuCommand[] {
  const rows: [string, number, number, number, number[]][] = [
    ['Moregames Entertainment 2009', 230, 10, 0, [255, 255, 255]],
    ['http://imoregames.com', 230, 30, 0, [115, 215, 255]],
    ['Art and Design:', 110, 65, 1, [255, 255, 255]],
    ['Andrey Kovalchuk', 110, 85, 1, [255, 255, 100]],
    ['Programming:', 370, 65, 1, [255, 255, 255]],
    ['Pavel Kupriyanov', 370, 85, 1, [255, 255, 100]],
    ['Sound by:', 230, 130, 2, [255, 255, 255]],
    ['Strategic Music Studio', 230, 148, 2, [255, 255, 100]],
    ['Music by:', 230, 200, 2, [255, 255, 255]],
    ['Michael Kotov', 230, 218, 2, [255, 255, 100]],
  ];
  return [
    ...playScene(),
    ...rows.map(([text, x, y, group, rgb]) => ({
      op: 'text' as const,
      text,
      x,
      y,
      align: 2,
      size: 1,
      rgb,
      alpha: 1,
      scale: [group === 1 ? 1 : scales[group], group === 0 ? 1 : scales[group]],
    })),
  ];
}

export const playAssets = [
  'menu_big_button.png',
  'menu_big_button_active.png',
  'shop_buble.png',
  'shop_button_pas.png',
  'shop_button_act.png',
];

export const playControls = [
  { text: 'Campaign', rect: [135, 60, 220, 42] },
  { text: 'Endless Siege', rect: [135, 125, 220, 42] },
  { text: 'Madness', rect: [135, 190, 220, 42] },
  { text: 'Back', rect: [135, 270, 220, 42] },
].map((button, i) => ({
  ...button,
  normal: i === 3 ? 'menu_big_button_active.png' : 'menu_big_button.png',
  pressed: 'menu_big_button_active.png',
  maxScale: i === 3 ? Math.fround(0.85) : 1,
}));

export class PlayMotion {
  fade = 0;
  buttonScale = 0;
  alpha = 1;
  get active() {
    return this.fade < 210 || this.buttonScale < 1;
  }
  step() {
    const f = Math.fround;
    this.fade = Math.min(210, f(this.fade + f(f(1 / 60) * 1000)));
    this.buttonScale = Math.min(1, f(this.buttonScale + f(0.05)));
  }
}

export function playScene(fade = 210): MenuCommand[] {
  return [
    { op: 'blit', image: 'menu_background.png', x: 0, y: 0 },
    { op: 'fill', rect: [0, 0, 320, 480], rgba: [100, 100, 0, Math.trunc(fade)] },
  ];
}

export class PauseMotion {
  y = -350;
  get active() {
    return this.y < 40;
  }
  step() {
    this.y = Math.min(40, this.y + 24);
  }
}

export function pauseControls(y = 40) {
  return ['Resume', 'Options', 'Abort'].map((text, i) => ({
    text,
    rect: [145, y + 30 + i * 60, 190, 50],
  }));
}

export const pauseShade: MenuCommand = {
  op: 'fill',
  rect: [0, 0, 320, 480],
  rgba: [15, 40, 15, 170],
};

// Read only enough metadata to offer recovery; resumeSaved validates the full checkpoint.
export function savedMode(raw: string | null): string | null {
  try {
    const saved = JSON.parse(raw ?? 'null');
    if (saved?.available === false) return null;
    if (
      saved?.version === 3 &&
      saved.run?.phase !== 'failed' &&
      ['campaign', 'endless', 'madness'].includes(saved.run?.mode)
    )
      return saved.run.mode;
    if (saved?.version === 2) return 'campaign';
  } catch {}
  return null;
}
