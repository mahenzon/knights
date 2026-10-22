// Campaign/economy orchestration; per-frame physics remains in Rust.
// Formulas and placements come from research/campaign-rules.md.
const f = Math.fround;
export const difficulties = ['easy', 'normal', 'hard'] as const;
export const modes = ['campaign', 'endless', 'madness'] as const;

export type Difficulty = (typeof difficulties)[number];
export type Mode = (typeof modes)[number];
export type Device = { slot: number; typeId: number; x: number; y: number; upgradeIndex: number };
export type Placement = Omit<Device, 'upgradeIndex'> & {
  inventoryIndex: number;
  upgradeMultiplier?: number;
};
export type DayConfig = {
  dayNumber: number;
  durationSeconds: number;
  tripleSpawn: boolean;
  mirrorLevel: boolean;
  enemyTypeTable: number[];
  artefactInitializers: Device[];
  disabledShopCategories: string[];
  enemyModifiers: { randomWalkSpeedRange: number; attackRangeOffset: number };
  wave: {
    pressureGrowthPerSecond: number;
    initialPressure: number;
    additiveWalkSpeed: number;
    allowedEnemyPrefix: number;
    forcedSpawnInterval: number;
    hpMultiplierMinusOne: number;
    giantProbability: number;
    enemyPrefixGrowthPerSecond: number;
  };
};
export type ShopItem = {
  index: number;
  inventoryIndex: number;
  upgradeIndex: number;
  category: string;
  goldCost: number;
  sacrificeCost: number;
};
export type ShopCatalog = { shop: { items: ShopItem[] } };
export type EquipmentData = { shop: { placements: Placement[] } };
export type CampaignData = ShopCatalog &
  EquipmentData & {
    levels: {
      backgroundId: number;
      dayCount: number;
      difficulties: Record<Difficulty, DayConfig[]>;
    }[];
  };
type RunState = {
  version: 1;
  mode: Mode;
  level: number;
  difficulty: Difficulty;
  seed: number;
  landscapeSeed?: number;
  day: number;
  inventory: number[];
  gold: number;
  sacrifices: number;
  score: number;
  kills: number;
  mirror: boolean;
  prefixGrowth: number;
  enemyTable: number[];
  background: number;
};
export type SavedRun = RunState & {
  phase: 'battle' | 'shop' | 'complete' | 'failed';
  config: DayConfig;
};
export type Run = SavedRun | (RunState & { phase: 'ready'; config: null });
export type PurchaseRun = Pick<RunState, 'inventory' | 'gold' | 'sacrifices'> & {
  phase: string;
  config: Pick<DayConfig, 'disabledShopCategories'>;
};
export type EquippedRun = Pick<RunState, 'inventory'> & {
  config: Pick<DayConfig, 'artefactInitializers'>;
};
export type BattleCore = {
  configure(index: number, value: number): number;
  enemy_type(index: number, value: number): number;
  start(
    seed: number,
    hp: number,
    gold: number,
    sacrifices: number,
    score: number,
    nextDay?: number,
  ): number;
  clear_equipment(): void;
  equip(slot: number, type: number, upgrade: number, x: number, y: number): number;
};
type BattleResult = {
  won: boolean;
  gold: number;
  sacrifices: number;
  score: number;
  kills: number;
};

export function random(run: Pick<RunState, 'seed'>) {
  run.seed ||= 1; // Match core.start when migrating an older zero-seed run.
  run.seed ^= run.seed << 13;
  run.seed ^= run.seed >>> 17;
  run.seed ^= run.seed << 5;
  run.seed >>>= 0;
  return run.seed & 0x7fffffff;
}
export function createRun(
  data: CampaignData,
  mode: Mode,
  level: number,
  difficulty: Difficulty,
  seed: number,
): Run {
  const run: Run = {
    version: 1,
    mode,
    level,
    difficulty,
    seed: seed >>> 0 || 1,
    day: 1,
    phase: 'ready',
    inventory: Array(13).fill(-1),
    gold: 0,
    sacrifices: 0,
    score: 0,
    kills: 0,
    mirror: false,
    prefixGrowth: 0,
    enemyTable: Array(20).fill(0),
    background: data.levels[level].backgroundId,
    config: null,
  };
  // InitMode selects a loading hint before InitNewGame and the background draw.
  random(run);
  run.inventory[0] = mode === 'madness' || (mode === 'campaign' && level === 7) ? 1 : 0;
  if (mode !== 'campaign') run.background = random(run) % 4;
  // InitNewGame calls the selected castle initializer before SetupNewLevel calls it again.
  if (mode === 'campaign' && (level === 9 || level === 11)) makeDay(data, run);
  return run;
}
export function makeDay(data: CampaignData, run: Run, rng = () => random(run)): DayConfig {
  const day = run.day - 1;
  if (run.mode === 'campaign' && run.level !== 9) {
    const config = structuredClone(data.levels[run.level].difficulties[run.difficulty][day]);
    if (run.level === 11) config.durationSeconds = 27 + 3 * day + (rng() % 40);
    return config;
  }
  const endless = run.mode !== 'campaign',
    d = day + (run.mode === 'madness' ? 7 : 0);
  const duration = 30 + (endless ? 5 : 4) * d + (rng() % 40);
  const n = endless ? (d > 10 ? 11 : Math.min(d + 1, 10)) : 6,
    table = run.enemyTable.slice();
  for (let i = 0; i < n; i++) table[i] = i;
  for (let i = 0; i < 100; i++) {
    const a = rng() % n,
      b = rng() % n;
    [table[a], table[b]] = [table[b], table[a]];
  }
  const staged = endless ? rng() % 4 === 0 : rng() % 3 !== 0;
  if (staged) run.prefixGrowth = f(0.1);
  const artefacts: Device[] = [];
  const platform = (x: number) =>
    artefacts.push({ slot: 6, typeId: 7, x, y: 236, upgradeIndex: 0 });
  if (endless) {
    if (d % 15 === 14) platform(-150);
    if (d % 10 === 9) platform(20);
  } else {
    if (rng() % 4 === 0) platform(-50);
    if (rng() % 3 === 0) platform(150);
  }
  const triple = rng() % 4 === 0;
  let pressure = f((55 + 30 * d) * (triple ? (endless ? 0.33 : 0.4) : 1)),
    speed = 20 + (endless ? 12 : 9) * d,
    interval = -1;
  if (run.difficulty === 'easy') {
    pressure = f(pressure * f(run.day <= 3 ? 0.8 : 0.45));
    speed = f(speed * f(run.day <= 3 ? 0.7 : 0.5));
    interval = f(interval * f(run.day <= 3 ? 1.5 : 1.4));
  } else if (run.difficulty === 'hard') {
    pressure = f(pressure * f(1.2));
    speed = f(speed * f(1.2));
    interval = f(interval * f(0.8));
  }
  run.enemyTable = table;
  return {
    dayNumber: run.day,
    durationSeconds: duration,
    tripleSpawn: triple,
    mirrorLevel: endless ? run.mirror : day % 2 === 0,
    enemyTypeTable: table.slice(0, endless ? 4 : day % 2 === 0 ? 4 : 3),
    artefactInitializers: artefacts,
    disabledShopCategories: [],
    enemyModifiers: { randomWalkSpeedRange: (endless ? 12 : 9) * d, attackRangeOffset: 0 },
    wave: {
      pressureGrowthPerSecond: 2,
      initialPressure: pressure,
      additiveWalkSpeed: speed,
      allowedEnemyPrefix: staged ? 0 : 20,
      forcedSpawnInterval: interval,
      hpMultiplierMinusOne: 0,
      giantProbability: 0,
      enemyPrefixGrowthPerSecond: run.prefixGrowth,
    },
  };
}
export function dayCount(data: CampaignData, run: Pick<RunState, 'mode' | 'level'>) {
  return run.mode === 'campaign' ? data.levels[run.level].dayCount : 10000;
}
export function prepareDay(data: CampaignData, previous: Run): SavedRun {
  if (!['ready', 'shop'].includes(previous.phase))
    throw Error('This battle is not ready to advance');
  const run = structuredClone(previous);
  if (run.phase === 'shop') {
    run.day++;
    random(run); // ClearLoadUpdateFuction runs again before each day's setup.
  }
  if (run.day > dayCount(data, run)) throw Error('This castle is already complete');
  if (run.mode === 'madness') run.inventory[0] = Math.max(1, run.inventory[0]);
  if (run.mode === 'campaign' && run.level === 7) run.inventory[0] = 1;
  const config = makeDay(data, run);
  return { ...run, config, phase: 'battle' };
}
export function health(run: Pick<RunState, 'inventory' | 'difficulty'>) {
  const tier = run.inventory[0];
  let hp = 100 + 200 * tier;
  if (tier > 3) hp = f(hp * f(1.2));
  return run.difficulty === 'easy' ? hp * 2 : hp;
}
export function equipment(data: EquipmentData, run: EquippedRun) {
  const slots = new Map(run.config.artefactInitializers.map((d) => [d.slot, { ...d }]));
  for (const p of data.shop.placements)
    if (run.inventory[p.inventoryIndex] >= 0)
      slots.set(p.slot, {
        ...p,
        upgradeIndex: run.inventory[p.inventoryIndex] * (p.upgradeMultiplier || 1),
      });
  return [...slots.values()];
}
export function startBattle(core: BattleCore, data: CampaignData, run: SavedRun, seed: number) {
  const c = run.config,
    w = c.wave;
  [
    c.durationSeconds,
    w.initialPressure,
    w.pressureGrowthPerSecond,
    w.additiveWalkSpeed,
    c.enemyModifiers.randomWalkSpeedRange,
    w.hpMultiplierMinusOne,
    w.giantProbability,
    w.allowedEnemyPrefix,
    w.enemyPrefixGrowthPerSecond,
    w.forcedSpawnInterval,
    Number(c.tripleSpawn),
    difficulties.indexOf(run.difficulty),
    c.enemyModifiers.attackRangeOffset,
  ].forEach((v, i) => {
    if (!core.configure(i, v)) throw Error('Invalid day configuration');
  });
  c.enemyTypeTable.forEach((v, i) => {
    if (!core.enemy_type(i, v)) throw Error('Invalid enemy type');
  });
  if (!core.start(seed, health(run), run.gold, run.sacrifices, run.score, Number(run.day > 1)))
    throw Error('Could not start the simulation');
  core.clear_equipment();
  for (const d of equipment(data, run))
    if (!core.equip(d.slot, d.typeId, d.upgradeIndex, d.x, d.y)) throw Error('Invalid equipment');
}
export function finishDay(
  data: CampaignData,
  run: SavedRun,
  { won, gold, sacrifices, score, kills }: BattleResult,
) {
  if (run.phase !== 'battle') return;
  Object.assign(run, { gold, sacrifices, score, kills: run.kills + kills });
  run.phase = won ? (run.day === dayCount(data, run) ? 'complete' : 'shop') : 'failed';
  if (run.phase === 'complete' || run.phase === 'failed') {
    run.score +=
      Math.ceil(gold / 2000) * 2000 +
      Math.ceil(sacrifices / 2) * difficulties.indexOf(run.difficulty) * 4000;
    // Native animation leaves negative currency remainders; only the resulting score is retained here.
    run.gold = 0;
    run.sacrifices = 0;
  }
}
export function canBuy(data: ShopCatalog, run: PurchaseRun, index: number) {
  const item = data.shop.items.find((i) => i.index === index);
  return (
    !!item &&
    run.phase === 'shop' &&
    (item.index === 0 || !run.config.disabledShopCategories.includes(item.category)) &&
    run.inventory[item.inventoryIndex] !== item.upgradeIndex &&
    run.gold >= item.goldCost &&
    run.sacrifices >= item.sacrificeCost
  );
}
export function buy(data: ShopCatalog, run: PurchaseRun, index: number) {
  const item = data.shop.items.find((i) => i.index === index);
  if (!item || !canBuy(data, run, index)) return false;
  run.gold -= item.goldCost;
  run.sacrifices -= item.sacrificeCost;
  run.inventory[item.inventoryIndex] = item.upgradeIndex;
  return true;
}
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const finite = (value: unknown, limit: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < limit;

export function validRun(data: CampaignData, run: unknown): run is SavedRun {
  if (
    !record(run) ||
    run.version !== 1 ||
    !modes.some((value) => value === run.mode) ||
    !difficulties.some((value) => value === run.difficulty) ||
    !integer(run.level, 0, data.levels.length - 1) ||
    !integer(run.day, 1, run.mode === 'campaign' ? data.levels[run.level].dayCount : 10000) ||
    !integer(run.seed, 0, 0xffffffff) ||
    (run.landscapeSeed !== undefined && !integer(run.landscapeSeed, 0, 0xffffffff)) ||
    !['battle', 'shop', 'complete', 'failed'].some((value) => value === run.phase) ||
    typeof run.mirror !== 'boolean' ||
    !integer(run.background, 0, 3) ||
    ![run.gold, run.sacrifices, run.score, run.kills].every((n) => integer(n, 0, 0xffffffff)) ||
    !Array.isArray(run.inventory) ||
    run.inventory.length !== 13 ||
    run.inventory[0] < 0 ||
    !run.inventory.every(
      (tier, i) =>
        tier === -1 ||
        data.shop.items.some((item) => item.inventoryIndex === i && item.upgradeIndex === tier),
    ) ||
    typeof run.prefixGrowth !== 'number' ||
    !Number.isFinite(run.prefixGrowth) ||
    Math.abs(run.prefixGrowth) > 1 ||
    !Array.isArray(run.enemyTable) ||
    run.enemyTable.length !== 20 ||
    !run.enemyTable.every((n) => integer(n, 0, 10))
  )
    return false;
  const c = run.config,
    categories = new Set(data.shop.items.map((i) => i.category));
  if (!record(c) || !record(c.wave) || !record(c.enemyModifiers)) return false;
  const wave = c.wave,
    modifiers = c.enemyModifiers;
  return (
    c.dayNumber === run.day &&
    integer(c.durationSeconds, 1, 100000) &&
    typeof c.mirrorLevel === 'boolean' &&
    typeof c.tripleSpawn === 'boolean' &&
    Array.isArray(c.enemyTypeTable) &&
    c.enemyTypeTable.length > 0 &&
    c.enemyTypeTable.length <= 20 &&
    c.enemyTypeTable.every((n) => integer(n, 0, 10)) &&
    [
      'pressureGrowthPerSecond',
      'initialPressure',
      'additiveWalkSpeed',
      'allowedEnemyPrefix',
      'forcedSpawnInterval',
      'hpMultiplierMinusOne',
      'giantProbability',
      'enemyPrefixGrowthPerSecond',
    ].every((k) => finite(wave[k], 1e7)) &&
    integer(modifiers.randomWalkSpeedRange, 0, 1000000) &&
    integer(modifiers.attackRangeOffset, -1000, 1000) &&
    Array.isArray(c.disabledShopCategories) &&
    c.disabledShopCategories.every((s: unknown) => typeof s === 'string' && categories.has(s)) &&
    Array.isArray(c.artefactInitializers) &&
    c.artefactInitializers.length <= 25 &&
    c.artefactInitializers.every(
      (d: unknown) =>
        record(d) &&
        integer(d.slot, 0, 24) &&
        [0, 2, 3, 4, 5, 6, 7, 8].some((value) => value === d.typeId) &&
        integer(d.upgradeIndex, 0, 6) &&
        finite(d.x, 1000) &&
        finite(d.y, 1000),
    )
  );
}
