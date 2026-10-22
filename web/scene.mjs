// Original 60 Hz dragon motion; checked against research/scene-data.json.
const f = Math.fround,
  dt = f(1 / 60),
  dragon = [];
let x = 360,
  y = -182,
  phase = 0,
  direction = 1,
  jaw = 0.5;
for (let frame = 0; frame <= 264; frame++) {
  if (frame > 60) {
    x = f(x + f(dt * -180));
    y = Math.min(0, f(y + f(f(dt * 105) * direction) + Math.sin(phase) * 130 * dt));
    phase = f(phase + f(dt * 5));
    if (x < 55) direction = -2;
    if (x < 215) jaw = f(jaw + f(dt * f(-1.1)));
    if (x < 85) jaw = f(jaw + f(dt * 8));
    jaw = Math.min(jaw, 0.5);
  }
  dragon.push({ x, y, jaw });
}
export function dragonPose(elapsed) {
  const frame = Math.round(elapsed * 60);
  return frame > 60 && frame < 264 ? dragon[frame] : null;
}

// Original DrawFlag moves for four seconds while the battlefield remains active.
const flags = [null];
let flagY = -600,
  amplitude = 20,
  flagPhase = 0,
  remaining = 4,
  flagDirection = 1;
for (let frame = 1; frame <= 490; frame++) {
  flagY = f(flagY + f(f(dt * 300) * flagDirection));
  if (flagY > -70) {
    amplitude = Math.max(0, f(amplitude + f(dt * -25)));
    flagY = -70;
    flagPhase = f(flagPhase + dt);
  }
  const y = Math.trunc(flagY + (flagY === -70 ? Math.sin(f(flagPhase * 15)) * amplitude : 0));
  remaining = f(remaining - dt);
  if (remaining < 0) flagDirection = -1;
  flags.push(y);
}
export function endFlagY(elapsed) {
  return flags[Math.min(490, Math.max(0, Math.round(elapsed * 60)))] ?? null;
}

// Original anchors and pivots, checked against research/weapon-followup.json.
const stones = ['stone_64.png', 'stone_medium.png', 'stone_big.png'];
export function missileScene({ kind, tier, x, y, angle, time }) {
  if (kind === 0)
    return [
      {
        op: 'blit',
        image: 'flamer_gun_fx_flash.png',
        x: Math.trunc(x) - 32,
        y: Math.trunc(y) - 32,
        radians: 0,
        blend: 'screen',
      },
      {
        op: 'blit',
        image: 'gun_gun_patron.png',
        x: Math.trunc(x) - 10,
        y: Math.trunc(y) - 9,
        radians: 0,
      },
    ];
  if (kind === 1) {
    const pulse = Math.sin(f(f(time) * 10));
    return [
      {
        op: 'scaled',
        image: 'fireball_oreol_fx.png',
        x,
        y: f(y + 13),
        radians: f(Math.PI),
        sx: f(pulse * -2.08),
        sy: f(pulse * 2.08),
        flip: 0,
        blend: 'screen',
      },
    ];
  }
  return [
    {
      op: 'rotated',
      image: kind === 2 ? 'freeze_gun_patron.png' : `td_ballista${tier + 1}_arrow.png`,
      x,
      y,
      radians: kind === 2 ? 0 : f(angle + Math.PI),
    },
  ];
}
const fireballs = ['fireball_small', 'fireball', 'fireball_big', 'iceball'];
const fireFrame = (tier, time, fps) =>
  `${fireballs[tier]}_${((Math.floor(f(f(time) * fps)) % 6) + 1).toString().padStart(4, '0')}.png`;
export function deviceScene({
  kind,
  tier,
  x,
  y,
  elapsed,
  cooldown,
  angle,
  recoil,
  animation,
  pressed = false,
  timerVisible = elapsed < cooldown,
  time = 0,
}) {
  const draws = [];
  const blit = (image, x, y) => draws.push({ op: 'blit', image, x, y, radians: 0 });
  const rotate = (image, x, y, radians) =>
    draws.push({ op: 'rotated', image, x: f(x), y: f(y), radians });
  const scaled = (image, x, y, radians, sx, sy) =>
    draws.push({
      op: 'scaled',
      image,
      x: f(x),
      y: f(y),
      radians: f(radians),
      sx: f(sx),
      sy: f(sy),
      flip: 0,
    });
  if (kind === 2) blit('tower_pod_stones.png', x, y);
  else if (kind === 5) blit('tower_pod_fireballs.png', x, y);
  else if (kind === 4) {
    blit('tower_pod_column_back.png', x, y);
    blit('tower_pod_column_button.png', x + 15, y + recoil + 10);
    draws.at(-1).clipBottom = y + 20;
    blit('tower_pod_column_front.png', x, y + 12);
  } else if (kind === 6) {
    rotate(
      ['upgrade_window_gun.png', 'upgrade_window_freezer.png', 'upgrade_window_flamer.png'][
        tier / 3
      ],
      x + 23 + Math.cos(angle) * 10 + recoil,
      y + 25 - Math.sin(angle) * 10,
      angle,
    );
    blit('castle_window.png', x + 45, y - 8);
  } else if (kind === 8) {
    blit(`tower_pod_ballista${tier + 1}.png`, x - 32, y - 48);
    draws.push({
      op: 'scaled',
      image: `td_ballista${tier + 1}_fire_${Math.floor(animation).toString().padStart(4, '0')}.png`,
      x: f(x + Math.cos(angle) * 5),
      y: f(y - 40 - Math.sin(angle) * 10),
      radians: angle,
      sx: 1,
      sy: -1,
      flip: 0,
    });
    if (pressed && tier > 0) {
      let curve = 0;
      for (let i = 0; i < 25; i++) {
        curve = f(curve + 0.315);
        rotate(
          'aim_ball.png',
          x - Math.cos(angle) * (i * 20),
          y - 30 - Math.sin(angle) * (i * 20) + f(i * curve),
          0,
        );
      }
    }
  } else if (kind === 7) {
    blit(
      `jump_platform_${Math.max(0, Math.floor(animation) - 1)
        .toString()
        .padStart(4, '0')}.png`,
      x - 55,
      y - 17,
    );
  }
  if ([2, 4, 5, 6, 8].includes(kind) && timerVisible) {
    const [dx, dy] = { 2: [30, 40], 4: [22, 30], 5: [25, 40], 6: [62, 10], 8: [20, -13] }[kind];
    const tx = x + dx,
      ty = y + dy;
    blit('timer.png', tx, ty);
    const end = f((elapsed / cooldown) * 2 * Math.PI - 1);
    rotate('timer_segment.png', tx + 14.5, ty + 15, end);
    draws.at(-1).blend = 'screen';
    for (let a = 0; a < end; a = f(a + f(Math.PI / 5))) {
      rotate('timer_segment.png', tx + 14.5, ty + 15, a);
      draws.at(-1).blend = 'screen';
    }
  }
  if (elapsed > cooldown && [2, 5].includes(kind)) {
    const start = draws.length;
    let size = f((f(elapsed / cooldown) - 1) * 20);
    if (kind === 2) {
      size = f(Math.min(f(0.7), size) * (tier ? 0.5 : 1));
      scaled(
        stones[tier],
        x + 44,
        f(y + [23, 27, 30][tier] - [25, 50, 75][tier] * size),
        Math.PI,
        size,
        size,
      );
    } else {
      const raised = tier > 1 && size >= f(0.4);
      size = Math.min(tier > 1 ? f(0.4) : 1, size);
      scaled(
        fireFrame(tier, time, 8),
        x + 34,
        f(y + 4 - 20 * size + (raised ? -3 : 0)),
        Math.PI,
        size,
        size,
      );
      const glow = f(0.6 + size * Math.sin(f(f(time) * 10)) * f(0.2));
      scaled('fireball_oreol_fx.png', x + 34, y + 10, 0, glow, glow);
      draws.at(-1).blend = 'screen';
    }
    for (let i = start; i < draws.length; i++) draws[i].afterActors = true;
  }
  return draws;
}

export function objectScene({ kind, tier, x, y, angle, size, charge, time }) {
  const draws = [],
    radians = f(angle + Math.PI);
  const scaled = (image, x, y, sx, sy) =>
    draws.push({ op: 'scaled', image, x: f(x), y: f(y), radians, sx: f(sx), sy: f(sy), flip: 0 });
  if (kind === 0 || kind === 1) {
    const limit = kind === 0 ? 2 : f(2.2),
      min = kind === 0 ? 1 : 1.5;
    let shadow = f((y - 290 + (kind === 0 ? 32 + 16 * tier : 128)) / (kind === 0 ? 100 : 80));
    shadow = Math.max(-limit, Math.min(limit, shadow));
    if (shadow > -min && shadow < min) shadow = min;
    scaled('stone_64_shadow.png', x, 290, -shadow, shadow);
    draws.at(-1).alpha = Math.trunc(f(255 / Math.abs(shadow))) / 255;
    scaled(
      kind === 0 ? stones[tier] : ['column_small.png', 'column_medium.png', 'column.png'][tier],
      x,
      y,
      -size,
      size,
    );
  } else if (kind === 2) {
    scaled(fireFrame(tier, time, 34), x, y, -charge, charge);
    const glow = charge * Math.sin(f(f(time) * 10)) * f(2.6);
    scaled(
      'fireball_oreol_fx.png',
      x - 13 * Math.sin(angle),
      y + 13 * Math.cos(angle),
      -glow,
      glow,
    );
    draws.at(-1).blend = 'screen';
  }
  return draws;
}

// Native land::Init/Process/Draw; fixtures in research/land-data.json.
export class Landscape {
  constructor(duration, seed = 73) {
    if (!Number.isFinite(duration) || duration < 1 || duration > 100000)
      throw Error('Invalid landscape duration');
    this.duration = duration;
    this.elapsed = 0;
    this.remaining = 7;
    this.current = 3;
    this.next = 3;
    this.fadeOut = 0;
    this.fadeIn = 0;
    this.angle = f(Math.PI / 4);
    this.targetAngle = this.angle;
    this.clouds = [
      [490, 60, 1.2, -60],
      [680, 90, 1.4, -50],
      [730, 46, 1.9, -90],
      [830, 120, 1.7, -70],
      [880, 76, 1.5, -40],
    ].map((c) => c.map(f));
    // Numeric seeds retain the scenery of older saves; new days use the shared game stream.
    const random =
      typeof seed === 'function'
        ? seed
        : () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff);
    this.stars = Array.from({ length: 30 }, () => [random() % 480, random() % 140]);
  }
  step() {
    for (const cloud of this.clouds) {
      cloud[0] = f(cloud[0] + f(dt * cloud[3]));
      if (cloud[0] < f(cloud[2] * -100)) cloud[0] = 490;
    }
    this.remaining = f(this.remaining - dt);
    if (this.remaining < 0) {
      this.next = (this.current + 1) % 4;
      this.fadeOut = 255;
      this.fadeIn = 0;
      this.targetAngle = [f(Math.PI), 4.263589859008789, f(2 * Math.PI), 2.1991147994995117][
        this.current
      ];
      this.remaining = f(this.duration / 3.5);
    }
    this.elapsed = f(this.elapsed + dt);
    this.angle = Math.min(this.targetAngle, f(this.angle + dt * 0.8));
    if (this.current !== this.next) {
      this.fadeOut = f(this.fadeOut + f(dt * -190));
      this.fadeIn = f(this.fadeIn + f(dt * 190));
      if (this.fadeOut < 0) {
        this.current = this.next;
        this.fadeOut = 0;
      }
    }
  }
  advanceTo(time, beforeFrame = false) {
    if (!Number.isFinite(time)) return;
    // shortcut: replay visuals on restore; add checkpoints if very long Endless saves load slowly.
    const target = Math.min(time, this.duration + 10);
    while ((beforeFrame ? f(this.elapsed + dt) : this.elapsed) < target) this.step();
  }
}
export function landscapeScene(land, background) {
  const draws = [],
    names = ['morning', 'day', 'evening', 'night'],
    b = background + 1;
  const { current, next, fadeIn, angle, stars, clouds } = land,
    changing = current !== next;
  const alpha = Math.trunc(fadeIn) / 255;
  const sky = (phase) => ({
    op: 'stretch',
    image: `back_${b}_${names[phase]}.png`,
    x: 0,
    y: 320,
    x2: 480,
    y2: 0,
  });
  draws.push(sky(current));
  if (changing) draws.push({ ...sky(next), alpha });
  if (current === 3 || (changing && current === 2)) {
    const starAlpha = changing ? Math.trunc(current === 3 ? f(255 - fadeIn) : fadeIn) / 255 : 1;
    for (let i = 0; i < stars.length; i++)
      draws.push({
        op: 'blit',
        image: 'star.png',
        x: stars[i][0],
        y: stars[i][1],
        alpha: starAlpha,
        ...(!changing && i > 0 ? { crop: [0, 0, 8, 8] } : {}),
      });
  }
  draws.push({
    op: 'scaled',
    image: 'sun.png',
    x: f(230 + Math.sin(angle) * 160),
    y: f(285 + Math.cos(angle) * 300),
    radians: 0,
    sx: 3,
    sy: 3,
    blend: 'screen',
  });
  for (const [x, y, size] of clouds) {
    const cloud = (phase) => ({
      op: 'scaled',
      image: `${b === 1 ? '' : `b${b}_`}cloud_${names[phase]}.png`,
      x,
      y,
      radians: 0,
      sx: size,
      sy: -size,
    });
    draws.push(cloud(current));
    if (changing) draws.push({ ...cloud(next), alpha });
  }
  draws.push({ op: 'blit', image: `background_0${b}.png`, x: 0, y: 64 });
  return draws;
}

// Original castle is drawn before attacks; a breached arch is repeated over the actors afterward.
export function castleScene(tier, flags, x, y) {
  const draws = [{ op: 'blit', image: 'castle_1.png', x: 302, y: 0 }];
  if (flags & 2) return draws;
  const image = [
    'castle_door_1_default.png',
    'castle_door_2_steel.png',
    'castle_door_3_gold.png',
    'castle_door_4_magic.png',
    'castle_door_5_horrendous.png',
  ][tier];
  draws.push({ op: 'blit', image, x, y });
  if (flags & 1) draws.push({ op: 'blit', image, x, y, blend: 'lighter' });
  draws.push({ op: 'blit', image: 'castle_enter_rez.png', x: 354, y: 136 });
  return draws;
}
