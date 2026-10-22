// Original DrawInterface at 0x6acc keeps the 24px cap when the door reaches zero HP.
export const hudBackdrop = {
  op: 'stretch',
  image: 'bottom_podlozhka.png',
  x: 0,
  y: 320,
  x2: 480,
  y2: 291,
};
export const pauseControl = {
  text: '',
  rect: [446, 291, 34, 29],
  normal: 'pause_pass.png',
  pressed: 'pause_act.png',
};

export function healthBar(hp: number, maximum: number) {
  const ratio = Math.fround(Math.max(0, Math.min(1, hp / maximum)));
  return {
    op: 'blit',
    image: `castle_progress_${ratio < 0.4 ? 'red' : ratio < 0.75 ? 'yellow' : 'blue'}.png`,
    x: 270,
    y: 291,
    crop: [0, 0, Math.trunc(Math.fround(24 + Math.fround(150 * ratio))), 32],
  };
}
