import type { EquipmentData, EquippedRun } from './campaign.mjs';
import { equipment } from './campaign.mjs';

type ArtIndex = Record<string, [string, number, number]>;
type GameData = {
  assets: string[];
  smokeSprites: string[];
  fragmentSprites: string[];
  enemySprites: string[];
  enemyAnimations: (string | null)[][][];
} & EquipmentData;
type DayRun = EquippedRun & { background: number };

export const helpAssets = Array.from({ length: 5 }, (_, i) => `help_0${i + 1}.jpg`);

export const mapAssets = [
  ...Array.from({ length: 12 }, (_, i) => `map_${String(i + 1).padStart(2, '0')}.jpg`),
  'map_interface.png',
  'map_interface_up.png',
  'point_capture.png',
  'point_defending.png',
  'point_open.png',
  'point_fx.png',
  'freeze_gun_fx_flash.png',
  'flamer_gun_fx_flash.png',
  'mapstar.png',
  'button_i_pass.png',
  'button_i_act.png',
  'shop_button_pas.png',
  'shop_button_act.png',
  'shop_buble.png',
];

export function battleAssets(data: GameData, kinds: number[], run: DayRun) {
  const prefixes = [...new Set(kinds)].map((kind) => `${data.enemySprites[kind]}_`);
  const names = data.assets.filter(
    (n) => n.endsWith('.png') && prefixes.some((p) => n.startsWith(p)),
  );
  for (const kind of new Set(kinds))
    for (const sequence of data.enemyAnimations[kind])
      for (const name of sequence) if (name) names.push(name);
  names.push(...data.smokeSprites, ...data.fragmentSprites);
  names.push(
    'sun.png',
    'star.png',
    'castle_1.png',
    'castle_enter_rez.png',
    'icon_gold.png',
    'icon_sacrifice.png',
    'castle_progressbar.png',
    'castle_progress_blue.png',
    'castle_progress_yellow.png',
    'castle_progress_red.png',
    'font_interface.png',
    'flag.png',
    'bottom_podlozhka.png',
    'pause_pass.png',
    'pause_act.png',
  );
  names.push(
    [
      'castle_door_1_default.png',
      'castle_door_2_steel.png',
      'castle_door_3_gold.png',
      'castle_door_4_magic.png',
      'castle_door_5_horrendous.png',
    ][run.inventory[0]],
  );
  // Captives and enemy projectiles can outlive the enemy that created them.
  names.push(
    'skeleton.png',
    'horse_sceleton.png',
    'catapult_sceleton.png',
    'ballista_sceleton.png',
    'barrel.png',
    'catapult_stone.png',
    'wizard_fireball.png',
    'ballista_arrow.png',
    'wizard_shield_fx.png',
  );
  for (const { typeId: kind, upgradeIndex: tier } of equipment(data, run)) {
    if (kind === 0)
      names.push('altar_dragon.png', 'altar_hook.png', 'reddrake_head.png', 'reddrake_jaw.png');
    if (kind === 3) names.push('hole_zad.png', 'hole_krishka.png', 'hole_per.png');
    if ([2, 4, 5, 6, 8].includes(kind)) names.push('timer.png', 'timer_segment.png');
    let pattern = null;
    if (kind === 2) pattern = /^(tower_pod_stones|stone_(64|medium|big))/;
    if (kind === 4) pattern = /^(tower_pod_column|column(_small|_medium)?\.|stone_64_shadow)/;
    if (kind === 5) pattern = /^(tower_pod_fireballs|fireball|iceball)/;
    if (kind === 6)
      names.push(
        'castle_window.png',
        'flamer_gun_fx_flash.png',
        'fireball_oreol_fx.png',
        ['upgrade_window_gun.png', 'upgrade_window_freezer.png', 'upgrade_window_flamer.png'][
          Math.floor(tier / 3)
        ],
        ['gun_gun_patron.png', 'freeze_gun_patron.png', 'flamer_gun_fx_flash.png'][
          Math.floor(tier / 3)
        ],
      );
    if (kind === 7) pattern = /^jump_platform/;
    if (kind === 8) {
      pattern = new RegExp(`^(tower_pod_ballista${tier + 1}|td_ballista${tier + 1}_)`);
      if (tier > 0) names.push('aim_ball.png');
    }
    if (pattern) names.push(...data.assets.filter((n) => n.endsWith('.png') && pattern.test(n)));
  }
  const b = run.background + 1;
  names.push(`background_0${b}.png`, `background_0${b}_perplan.png`);
  for (const phase of ['morning', 'day', 'evening', 'night'])
    names.push(`back_${b}_${phase}.png`, `${b === 1 ? '' : `b${b}_`}cloud_${phase}.png`);
  return [...new Set(names)];
}

// Build-time packs remove hundreds of HTTP round trips without changing image pixels.
export class ImageLoader {
  index: ArtIndex;
  assets: Map<string, CanvasImageSource>;
  decode: (name: string, blob: Blob) => Promise<CanvasImageSource>;
  pending: Map<string, Promise<void>>;
  packs: Map<string, Promise<Blob>>;
  constructor(
    index: ArtIndex,
    assets: Map<string, CanvasImageSource>,
    decode: (name: string, blob: Blob) => Promise<CanvasImageSource>,
  ) {
    this.index = index;
    this.assets = assets;
    this.decode = decode;
    this.pending = new Map();
    this.packs = new Map();
  }
  async blob(name: string) {
    const entry = this.index[name];
    if (!entry) throw Error(`Missing artwork: ${name}`);
    const [pack, offset, length] = entry;
    if (
      !/^[a-z0-9_-]+$/.test(pack) ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(length) ||
      length <= 0
    )
      throw Error('Invalid artwork index');
    let pending = this.packs.get(pack);
    if (!pending) {
      pending = (async () => {
        try {
          const r = await fetch(`./art/${pack}.pack`);
          if (!r.ok) throw Error('Artwork download failed');
          return await r.blob();
        } catch (error) {
          this.packs.delete(pack);
          throw error;
        }
      })();
      this.packs.set(pack, pending);
    }
    const blob = await pending;
    if (offset + length > blob.size) {
      this.packs.delete(pack);
      throw Error('Incomplete artwork pack');
    }
    return blob.slice(offset, offset + length, name.endsWith('.jpg') ? 'image/jpeg' : 'image/png');
  }
  image(name: string) {
    if (this.assets.has(name)) return Promise.resolve();
    let pending = this.pending.get(name);
    if (!pending) {
      pending = (async () => {
        try {
          this.assets.set(name, await this.decode(name, await this.blob(name)));
        } catch (error) {
          this.packs.delete(this.index[name]?.[0]);
          throw error;
        } finally {
          this.pending.delete(name);
        }
      })();
      this.pending.set(name, pending);
    }
    return pending;
  }
  async load(names: string[], progress: (value: number) => void = () => {}) {
    names = [...new Set(names)].filter((n) => !this.assets.has(n));
    let cursor = 0,
      complete = 0;
    await Promise.all(
      Array.from({ length: 6 }, async () => {
        while (cursor < names.length) {
          await this.image(names[cursor++]);
          progress(++complete / names.length);
        }
      }),
    );
    progress(1);
  }
}
