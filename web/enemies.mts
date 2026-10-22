// Original sprite-pointer table includes repeated and nonconsecutive filenames.
export function enemySprite(
  animations: (string | null)[][][],
  kind: number,
  state: number,
  frame: number,
  flags: number,
): string | null {
  const pose =
    flags >>> 5 && (!(flags & 8) || state === 8)
      ? (flags >>> 5) - 1
      : state === 6 && flags & 16
        ? 3
        : flags & 8 && state !== 6 && state !== 9
          ? 7
          : state === 2 || state === 7
            ? 2
            : state === 3 || state === 8
              ? 3
              : state === 4
                ? 4
                : state === 6
                  ? 6
                  : state === 9
                    ? 5
                    : state === 5
                      ? 1
                      : state === 10
                        ? 9
                        : state === 11
                          ? 10
                          : flags & 2
                            ? 8
                            : 0;
  return animations[kind][pose][pose === 7 && state !== 8 ? 0 : Math.floor(frame)] ?? null;
}

type EnemyVisual = {
  kind: number;
  state: number;
  frame: number;
  flags: number;
  x: number;
  y: number;
  size: number;
  alpha: number;
  angle: number;
};
type EnemyDrawing = {
  op: 'scaled';
  image: string;
  x: number;
  y: number;
  radians: number;
  sx: number;
  sy: number;
  alpha: number;
  tint: number;
  blend: 'source-over' | 'screen';
};

export function enemyScene(animations: (string | null)[][][], u: EnemyVisual): EnemyDrawing[] {
  const image = enemySprite(animations, u.kind, u.state, u.frame, u.flags);
  if (!image) return [];
  const burning = Boolean(u.flags & 4);
  const draws: EnemyDrawing[] = [
    {
      op: 'scaled',
      image,
      x: u.x,
      y: u.y,
      radians: Math.fround(u.angle + Math.fround(Math.PI)),
      sx: -u.size,
      sy: u.size,
      alpha:
        u.state === 6 || u.state === 9 || u.kind === 7 || burning
          ? Math.trunc(Math.min(255, u.alpha * 255)) / 255
          : 1,
      tint: burning ? 70 : 255,
      blend: 'source-over',
    },
  ];
  if (u.kind === 6 && u.state !== 6 && u.flags & 1) {
    draws.push({
      op: 'scaled',
      image: 'wizard_shield_fx.png',
      x: u.x - 10,
      y: u.y - 12,
      radians: 0,
      sx: Math.fround(-u.size * 0.7),
      sy: Math.fround(u.size * Math.fround(-0.7)),
      alpha: 1,
      tint: 170,
      blend: 'screen',
    });
  }
  return draws;
}

type Sprite = HTMLImageElement | HTMLCanvasElement;
const tints = new WeakMap<Sprite, Map<number, HTMLCanvasElement>>();

export function tintEnemySprite(image: Sprite, tint: number): Sprite {
  if (tint === 255) return image;
  let variants = tints.get(image);
  if (!variants) {
    variants = new Map();
    tints.set(image, variants);
  }
  const cached = variants.get(tint);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const paint = canvas.getContext('2d');
  if (!paint) throw new Error('Cannot prepare enemy artwork');
  paint.drawImage(image, 0, 0);
  const pixels = paint.getImageData(0, 0, image.width, image.height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] *= tint / 255;
  }
  paint.putImageData(pixels, 0, 0);
  variants.set(tint, canvas);
  return canvas;
}
