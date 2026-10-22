import type { MenuCommand, MenuText } from './shop.mjs';

export const optionAssets = [
  'menu_music_line.png',
  'menu_roller_music.png',
  'menu_checkbox.png',
  'menu_checkbox_v.png',
  'menu_checkbox_x.png',
];
export const optionDifficulties = ['easy', 'normal', 'hard'] as const;
export type OptionState = { difficulty: number; reverse: boolean; muted: boolean; volume: number };

export function readSettings(raw: string | null) {
  let saved: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      saved = parsed as Record<string, unknown>;
  } catch {}
  return {
    sound: saved?.sound !== false,
    power: saved?.power === true,
    reverse: saved?.reverse === true,
    muted: saved?.muted === true || saved?.sound === false,
    volume:
      typeof saved.volume === 'number' && Number.isFinite(saved.volume)
        ? Math.max(0, Math.min(1, saved.volume))
        : 0.5,
    difficulty: optionDifficulties.find((value) => value === saved.difficulty) ?? 'normal',
  };
}

export function optionInput(state: OptionState, x: number, y: number, moving = false): OptionState {
  x = Math.trunc(x);
  y = Math.trunc(y);
  const next = { ...state };
  if (moving) {
    if (x > 69 && x < 360 && y > 209 && y <= 254)
      next.volume = Math.fround(Math.trunc(x - 70) / 290);
  } else {
    if (x >= 0 && x < 480 && y >= 0 && y <= 99) next.difficulty = Math.floor(x / 160);
    if (x > 24 && x <= 149 && y > 115 && y <= 154) next.reverse = !state.reverse;
    if (x > 22 && x <= 149 && y > 155 && y <= 195) next.muted = !state.muted;
  }
  return next;
}

export function optionButtons(inGame: boolean) {
  return [
    { text: 'Done', rect: [15, 268, 146, 48] },
    ...(!inGame
      ? [
          { text: 'Cheat', rect: [215, 268, 146, 48] },
          { text: 'Reset', rect: [345, 268, 146, 48] },
        ]
      : []),
  ];
}

export const optionConfirmations = {
  cheat: '   This will unlock all\n      levels.\n      Are you sure?',
  reset: '   This will reset ALL game\n    data.\n      Are you sure?',
};

export function optionScene(state: OptionState): MenuCommand[] {
  const blit = (image: string, x: number, y: number): MenuCommand => ({ op: 'blit', image, x, y });
  const text = (
    text: string,
    x: number,
    y: number,
    rgb: number[],
    size = 1,
    align = 0,
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
    blit('menu_background.png', 0, 0),
    // Equivalent to the original background's glColor4ub(160,160,160,255).
    { op: 'fill', rect: [0, 0, 320, 480], rgba: [0, 0, 0, 95] },
    { op: 'fill', rect: [0, 0, 320, 480], rgba: [100, 100, 0, 230] },
    blit('menu_music_line.png', 0, 200),
    blit('menu_roller_music.png', Math.fround(Math.fround(state.volume * 290) + 45), 204),
    ...[5, 90].map(
      (y): MenuCommand => ({
        op: 'scaled',
        image: 'menu_music_line.png',
        x: 10,
        y,
        sx: 10,
        sy: -1,
        alpha: 1,
      }),
    ),
    text('Difficulty:', 240, 5, [245, 245, 0], 1, 2),
  ];
  ['Easy', 'Medium', 'Hard'].forEach((name, i) => {
    const x = [20, 170, 340][i];
    commands.push(blit('menu_checkbox.png', x, 32), text(name, x + 50, 42, [240, 240, 240]));
    if (state.difficulty === i) commands.push(blit('menu_checkbox_v.png', x, 32));
  });
  commands.push(text('Options:', 240, 90, [245, 245, 0], 1, 2));
  for (const [y, checked, title, note] of [
    [112, state.reverse, 'Reverse Orientation', '(Siege mode)'],
    [157, state.muted, 'Mute Music', '(Restart to use your music)'],
  ] as const) {
    commands.push(
      blit('menu_checkbox.png', 20, y),
      blit(checked ? 'menu_checkbox_v.png' : 'menu_checkbox_x.png', 20, y),
      text(title, 70, y + 5, [255, 255, 255], Math.fround(0.8)),
      text(note, 70, y + 20, [255, 255, 0], Math.fround(0.8)),
    );
  }
  return commands;
}
