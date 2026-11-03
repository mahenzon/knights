import {
  readScores,
  addScore,
  scoreName,
  scoreButtons,
  scoreScene,
  ScoreScroll,
} from './scores.mjs';
import {
  optionAssets,
  optionDifficulties,
  optionInput,
  optionButtons,
  optionConfirmations,
  optionScene,
  readSettings,
} from './options.mjs';
import { healthBar, hudBackdrop, pauseControl } from './hud.mjs';
import { parseFont, fontLayout } from './font.mjs';
import {
  shopAssets,
  resultAssets,
  shopLayout,
  shopScene,
  shopHit,
  ShopScroll,
  PurchaseMotion,
  ResultScore,
  buttonScene,
  purchaseScene,
  dialogScene,
  resultScene,
} from './shop.mjs';
import {
  mainAssets,
  mainControls,
  mainScene,
  tellFriend,
  playAssets,
  playControls,
  PlayMotion,
  PauseMotion,
  playScene,
  pauseControls,
  pauseShade,
  helpControls,
  creditsControls,
  creditsScene,
  CreditsMotion,
  savedMode,
} from './play.mjs';
import { enemyScene, tintEnemySprite } from './enemies.mjs';
import { FixedClock, ApplicationTime, measureClock } from './lifecycle.mjs';
import {
  dragonPose,
  deviceScene,
  objectScene,
  missileScene,
  Landscape,
  landscapeScene,
  castleScene,
  endFlagY,
} from './scene.mjs';
import { Soundtrack } from './audio.mjs';
import { waitForOfflineReady } from './offline.mjs';
import { ImageLoader, battleAssets, mapAssets, helpAssets } from './assets.mjs';
import {
  developerMode,
  castleCompleted,
  castleAvailable,
  MapMotion,
  campaignCompleteText,
  mapScene,
  mapControls,
  mapDetails,
  readCastleRecords,
  recordCastleScore,
} from './map.mjs';
import {
  createRun,
  random,
  prepareDay,
  dayCount,
  startBattle,
  finishDay,
  buy,
  validRun,
} from './campaign.mjs';
const $ = (s) => document.querySelector(s),
  canvas = $('#game'),
  ctx = canvas.getContext('2d', { alpha: false });
const menu = $('#menu'),
  panel = $('#panel'),
  pauseButton = $('#pause'),
  notice = $('#notice');
const fullscreenButton = $('#fullscreen');
const dev = developerMode(location.search);
const previewMuted = new URLSearchParams(location.search).get('mute') === '1';
if (dev) $('#build-label').textContent = 'Developer preview';
let mapView = null,
  mapPointer = null,
  mapHintMotion = null,
  mapDialogText = '';
const visualTime = new ApplicationTime();
if (document.hidden) visualTime.pause();
const SAVE_KEY = 'knights-onrush-save-v2',
  SETTINGS_KEY = 'knights-onrush-settings-v1';
const assets = new Map(),
  fontTints = new Map();
let glyphs = new Map();
let shopScroll = null,
  purchase = null,
  purchaseMotion = null,
  resultScore = null,
  playMotion = null,
  mainMotion = null,
  helpMotion = null,
  creditsMotion = null,
  pauseMotion = null,
  continueMotion = null,
  scoreScroll = null,
  scoreTables = [[], []],
  optionReturnToGame = false,
  optionMotion = null,
  optionDialog = null,
  continueBackdrop = 'play',
  castleButtons = [],
  pressedButton = -1;
let cancelMenuInput = () => {};
let core,
  data,
  draw,
  imageLoader,
  screen = 'loading',
  activePointer = null,
  pausePressed = false,
  helpPage = 0;
let settings = readSettings(null),
  best = 0,
  audioContext,
  music,
  audioBuffers = new Map(),
  audioSources = new Map(),
  currentDifficulty = 'normal';
let audioUnlocked = false,
  audioWanted = false;
let offlineTask = null,
  preparingOffline = false;
let run = null,
  landscape = null,
  backgrounded = false;
let lastAnnouncedSecond = -1;
let audioEpoch = 0;
let audioPending = Promise.resolve();
const powerButton = $('#power');
powerButton.hidden = !dev;
function powerLabel() {
  powerButton.textContent = settings.power ? 'Battery saver: on' : 'Battery saver: off';
}
powerLabel();
powerButton.onclick = () => {
  settings.power = !settings.power;
  storageSet(SETTINGS_KEY, JSON.stringify(settings));
  clock.fps = menuClock.fps = settings.power ? 30 : 60;
  powerLabel();
  resize();
};
const clock = new FixedClock(tick, render);
const menuClock = new FixedClock(() => {
  if (
    ![
      'menu',
      'shop',
      'result',
      'play',
      'continue',
      'paused',
      'options',
      'scores',
      'map',
      'map-hint',
      'help',
      'credits',
    ].includes(screen) ||
    document.hidden ||
    backgrounded ||
    (screen === 'paused' && $('#castle-ui').hidden)
  ) {
    menuClock.stop();
    return;
  }
  let active = false;
  if (screen === 'menu') {
    mainMotion.step();
    active = mainMotion.buttonScale < 1;
  } else if (['play', 'continue', 'paused'].includes(screen)) {
    const motion =
      screen === 'play' ? playMotion : screen === 'paused' ? pauseMotion : continueMotion;
    motion.step();
    active = motion.active;
    if (screen === 'continue' && continueBackdrop === 'map') {
      mapView.motion.step(visualTime.read());
      mapView.selected = mapView.motion.selected;
      active ||= mapView.motion.active;
    } else if (screen === 'continue') {
      playMotion.step();
      active ||= playMotion.active;
    }
  } else if (screen === 'help') {
    helpMotion.step();
    active = helpMotion.buttonScale < helpControls[0].maxScale;
  } else if (screen === 'credits') {
    creditsMotion.step();
    active = creditsMotion.active;
  } else if (screen === 'map' || screen === 'map-hint') {
    const selected = mapView.motion.selected;
    mapView.motion.step(visualTime.read());
    mapView.selected = mapView.motion.selected;
    if (screen === 'map' && selected !== mapView.selected) updateMap();
    if (screen === 'map-hint') mapHintMotion.step();
    active = mapView.motion.active || (screen === 'map-hint' && mapHintMotion.active);
  } else if (screen === 'scores') {
    scoreScroll.step();
    active = scoreScroll.active;
  } else if (screen === 'options') {
    optionMotion.step();
    active = optionMotion.active;
  } else if (screen === 'result') {
    resultScore?.step();
    active = resultScore?.active;
  } else {
    shopScroll.step();
    active = Math.abs(shopScroll.velocity) >= 0.05;
    if (purchase) {
      purchaseMotion.step();
      active ||= purchaseMotion.active;
    }
  }
  if (!active) {
    menuClock.stop();
    render();
  }
}, render);
function message(text) {
  notice.textContent = text;
}
function storageSet(key, value) {
  if (!saveSession) {
    message('This tab cannot save. Close the other game window, then reload this tab.');
    return false;
  }
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    message('Saving is unavailable. Check browser storage before closing the game.');
    return false;
  }
}
function image(name, x, y, w, h) {
  const a = assets.get(name);
  if (a) ctx.drawImage(a, x, y, w ?? a.width, h ?? a.height);
}
function sceneImage(item, offsetY = 0) {
  if (
    item.op === 'blit' &&
    item.alpha === undefined &&
    !item.crop &&
    !item.blend &&
    !item.tint &&
    item.clipBottom === undefined
  ) {
    image(item.image, item.x, item.y + offsetY);
    return;
  }
  const original = assets.get(item.image);
  if (!original) return;
  const a = item.tint === undefined ? original : tintEnemySprite(original, item.tint);
  // Native drawInRect reverses vertical UVs relative to the other blits.
  ctx.save();
  if (item.clipBottom !== undefined) {
    ctx.beginPath();
    ctx.rect(0 - draw[5841], 0 - draw[5842], 480, item.clipBottom);
    ctx.clip();
  }
  ctx.globalAlpha = item.alpha ?? 1;
  ctx.globalCompositeOperation = item.blend ?? 'source-over';
  if (item.op === 'blit') {
    if (item.crop)
      ctx.drawImage(a, ...item.crop, item.x, item.y + offsetY, item.crop[2], item.crop[3]);
    else ctx.drawImage(a, item.x, item.y + offsetY, a.width, a.height);
  } else if (item.op === 'stretch') {
    const w = item.x2 - item.x,
      h = item.y2 - item.y;
    ctx.translate((item.x + item.x2) / 2, (item.y + item.y2) / 2 + offsetY);
    ctx.scale(Math.sign(w), -Math.sign(h));
    ctx.drawImage(a, -Math.abs(w) / 2, -Math.abs(h) / 2, Math.abs(w), Math.abs(h));
  } else {
    ctx.translate(item.x, item.y + offsetY);
    ctx.rotate(item.radians);
    if (item.op === 'scaled') ctx.scale(item.sx, -item.sy);
    ctx.drawImage(a, -a.width / 2, -a.height / 2);
  }
  ctx.restore();
}
function text(value, x, y, size = 1, align = 'left', rgb = [255, 255, 255]) {
  let font = assets.get('font_interface.png');
  if (!font) return;
  const color = `rgb(${rgb.join(',')})`;
  if (color !== 'rgb(255,255,255)') {
    if (!fontTints.has(color)) {
      const tint = document.createElement('canvas');
      tint.width = font.width;
      tint.height = font.height;
      const c = tint.getContext('2d');
      c.drawImage(font, 0, 0);
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = color;
      c.fillRect(0, 0, tint.width, tint.height);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(font, 0, 0);
      fontTints.set(color, tint);
    }
    font = fontTints.get(color);
  }
  for (const { glyph: g, x: dx, y: dy } of fontLayout(glyphs, String(value), x, y, size, align))
    ctx.drawImage(font, g.x, g.y, g.w, g.h, dx, dy, g.w * size, g.h * size);
}
function menuCommands(commands) {
  for (const command of commands) {
    if (command.op === 'text') {
      ctx.save();
      ctx.globalAlpha = command.alpha ?? 1;
      if (command.scale) ctx.scale(...command.scale);
      text(
        command.text,
        command.x,
        command.y,
        command.size,
        ['left', 'right', 'center'][command.align],
        command.rgb,
      );
      ctx.restore();
    } else if (command.op === 'fill') {
      const [top, left, bottom, right] = command.rect,
        [r, g, b, a] = command.rgba;
      ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
      ctx.fillRect(left, top, right - left, bottom - top);
    } else sceneImage({ radians: 0, ...command });
  }
}
function state(presentation = false) {
  const p = presentation ? core.frame_ptr() : core.draw_ptr();
  if (!draw || draw.buffer !== core.memory.buffer || draw.byteOffset !== p)
    draw = new Float32Array(core.memory.buffer, p, core.draw_len());
  return draw;
}
function show(title, body, actions = []) {
  $('#panel-title').textContent = title;
  $('#panel-text').textContent = body;
  $('#loading').hidden = true;
  $('#panel-actions').replaceChildren();
  for (const [label, action, disabled = false] of actions) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = action;
    b.disabled = disabled;
    $('#panel-actions').append(b);
  }
  panel.hidden = false;
}
function hidePanels(mode = 'menu') {
  cancelMenuInput();
  visualTime.setMode(mode);
  menuClock.stop();
  mapPointer = null;
  mapView?.motion.up();
  $('#castle-ui').hidden = true;
  panel.hidden = true;
  menu.hidden = true;
  $('#campaign-map').hidden = true;
}
function toMenu() {
  clock.stop();
  hidePanels();
  screen = 'menu';
  mainMotion = new PlayMotion();
  pauseButton.hidden = true;
  if (audioUnlocked) prepareAudio('menu');
  const actions = [
    () => {
      void tellFriend(location, navigator);
    },
    playMenu,
    highScores,
    options,
    showHelp,
    credits,
  ];
  castleControls(
    mainControls.map((button, i) => ({
      ...button,
      action: () => {
        prepareAudio('menu');
        actions[i]();
      },
    })),
  );
  menuClock.start();
}
function playMenu(restore = false) {
  hidePanels();
  screen = 'play';
  purchase = null;
  if (!restore) playMotion = new PlayMotion();
  const actions = [
    () => chooseMode('campaign'),
    () => chooseMode('endless'),
    () => chooseMode('madness'),
    toMenu,
  ];
  castleControls(playControls.map((button, i) => ({ ...button, action: actions[i] })));
  menuClock.start();
  if (!restore) sound('menu_buble_open.wav', true);
}
function closeContinue() {
  if (continueBackdrop !== 'map') {
    playMenu(true);
    return;
  }
  hidePanels();
  screen = 'map';
  $('#campaign-map').hidden = false;
  updateMap();
}
async function chooseMode(mode) {
  if (mode === 'campaign') {
    await castleMenu();
    if (!['map', 'play'].includes(screen) || !panel.hidden) return;
  }
  let saved = null;
  try {
    saved = readRunSave(mode);
  } catch {}
  const next = () => (mode === 'campaign' ? castleMenu() : beginRun(mode));
  if (savedMode(saved) !== mode) {
    if (mode !== 'campaign') next();
    return;
  }
  if (
    !storageSet(`${SAVE_KEY}-${mode}`, JSON.stringify({ ...JSON.parse(saved), available: false }))
  )
    return;
  continueBackdrop = screen;
  hidePanels();
  screen = 'continue';
  continueMotion = new PurchaseMotion();
  castleControls([
    { text: 'NO', rect: [125, 160, 115, 61], action: closeContinue },
    { text: 'YES', rect: [252, 160, 115, 61], action: () => resumeSaved(mode) },
  ]);
  menuClock.start();
  sound('menu_buble_open.wav', true);
}
async function castleMenu(result = null) {
  hidePanels();
  screen = 'loading';
  let completed = {};
  try {
    completed = JSON.parse(localStorage.getItem('knights-completed') || '{}') || {};
  } catch {}
  if (!dev) {
    show('Campaign', 'Opening the map…');
    $('#loading').hidden = false;
    $('#loading').value = 0;
    try {
      await loadImages(mapAssets);
    } catch {
      show('Could not open the map', 'Check your connection and retry.', [
        ['Retry', () => castleMenu(result)],
        ['Back', playMenu],
      ]);
      return;
    }
    const selected = data.levels.findIndex(
      (_, i) => castleAvailable(completed, i) && !castleCompleted(completed, i),
    );
    const index = result?.level ?? mapView?.selected ?? (selected < 0 ? 11 : selected);
    const motion = mapView?.motion ?? new MapMotion(data.levels);
    if (!mapView) motion.select(index);
    motion.enter(index, result?.won);
    let rawRecords = null;
    try {
      rawRecords = localStorage.getItem('knights-castle-records');
    } catch {}
    mapView = {
      completed,
      records: readCastleRecords(rawRecords),
      selected: index,
      motion,
    };
    hidePanels();
    screen = 'map';
    $('#campaign-map').hidden = false;
    $('#map-points').replaceChildren(
      ...data.levels.map((level, i) => {
        const button = document.createElement('button');
        button.textContent = level.name;
        button.setAttribute(
          'aria-label',
          level.name + (castleAvailable(completed, i) ? '' : ' · locked'),
        );
        button.onclick = (event) => {
          if (event.detail !== 0) return;
          motion.select(i);
          mapView.selected = i;
          updateMap();
        };
        return button;
      }),
    );
    updateMap();
    menuClock.start();
    if (result?.won && index === 11 && !completed.congratulated) {
      completed.congratulated = true;
      storageSet('knights-completed', JSON.stringify(completed));
      showMapDialog(campaignCompleteText);
    }
    return;
  }
  show('Campaign', `Choose a castle · ${currentDifficulty} difficulty`, [
    ...data.levels.map((level, i) => [
      `${i + 1}. ${level.name}${completed[`${currentDifficulty}:${i}`] ? ' ✓' : ''} · ${level.dayCount} days`,
      () => beginRun('campaign', i),
    ]),
    ['Back', playMenu],
  ]);
}
function updateMap() {
  const { selected, completed } = mapView,
    level = data.levels[selected];
  const record = mapView.records[selected];
  $('#map-caption').textContent =
    `${level.name}. Survive ${level.dayCount} days. Last score ${record.last}. Best score ${record.best}.`;
  positionMap();
  const actions = [toMenu, () => beginRun('campaign', mapView.selected), showMapHint];
  castleControls(
    mapControls.flatMap((button, i) =>
      i === 1 && !castleAvailable(completed, selected) ? [] : [{ ...button, action: actions[i] }],
    ),
  );
  menuClock.start();
}
function positionMap() {
  const { motion } = mapView,
    camera = motion.frameCamera;
  [...$('#map-points').children].forEach((button, i) => {
    const [x, y] = data.levels[i].mapPosition;
    button.style.left = `${((x + camera[0] - 8) / 480) * 100}%`;
    button.style.top = `${((y + camera[1] - 14) / 320) * 100}%`;
    button.setAttribute('aria-pressed', String(motion.markers[i].selected));
    button.hidden =
      y + camera[1] < 32 || y + camera[1] > 224 || x + camera[0] < 0 || x + camera[0] > 480;
  });
}
function showMapHint() {
  showMapDialog(data.levels[mapView.selected].hint);
}
function showMapDialog(text) {
  hidePanels();
  screen = 'map-hint';
  mapDialogText = text;
  mapHintMotion = new PurchaseMotion();
  castleControls([
    {
      text: 'OK',
      rect: [160, 200, 115, 61],
      action: () => {
        hidePanels();
        screen = 'map';
        $('#campaign-map').hidden = false;
        updateMap();
        menuClock.start();
      },
    },
  ]);
  $('#castle-ui').setAttribute('aria-label', text);
  menuClock.start();
  sound('menu_buble_open.wav', true);
}
document.addEventListener(
  'pointerdown',
  () => {
    if (screen === 'map' || screen === 'map-hint') mapView.motion.manualCamera = true;
  },
  { capture: true },
);
function beginRun(mode, level = 0) {
  const previous = createRun(
    data,
    mode,
    level,
    currentDifficulty,
    crypto.getRandomValues(new Uint32Array(1))[0],
  );
  previous.mirror = settings.reverse;
  newDay(previous);
}
function resultScreen() {
  hidePanels();
  screen = 'result';
  pauseButton.hidden = true;
  prepareAudio('menu');
  state();
  // The final total is saved immediately; counting is presentation, so closing cannot lose rewards.
  resultScore =
    run.phase === 'shop'
      ? null
      : new ResultScore(
          draw[5],
          draw[4],
          draw[6],
          ['easy', 'normal', 'hard'].indexOf(run.difficulty),
        );
  resultScore?.step();
  if (run.phase === 'shop') warmBattle(prepareDay(data, run));
  castleControls(
    run.phase === 'shop'
      ? [
          { text: 'Go Next', rect: [14, 256, 115, 61], action: () => newDay() },
          { text: 'Shop', rect: [348, 256, 115, 61], action: shop },
        ]
      : [{ text: 'Done', rect: [14, 256, 115, 61], action: finishRun }],
  );
  if (run.mode !== 'campaign' && run.phase !== 'shop') {
    const input = document.createElement('input');
    input.className = 'score-name';
    input.setAttribute('aria-label', 'Enter your name');
    input.maxLength = 14;
    input.autocomplete = 'off';
    input.spellcheck = false;
    try {
      input.value = localStorage.getItem('knights-player-name') || 'PLAYER';
    } catch {
      input.value = 'PLAYER';
    }
    input.onblur = () => {
      storageSet('knights-player-name', scoreName(input.value));
    };
    input.onkeydown = (event) => {
      if (event.key === 'Enter') input.blur();
    };
    $('#castle-ui').append(input);
  }
  if (resultScore?.active) menuClock.start();
}
function readRunSave(mode) {
  const current = localStorage.getItem(`${SAVE_KEY}-${mode}`);
  if (current !== null) return current;
  const legacy = localStorage.getItem(SAVE_KEY);
  return savedMode(legacy) === mode ? legacy : null;
}
function clearRunSave() {
  // A tombstone prevents the retained legacy checkpoint from becoming available again.
  return storageSet(`${SAVE_KEY}-${run.mode}`, 'null');
}
function finishRun() {
  const campaign = run.mode === 'campaign';
  const mapResult = { level: run.level, won: run.phase === 'complete' };
  if (campaign) {
    if (run.phase === 'complete') {
      let completed = {};
      try {
        completed = JSON.parse(localStorage.getItem('knights-completed') || '{}') || {};
      } catch {}
      completed[`${run.difficulty}:${run.level}`] = true;
      if (!storageSet('knights-completed', JSON.stringify(completed))) return;
    }
    let raw = null;
    try {
      raw = localStorage.getItem('knights-castle-records');
    } catch {}
    const records = recordCastleScore(readCastleRecords(raw), run.level, run.score);
    if (!storageSet('knights-castle-records', JSON.stringify(records))) return;
  } else {
    const name = scoreName($('.score-name')?.value ?? 'PLAYER');
    let raw = null;
    try {
      raw = localStorage.getItem('knights-scores');
    } catch {}
    const scores = addScore(readScores(raw), run.mode, name, run.score);
    if (!storageSet('knights-scores', JSON.stringify(scores))) return;
    storageSet('knights-player-name', name);
  }
  clearRunSave();
  run = null;
  prepareAudio('menu');
  if (campaign) castleMenu(mapResult);
  else highScores();
}
function highScores() {
  hidePanels();
  screen = 'scores';
  scoreScroll = new ScoreScroll();
  try {
    scoreTables = readScores(localStorage.getItem('knights-scores'));
  } catch {
    scoreTables = [[], []];
  }
  castleControls(
    scoreButtons.map((button, i) => ({
      ...button,
      action: i
        ? () => {
            message(
              'Global scores used OpenFeint, which is no longer available. Scores are saved on this device.',
            );
          }
        : toMenu,
    })),
  );
  const strip = document.createElement('div');
  strip.className = 'score-strip';
  strip.tabIndex = 0;
  strip.setAttribute('role', 'region');
  strip.setAttribute(
    'aria-label',
    'Endless Siege and Madness high scores. Swipe or use arrow keys to scroll.',
  );
  strip.onwheel = (event) => {
    event.preventDefault();
    scoreScroll.offset = Math.min(0, scoreScroll.offset - event.deltaY);
    scoreScroll.velocity = 0;
    render();
  };
  strip.onkeydown = (event) => {
    if (!['ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) return;
    event.preventDefault();
    scoreScroll.offset =
      event.key === 'Home'
        ? 0
        : Math.min(0, scoreScroll.offset + (event.key === 'ArrowUp' ? 40 : -40));
    scoreScroll.velocity = 0;
    render();
  };
  strip.textContent = scoreTables
    .map(
      (rows, i) =>
        `${i ? 'Madness' : 'Endless Siege'}: ${rows.map((r, rank) => `${rank + 1}. ${r.name}, ${r.score}`).join('; ') || 'No records'}`,
    )
    .join('. ');
  $('#castle-ui').append(strip);
}
async function shop() {
  if (run?.phase !== 'shop') return;
  prepareAudio('menu');
  try {
    await imageLoader.load(shopAssets(data));
  } catch {
    show('Could not open the shop', 'Check your connection and retry.', [
      ['Retry', shop],
      ['Back', resultScreen],
    ]);
    return;
  }
  hidePanels();
  screen = 'shop';
  purchase = null;
  shopScroll = new ShopScroll(shopLayout(data, run).width);
  prepareAudio('menu');
  warmBattle(prepareDay(data, run));
  closePurchase();
  menuClock.start();
}
function closePurchase() {
  purchase = null;
  purchaseMotion = null;
  castleControls([{ text: 'EXIT', rect: [348, 256, 115, 61], action: resultScreen }]);
}
function confirmPurchase(item) {
  sound('menu_buble_open.wav', true);
  purchase = item;
  purchaseMotion = new PurchaseMotion();
  purchaseMotion.step();
  menuClock.stop();
  castleControls([
    { text: 'NO', rect: [125, 160, 115, 61], action: closePurchase },
    {
      text: 'YES',
      rect: [252, 160, 115, 61],
      action: () => {
        if (buy(data, run, item.index)) {
          save();
          warmBattle(prepareDay(data, run));
        }
        closePurchase();
      },
    },
  ]);
  menuClock.start();
}
function castleControls(buttons) {
  cancelMenuInput();
  const view = screen,
    shopMode = view === 'shop' && !purchase,
    main = view === 'menu',
    overlay = main ? menu : $('#castle-ui');
  overlay.setAttribute('aria-label', main ? 'Main menu' : 'Game menus');
  castleButtons = buttons;
  pressedButton = -1;
  for (const button of buttons) button.highlighted = false;
  menuClock.fps = settings.power ? 30 : 60;
  overlay.hidden = false;
  overlay.replaceChildren();
  let pointer = null,
    downButton = -1;
  const hit = (event) => {
    const [x, y] = shopPoint(event);
    for (const button of buttons) {
      const [left, top, width, height] = button.rect;
      button.highlighted = x >= left && x < left + width && y >= top && y < top + height;
    }
    return buttons.findIndex((button) => button.highlighted);
  };
  overlay.onpointerdown = (event) => {
    if (
      overlay.hidden ||
      castleButtons !== buttons ||
      pointer !== null ||
      event.button > 0 ||
      event.target?.closest('input')
    )
      return;
    const [x, y] = shopPoint(event);
    if (view === 'map' && !mapPointer) {
      mapPointer = { id: event.pointerId };
      mapView.motion.down(x, y);
      mapView.selected = mapView.motion.selected;
      if (y < 260 && mapView.motion.panelOpen) sound('menu_buble_open.wav', true);
      updateMap();
      // Selection can replace locked/unlocked controls; arm that current generation.
      overlay.onpointerdown(event);
      return;
    }
    if (view === 'map' && mapPointer.id !== event.pointerId) return;
    event.preventDefault();
    pointer = event.pointerId;
    overlay.setPointerCapture(pointer);
    if (view === 'shop') {
      shopScroll.down(x);
      menuClock.start();
    } else if (view === 'scores') scoreScroll.down(y);
    else if (view === 'options' && !optionDialog) applyOptionPoint(x, y, false);
    pressedButton = hit(event);
    downButton = pressedButton;
    render();
  };
  overlay.onpointermove = (event) => {
    if (overlay.hidden || castleButtons !== buttons || pointer !== event.pointerId) return;
    const [x, y] = shopPoint(event);
    if (view === 'shop') {
      shopScroll.move(x);
      menuClock.start();
    }
    pressedButton = hit(event);
    if (view === 'map') mapView.motion.move(x, y);
    else if (view === 'scores') {
      scoreScroll.move(y);
      menuClock.start();
    } else if (view === 'options' && !optionDialog) applyOptionPoint(x, y, true);
    render();
  };
  overlay.onpointerup = (event) => {
    if (overlay.hidden || castleButtons !== buttons || pointer !== event.pointerId) return;
    const index = hit(event),
      selectItem = shopMode && shopScroll.up();
    pointer = null;
    overlay.releasePointerCapture(event.pointerId);
    if (view === 'map') {
      mapView.motion.up();
      mapPointer = null;
    } else if (view === 'scores') scoreScroll.up();
    // Native overlapping controls all highlight; only the first receives the release.
    if (index >= 0) buttons[index].highlighted = false;
    pressedButton = buttons.findIndex((button) => button.highlighted);
    render();
    // A shop swipe ending over EXIT must not leave the shop.
    if (index >= 0 && (!shopMode || index === downButton)) {
      sound('menu_click_button.wav', true);
      buttons[index].action();
    } else if (selectItem) {
      const item = shopHit(data, run, shopScroll.frameOffset, ...shopPoint(event));
      if (item) confirmPurchase(item);
    }
  };
  cancelMenuInput = () => {
    if (pointer === null) return;
    const id = pointer;
    pointer = null;
    if (overlay.hasPointerCapture(id)) overlay.releasePointerCapture(id);
    if (castleButtons !== buttons) return;
    if (view === 'map') {
      mapView.motion.up();
      mapPointer = null;
    } else if (view === 'shop') shopScroll.up();
    else if (view === 'scores') scoreScroll.up();
    pressedButton = -1;
    for (const button of buttons) button.highlighted = false;
  };
  overlay.onpointercancel = overlay.onlostpointercapture = (event) => {
    if (castleButtons !== buttons || pointer !== event.pointerId) return;
    cancelMenuInput();
    render();
  };
  if (shopMode) {
    const strip = document.createElement('div');
    strip.className = 'shop-strip';
    strip.tabIndex = 0;
    strip.setAttribute('role', 'group');
    strip.setAttribute(
      'aria-label',
      'Castle shop. Swipe or use arrow keys to scroll; Tab to select an upgrade.',
    );
    strip.onwheel = (event) => {
      event.preventDefault();
      shopScroll.offset -= event.deltaX || event.deltaY;
      shopScroll.velocity = 0;
      menuClock.start();
    };
    strip.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Escape'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Escape') {
        resultScreen();
        return;
      }
      shopScroll.offset += event.key === 'ArrowLeft' ? 120 : -120;
      shopScroll.velocity = 0;
      menuClock.start();
    };
    for (const record of shopLayout(data, run).items) {
      const b = document.createElement('button');
      b.className = 'shop-keyboard-item';
      b.textContent = record.item.description;
      b.onfocus = () => {
        shopScroll.offset = Math.max(
          480 - shopScroll.width,
          Math.min(15, 240 - record.left - record.x),
        );
        shopScroll.velocity = 0;
        shopScroll.frameOffset = shopScroll.offset;
        render();
      };
      b.onclick = (event) => {
        if (event.detail !== 0) return;
        const item = shopHit(
          data,
          run,
          shopScroll.frameOffset,
          record.left + record.x + Math.trunc(shopScroll.frameOffset),
          150,
        );
        if (item) confirmPurchase(item);
      };
      strip.append(b);
    }
    overlay.append(strip);
  }
  buttons.forEach((button) => {
    const b = document.createElement('button'),
      [x, y, w, h] = button.rect;
    b.textContent = button.text;
    if (button.label) b.setAttribute('aria-label', button.label);
    b.style.cssText = `left:${x / 4.8}%;top:${y / 3.2}%;width:${w / 4.8}%;height:${h / 3.2}%`;
    b.onclick = (event) => {
      // Pointer release already acted; only keyboard/assistive clicks enter here.
      if (event.detail !== 0 || overlay.hidden || castleButtons !== buttons) return;
      sound('menu_click_button.wav', true);
      button.action();
    };
    overlay.append(b);
  });
  render();
}
function shopPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return [
    Math.trunc(((event.clientX - rect.left) * 480) / rect.width),
    Math.trunc(((event.clientY - rect.top) * 320) / rect.height),
  ];
}
async function newDay(previous = run) {
  hidePanels();
  screen = 'loading';
  prepareAudio('game');
  const next = prepareDay(data, previous),
    config = next.config;
  show('Restoring your castle…', 'Preparing the battlefield.');
  $('#loading').hidden = false;
  $('#loading').value = 0;
  try {
    await Promise.all([
      loadBattleImages(config.enemyTypeTable, next),
      imageLoader.load(resultAssets),
      loadBattleAudio(true),
    ]);
  } catch {
    show(
      'Could not load this day',
      'Keep the game open while artwork and sound download, then retry.',
      [
        ['Retry', () => newDay(previous)],
        ['Back', toMenu],
      ],
    );
    return;
  }
  // SetupNewLevel initializes60 star coordinates; InitMode repeats it before the first frame.
  for (let i = 0; i < 60; i++) random(next);
  next.landscapeSeed = next.seed;
  landscape = new Landscape(config.durationSeconds, () => random(next));
  startBattle(core, data, next, next.seed);
  run = next;
  currentDifficulty = run.difficulty;
  lastAnnouncedSecond = -1;
  startPlay(false);
  imageLoader.load(shopAssets(data)).catch(() => {});
  save();
}
function startPlay(fromGesture = true) {
  hidePanels('battle');
  screen = 'game';
  pauseButton.hidden = false;
  if (document.hidden || !document.hasFocus() || (!fromGesture && backgrounded)) {
    pause('Ready when you are');
    return;
  }
  unlockAudio();
  clock.fps = settings.power ? 30 : 60;
  resize();
  clock.start();
}
function drainSounds() {
  const events = new Uint32Array(
    core.memory.buffer,
    core.audio_events_ptr(),
    core.audio_events_len(),
  );
  for (const key of events) {
    const action = Math.floor(key / 30),
      subtype = key % 30;
    const name = (action < 5 ? data.sounds.creeps[action] : data.sounds.other[action])?.[subtype];
    if (name) sound(name);
  }
  core.clear_audio_events();
}
function tick() {
  visualTime.step();
  core.step();
  drainSounds();
  state();
  const second = Math.floor(draw[0]);
  if (second !== lastAnnouncedSecond) {
    lastAnnouncedSecond = second;
    canvas.setAttribute(
      'aria-label',
      `Day ${run.day}: ${Math.ceil(Math.max(0, draw[1] - draw[0]))} seconds left. Castle health ${Math.round(Math.max(0, draw[2]))} of ${draw[3]}. Gold ${draw[4]}. Sacrifices ${draw[6]}. Drag and flick knights to defend the castle.`,
    );
  }
  if (draw[9]) {
    clock.stop();
    render();
    if (run.landscapeSeed !== undefined) run.seed = core.random_state() >>> 0;
    finishDay(data, run, {
      won: draw[9] === 1,
      gold: draw[4],
      sacrifices: draw[6],
      score: draw[5],
      kills: draw[7],
    });
    best = Math.max(best, run.score);
    storageSet('knights-best', String(best));
    resultScreen();
    save();
  }
}
function save() {
  if (
    !core ||
    !run ||
    !['game', 'paused', 'result', 'shop', ...(optionReturnToGame ? ['options'] : [])].includes(
      screen,
    )
  )
    return;
  if (run.phase === 'failed' || state()[3699] === 2) {
    return clearRunSave();
  }
  if (activePointer !== null) core.release();
  if (run.landscapeSeed !== undefined) run.seed = core.random_state() >>> 0;
  activePointer = null;
  pausePressed = false;
  const ptr = core.save_ptr(),
    bytes = new Uint8Array(core.memory.buffer, ptr, core.save_len());
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return storageSet(
    `${SAVE_KEY}-${run.mode}`,
    JSON.stringify({ version: 3, run, state: btoa(binary) }),
  );
}
async function resumeSaved(mode) {
  hidePanels();
  screen = 'loading';
  prepareAudio('game');
  show('Restoring your castle…', 'Opening your saved battle.');
  $('#loading').hidden = false;
  $('#loading').value = 0;
  try {
    const saved = JSON.parse(readRunSave(mode));
    if (
      ![2, 3].includes(saved.version) ||
      typeof saved.state !== 'string' ||
      saved.state.length > 90000
    )
      throw Error('Unsupported save');
    const restored =
      saved.version === 3
        ? saved.run
        : prepareDay(
            data,
            createRun(
              data,
              'campaign',
              0,
              ['easy', 'normal', 'hard'].includes(saved.difficulty) ? saved.difficulty : 'normal',
              73,
            ),
          );
    if (!validRun(data, restored) || restored.mode !== mode) throw Error('Damaged campaign');
    const binary = atob(saved.state),
      ptr = core.load_buffer(binary.length);
    if (!ptr) throw Error('Save too large');
    const bytes = new Uint8Array(core.memory.buffer, ptr, binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (!core.restore()) throw Error('Damaged save');
    run = restored;
    const starState = { seed: run.landscapeSeed };
    landscape = new Landscape(
      run.config.durationSeconds,
      run.landscapeSeed === undefined ? run.seed : () => random(starState),
    );
    currentDifficulty = run.difficulty;
    state();
    if (
      saved.version === 3 &&
      ((draw[9] === 0) !== (run.phase === 'battle') || (draw[9] === 2) !== (run.phase === 'failed'))
    )
      throw Error('Campaign and battle do not match');
    const kinds = [...run.config.enemyTypeTable];
    for (let i = 0; i < 200; i++) if (draw[20 + i * 12]) kinds.push(draw[20 + i * 12 + 3]);
    try {
      await Promise.all([
        loadBattleImages(kinds, run),
        imageLoader.load(resultAssets),
        loadBattleAudio(true),
      ]);
    } catch (error) {
      // Browser downloads can fail after the original one-shot offer was consumed.
      storageSet(`${SAVE_KEY}-${mode}`, JSON.stringify({ ...saved, available: true }));
      throw error;
    }
    imageLoader.load(shopAssets(data)).catch(() => {});
    if (draw[9]) {
      if (saved.version === 2)
        finishDay(data, run, {
          won: draw[9] === 1,
          gold: draw[4],
          sacrifices: draw[6],
          score: draw[5],
          kills: draw[7],
        });
      menu.hidden = true;
      render();
      resultScreen();
      save();
      return;
    }
    screen = 'paused';
    pauseButton.hidden = true;
    menu.hidden = true;
    pauseScreen();
  } catch {
    stopAudio();
    show(
      'Save could not be opened',
      'Your saved data has been kept. You can retry or start a new game.',
      [
        ['Retry', () => resumeSaved(mode)],
        ['Back', playMenu],
      ],
    );
  }
}
function pause(reason = 'Paused') {
  if (screen !== 'game') return;
  clock.stop();
  screen = 'paused';
  save();
  pauseScreen(reason);
}
function pauseScreen(reason = 'Paused') {
  hidePanels('paused');
  screen = 'paused';
  pauseButton.hidden = true;
  pauseMotion = new PauseMotion();
  if (backgrounded || document.hidden) pauseMotion.y = 40;
  const actions = [
    startPlay,
    options,
    () => {
      const campaign = run.mode === 'campaign';
      clearRunSave();
      run = null;
      if (campaign) {
        prepareAudio('menu');
        castleMenu();
      } else toMenu();
    },
  ];
  castleControls(
    pauseControls(pauseMotion.y).map((button, i) => ({ ...button, action: actions[i] })),
  );
  $('#castle-ui').setAttribute('aria-label', reason);
  if (!backgrounded && !document.hidden) menuClock.start();
}
function optionState() {
  return {
    difficulty: optionDifficulties.indexOf(currentDifficulty),
    reverse: settings.reverse,
    muted: settings.muted,
    volume: settings.volume,
  };
}
function updateOptions(next) {
  if (!next.muted) settings.sound = true;
  Object.assign(settings, next, { difficulty: optionDifficulties[next.difficulty] });
  currentDifficulty = settings.difficulty;
  if (optionReturnToGame && run) {
    run.difficulty = currentDifficulty;
    run.mirror = settings.reverse;
  }
  storageSet(SETTINGS_KEY, JSON.stringify(settings));
  applyMusicSettings();
  if (!settings.muted && $('#music').paused) prepareAudio('menu');
  syncOptionControls();
  save();
  render();
}
function applyOptionPoint(x, y, moving) {
  const before = optionState(),
    next = optionInput(before, x, y, moving);
  if (Object.keys(next).some((key) => next[key] !== before[key])) updateOptions(next);
}
function options() {
  optionReturnToGame = screen === 'paused';
  hidePanels();
  screen = 'options';
  optionDialog = null;
  optionMotion = new PlayMotion();
  prepareAudio('menu');
  buildOptionControls();
  menuClock.start();
}
function buildOptionControls() {
  castleControls(
    optionButtons(optionReturnToGame).map((button) => ({
      ...button,
      action: () => {
        if (button.text === 'Done') {
          if (optionReturnToGame) startPlay();
          else toMenu();
        } else confirmOption(button.text.toLowerCase());
      },
    })),
  );
  const overlay = $('#castle-ui');
  overlay.setAttribute('aria-label', 'Options');
  const controls = [
    ...['Easy', 'Medium', 'Hard'].map((text, i) => ({
      text,
      rect: [i * 160, 0, 160, 100],
      point: [i * 160, 50],
      role: 'radio',
      key: String(i),
    })),
    {
      text: 'Reverse Orientation (Siege mode)',
      rect: [25, 116, 125, 39],
      point: [25, 116],
      role: 'checkbox',
      key: 'reverse',
    },
    {
      text: 'Mute Music',
      rect: [23, 156, 127, 40],
      point: [23, 156],
      role: 'checkbox',
      key: 'muted',
    },
  ];
  for (const control of controls) {
    const button = document.createElement('button');
    const [x, y, w, h] = control.rect;
    button.textContent = control.text;
    button.style.cssText = `left:${x / 4.8}%;top:${y / 3.2}%;width:${w / 4.8}%;height:${h / 3.2}%`;
    button.dataset.option = control.key;
    button.setAttribute('role', control.role);
    button.onclick = (event) => {
      if (event.detail === 0) updateOptions(optionInput(optionState(), ...control.point));
    };
    overlay.append(button);
  }
  const slider = document.createElement('div');
  slider.className = 'option-slider';
  slider.tabIndex = 0;
  slider.setAttribute('role', 'slider');
  slider.setAttribute('aria-label', 'Music volume');
  slider.setAttribute('aria-valuemin', '0');
  slider.setAttribute('aria-valuemax', '100');
  slider.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const volume =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 1
          : Math.max(
              0,
              Math.min(
                1,
                settings.volume + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -0.05 : 0.05),
              ),
            );
    updateOptions({ ...optionState(), volume });
  };
  overlay.append(slider);
  syncOptionControls();
}
function syncOptionControls() {
  for (const button of document.querySelectorAll('[data-option]')) {
    const key = button.dataset.option;
    button.setAttribute(
      'aria-checked',
      String(
        key === 'reverse' || key === 'muted'
          ? settings[key]
          : Number(key) === optionDifficulties.indexOf(currentDifficulty),
      ),
    );
  }
  $('.option-slider')?.setAttribute('aria-valuenow', String(Math.round(settings.volume * 100)));
}
function confirmOption(kind) {
  optionDialog = kind;
  optionMotion = new PurchaseMotion();
  sound('menu_buble_open.wav', true);
  castleControls(
    ['NO', 'YES'].map((text, i) => ({
      text,
      rect: [125 + i * 127, 160, 115, 61],
      action: () => {
        if (i) {
          if (kind === 'cheat') {
            let completed = {};
            try {
              completed = JSON.parse(localStorage.getItem('knights-completed') || '{}') || {};
            } catch {}
            for (let index = 0; index < data.levels.length; index++)
              completed[`normal:${index}`] = true;
            if (!storageSet('knights-completed', JSON.stringify(completed))) return;
          } else {
            if (!storageSet('knights-completed', '{}')) return;
            updateOptions({ ...optionState(), difficulty: 1, reverse: false });
          }
        }
        optionDialog = null;
        optionMotion = new PlayMotion();
        optionMotion.buttonScale = 1;
        optionMotion.fade = 210;
        buildOptionControls();
      },
    })),
  );
  menuClock.start();
}
async function showHelp() {
  hidePanels();
  screen = 'loading';
  if (!helpAssets.every((name) => assets.has(name))) show('How to play', 'Loading instructions…');
  try {
    await imageLoader.load(helpAssets);
  } catch {
    show('Could not load instructions', 'Check your connection and retry.', [
      ['Retry', showHelp],
      ['Back', toMenu],
    ]);
    return;
  }
  hidePanels();
  screen = 'help';
  helpPage = 0;
  helpMotion = new PlayMotion();
  castleControls(
    helpControls.map((button, i) => ({
      ...button,
      label: i ? `Help page ${i}` : 'Exit help',
      action: i
        ? () => {
            helpPage = i - 1;
            render();
          }
        : toMenu,
    })),
  );
  menuClock.start();
}
function credits() {
  hidePanels();
  screen = 'credits';
  creditsMotion = new CreditsMotion();
  const actions = [
    toMenu,
    () => window.open('http://imoregames.com', '_blank', 'noopener,noreferrer'),
  ];
  castleControls(creditsControls.map((button, i) => ({ ...button, action: actions[i] })));
  $('#castle-ui').setAttribute(
    'aria-label',
    'Credits. Moregames Entertainment 2009. Art and Design: Andrey Kovalchuk. Programming: Pavel Kupriyanov. Sound: Strategic Music Studio. Music: Michael Kotov.',
  );
  menuClock.start();
}
pauseButton.onclick = (event) => {
  if (event.detail !== 0 || screen !== 'game') return;
  sound('menu_click_button.wav', true);
  pause();
};
function fullscreenChanged() {
  const expanded =
    Boolean(document.fullscreenElement) || document.documentElement.classList.contains('immersive');
  fullscreenButton.setAttribute('aria-label', expanded ? 'Exit full screen' : 'Enter full screen');
  fullscreenButton.title = expanded ? 'Exit full screen' : 'Full screen';
  resize();
}
fullscreenButton.onclick = async () => {
  // Apple's native fullscreen controller consumes downward throws as swipe-to-dismiss.
  const appleTouch =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if (
      !appleTouch &&
      document.fullscreenEnabled &&
      document.documentElement.requestFullscreen
    )
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    else {
      document.documentElement.classList.toggle('immersive');
      if (document.documentElement.classList.contains('immersive')) {
        pause('Expanded view');
        if (screen === 'paused')
          show(
            'Expanded view',
            'For borderless play on iPhone or iPad, use Safari’s Share → Add to Home Screen.',
            [['Resume', startPlay]],
          );
      }
    }
  } catch {
    message(
      'Full screen is unavailable here. Open the game directly in your browser or add it to your Home Screen.',
    );
  }
  fullscreenChanged();
};
document.addEventListener('fullscreenchange', fullscreenChanged);
fullscreenButton.hidden = false;
// Cancel viewport dragging without suppressing pointer-based controls or form scrolling.
for (const type of ['touchmove', 'dragstart'])
  $('#stage').addEventListener(
    type,
    (event) => {
      if (
        event.cancelable &&
        !event.target.closest('input, textarea, select, [contenteditable], #panel')
      )
        event.preventDefault();
    },
    { passive: false },
  );
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && screen === 'game') pause();
});
function point(event) {
  const r = canvas.getBoundingClientRect(),
    x = Math.trunc(((event.clientX - r.left) * 480) / r.width);
  return [
    run?.config.mirrorLevel ? 480 - x : x,
    Math.trunc(((event.clientY - r.top) * 320) / r.height),
  ];
}
function hitPause(x, y) {
  const [left, top, width, height] = pauseControl.rect;
  return x >= left && x < left + width && y >= top && y < top + height;
}
function battleDown(event) {
  if (screen !== 'game' || activePointer !== null || event.button > 0) return;
  event.preventDefault();
  const [x, y] = point(event);
  activePointer = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  pausePressed = hitPause(x, y);
  core.pickup(x, y);
  drainSounds();
}
function battleMove(event) {
  if (activePointer !== event.pointerId || screen !== 'game') return;
  event.preventDefault();
  const [x, y] = point(event);
  pausePressed = hitPause(x, y);
  core.drag(x, y);
  drainSounds();
}
function releasePointer(event) {
  if (activePointer !== event.pointerId) return;
  const [x, y] = point(event),
    firstPause = hitPause(x, y);
  activePointer = null;
  pausePressed = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  if (screen !== 'game') return;
  if (firstPause) sound('menu_click_button.wav', true);
  // Native Up passes coordinates to weapons without another creep Move.
  core.release_at(x, y);
  drainSounds();
  // The original repeats button release in HUD coordinates on mirrored days.
  const secondPause = run?.config.mirrorLevel && hitPause(480 - x, y);
  if (!firstPause && secondPause) sound('menu_click_button.wav', true);
  if (firstPause || secondPause) pause();
}
function cancelBattlePointer(event) {
  if (activePointer !== event.pointerId) return;
  activePointer = null;
  pausePressed = false;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  core.release();
  drainSounds();
}
for (const target of [canvas, pauseButton]) {
  target.addEventListener('pointerdown', battleDown);
  target.addEventListener('pointermove', battleMove);
  target.addEventListener('pointerup', releasePointer);
  target.addEventListener('pointercancel', cancelBattlePointer);
  target.addEventListener('lostpointercapture', cancelBattlePointer);
}
canvas.addEventListener('contextmenu', (event) => event.preventDefault());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelMenuInput();
    menuClock.stop();
    shopScroll?.up();
    scoreScroll?.up();
    backgrounded = true;
    pause('Paused while you were away');
    stopAudio();
  }
});
window.addEventListener('pagehide', () => {
  cancelMenuInput();
  menuClock.stop();
  shopScroll?.up();
  scoreScroll?.up();
  backgrounded = true;
  pause('Paused while you were away');
  save();
  stopAudio();
});
window.addEventListener('blur', () => {
  cancelMenuInput();
  menuClock.stop();
  shopScroll?.up();
  scoreScroll?.up();
  backgrounded = true;
  pause('Paused');
  stopAudio();
});
function resize() {
  const r = canvas.getBoundingClientRect();
  const query = new URLSearchParams(location.search);
  const nativeProbe = query.get('perf') === '1' && query.get('perfScale') === '1';
  const scale = settings.power || nativeProbe ? 1 : Math.min(2, Math.max(1, r.width / 480));
  canvas.width = Math.round(480 * scale);
  canvas.height = Math.round(320 * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  render();
}
window.addEventListener('resize', resize);
window.visualViewport?.addEventListener('resize', resize);
function renderUnit(i, clipped = false, p = 20 + i * 12) {
  ctx.save();
  const broken = Boolean(draw[5838] & 2);
  if (broken || clipped) {
    ctx.beginPath();
    // Original GL scissors stay fixed in the viewport while the world shakes.
    ctx.rect(0 - draw[5841], 0 - draw[5842], broken ? 390 : 480, broken ? 320 : 253);
    ctx.clip();
  }
  for (const command of enemyScene(data.enemyAnimations, {
    kind: draw[p + 3],
    state: draw[p],
    frame: draw[p + 4],
    flags: draw[p + 8],
    x: draw[p + 1],
    y: draw[p + 2],
    size: draw[p + 5],
    alpha: draw[p + 6],
    angle: draw[p + 9],
  }))
    sceneImage(command);
  ctx.restore();
}
function renderMap() {
  const { motion } = mapView;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 480, 320);
  for (const command of mapScene(
    data.levels,
    mapView.completed,
    motion.frameCamera,
    mapView.selected,
    motion.frame,
  ))
    sceneImage(command);
  menuCommands(
    mapDetails(
      data.levels[mapView.selected],
      mapView.selected,
      castleCompleted(mapView.completed, mapView.selected),
      mapView.records[mapView.selected],
      motion.panel,
    ),
  );
  menuCommands(motion.effects());
  const buttons = mapControls.filter(
    (_, i) => i !== 1 || castleAvailable(mapView.completed, mapView.selected),
  );
  buttons.forEach((button, i) => {
    const [x, , w, h] = button.rect,
      top = Math.trunc(Math.fround(270 + motion.panel));
    menuCommands(
      buttonScene(
        { ...button, rect: [x, top, w, h] },
        screen === 'map' && castleButtons[i]?.highlighted,
      ),
    );
    if (screen === 'map') {
      castleButtons[i].rect = [x, top, w, h];
      $('#castle-ui').children[i].style.top = `${top / 3.2}%`;
    }
  });
  if (screen === 'map') positionMap();
}
function renderObject(i) {
  const p = 2420 + i * 10,
    kind = draw[p] - 1;
  if (kind < 0) return;
  if (kind <= 2) {
    for (const command of objectScene({
      kind,
      tier: draw[p + 8],
      x: draw[p + 1],
      y: draw[p + 2],
      angle: draw[p + 3],
      size: draw[p + 4],
      charge: draw[p + 9],
      time: visualTime.read(),
    }))
      sceneImage(command);
    return;
  }
  const a = assets.get(
    {
      4: 'barrel.png',
      5: 'catapult_stone.png',
      6: 'wizard_fireball.png',
      7: 'ballista_arrow.png',
    }[kind],
  );
  if (!a) return;
  ctx.save();
  ctx.translate(draw[p + 1], draw[p + 2]);
  ctx.rotate(draw[p + 3]);
  const size = draw[p + 4];
  ctx.drawImage(a, (-a.width * size) / 2, (-a.height * size) / 2, a.width * size, a.height * size);
  ctx.restore();
}
function render() {
  if (!data) return;
  if (screen === 'menu') {
    menuCommands(mainScene(mainMotion, pressedButton));
    return;
  }
  if (screen === 'credits') {
    menuCommands(creditsScene(creditsMotion.scales));
    castleButtons.forEach((button) => {
      menuCommands(buttonScene(button, button.highlighted, creditsMotion));
    });
    return;
  }
  if (screen === 'help') {
    image(helpAssets[helpPage], 0, 0);
    menuCommands(buttonScene(castleButtons[0], castleButtons[0].highlighted, helpMotion));
    $('#castle-ui').setAttribute('aria-label', `How to play. Page ${helpPage + 1} of 5`);
    return;
  }
  if (screen === 'scores') {
    menuCommands(scoreScene(scoreTables, scoreScroll.offset));
    castleButtons.forEach((button) => {
      menuCommands(buttonScene(button, button.highlighted));
    });
    return;
  }
  if (screen === 'options') {
    menuCommands(optionScene(optionState()));
    if (optionDialog) menuCommands(dialogScene(optionConfirmations[optionDialog], optionMotion));
    castleButtons.forEach((button) => {
      menuCommands(buttonScene(button, button.highlighted, optionMotion));
    });
    return;
  }
  if (screen === 'play' || screen === 'continue') {
    if (screen === 'continue' && continueBackdrop === 'map') renderMap();
    else {
      menuCommands(playScene(playMotion.fade));
      if (screen === 'continue')
        playControls.forEach((button) => {
          menuCommands(buttonScene(button, false, playMotion));
        });
    }
    const motion = screen === 'play' ? playMotion : continueMotion;
    if (screen === 'continue')
      menuCommands(dialogScene('  Saved game detected.\n   Load and continue?', motion));
    castleButtons.forEach((button) => {
      menuCommands(buttonScene(button, button.highlighted, motion));
    });
    return;
  }
  if (screen === 'result' || screen === 'shop') {
    ctx.clearRect(0, 0, 480, 320);
    menuCommands(
      screen === 'result'
        ? resultScene(run, dayCount(data, run), state()[7], resultScore?.score)
        : shopScene(data, run, shopScroll.frameOffset),
    );
    if (screen === 'shop' && purchase) {
      menuCommands(purchaseScene(purchase.description, purchaseMotion));
    }
    castleButtons.forEach((button) => {
      menuCommands(buttonScene(button, button.highlighted, purchase ? purchaseMotion : undefined));
    });
    return;
  }
  if (screen === 'loading') {
    image('menu_background.png', 0, 0, 480, 320);
    return;
  }
  if (screen === 'map' || screen === 'map-hint') {
    renderMap();
    if (screen === 'map-hint') {
      menuCommands(dialogScene(mapDialogText, mapHintMotion));
      castleButtons.forEach((button) => {
        menuCommands(buttonScene(button, button.highlighted, mapHintMotion));
      });
    }
    return;
  }
  state(true);
  ctx.fillStyle = '#9fbea2';
  ctx.fillRect(0, 0, 480, 320);
  ctx.save();
  if (run?.config.mirrorLevel) {
    ctx.translate(480, 0);
    ctx.scale(-1, 1);
  }
  const background = (run?.background ?? 0) + 1,
    door = run?.inventory[0] ?? 0;
  ctx.translate(draw[5841], draw[5842]);
  if (landscape) {
    landscape.advanceTo(draw[0], true);
    for (const command of landscapeScene(landscape, background - 1)) sceneImage(command);
  }
  for (const command of castleScene(door, draw[5838], draw[5839], draw[5840])) sceneImage(command);
  const deviceStart = 2420 + draw[17] * 10;
  const has = (kind) => {
    for (let i = 0; i < draw[18]; i++) if (draw[deviceStart + i * 11] === kind + 1) return true;
    return false;
  };
  const dragon = dragonPose(draw[12]);
  if (has(0)) {
    sceneImage(data.scene.altar[0]);
    sceneImage({ ...data.scene.altar[1], alpha: draw[3695] });
  }
  if (has(3)) sceneImage(data.scene.gate[0]);
  if (draw[6075]) renderUnit(0, true, 6075);
  if (has(3)) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0 - draw[5841], 0 - draw[5842], 480, 253);
    ctx.clip();
    sceneImage({ ...data.scene.gate[1], y: draw[3696], radians: draw[3697] });
    ctx.restore();
    sceneImage(data.scene.gate[2]);
  }
  const deviceAfter = [];
  for (let i = 0; i < draw[18]; i++) {
    const p = deviceStart + i * 11,
      kind = draw[p] - 1;
    if (![2, 4, 5, 6, 7, 8].includes(kind)) continue;
    for (const command of deviceScene({
      kind,
      tier: draw[p + 3],
      x: draw[p + 1],
      y: draw[p + 2],
      elapsed: draw[p + 4],
      cooldown: draw[p + 5],
      angle: draw[p + 6],
      pressed: !!draw[p + 7],
      recoil: draw[p + 8],
      animation: draw[p + 9],
      timerVisible: !!(draw[p + 10] & 2),
      time: visualTime.read(),
    })) {
      if (command.afterActors) deviceAfter.push(command);
      else sceneImage(command);
    }
  }
  for (let p = 5845; p < 6075; p++) {
    const id = draw[p];
    if (!id) break;
    const i = id - 1;
    if (i < 200) {
      if (draw[20 + i * 12] && i !== draw[15]) renderUnit(i);
    } else renderObject(i - 200);
  }
  if (dragon) {
    image('reddrake_head.png', dragon.x, dragon.y);
    sceneImage({
      op: 'rotated',
      image: 'reddrake_jaw.png',
      x: dragon.x + 92,
      y: dragon.y + 80,
      radians: dragon.jaw,
    });
  }
  for (const command of deviceAfter) sceneImage(command);
  const missileStart = deviceStart + draw[18] * 11;
  for (let i = 0; i < draw[19]; i++) {
    const p = missileStart + i * 7,
      kind = draw[p] - 1;
    if (kind < 0) continue;
    for (const command of missileScene({
      kind,
      tier: draw[p + 4],
      x: draw[p + 1],
      y: draw[p + 2],
      angle: draw[p + 3],
      time: visualTime.read(),
    }))
      sceneImage(command);
  }
  if (draw[5837]) image('castle_enter_rez.png', 354, 136);
  image(`background_0${background}_perplan.png`, 0, 288);
  for (let p = 5237; p < 5837; p += 4) {
    if (!draw[p]) continue;
    sceneImage({
      op: 'scaled',
      image: data.fragmentSprites[draw[p] - 1],
      x: Math.fround(draw[p + 1] - draw[5843]),
      y: Math.fround(draw[p + 2] - draw[5844]),
      sx: draw[p + 3],
      sy: draw[p + 3],
      radians: 0,
    });
  }
  for (let p = 3701; p < 5237; p += 6) {
    if (!draw[p]) continue;
    sceneImage({
      op: 'scaled',
      image: data.smokeSprites[draw[p] - 1],
      x: Math.fround(draw[p + 1] - draw[5843]),
      y: Math.fround(draw[p + 2] - draw[5844]),
      sx: draw[p + 3],
      sy: draw[p + 3],
      radians: 0,
      alpha: draw[p + 4],
      blend: draw[p + 5] ? 'lighter' : 'source-over',
    });
  }
  ctx.restore();
  sceneImage(hudBackdrop);
  image('castle_progressbar.png', 270, 291);
  sceneImage(healthBar(draw[2], draw[3]));
  image('icon_gold.png', 1, 292);
  text(Math.floor(draw[4]), 22, 294, 1, 'left', [255, 255, 0]);
  image('icon_sacrifice.png', 95, 287);
  text(Math.floor(draw[6]), 118, 294, 1, 'left', [0, 205, 255]);
  menuCommands(buttonScene(pauseControl, pausePressed));
  if (dev) {
    text(`Day ${run?.day ?? 1}`, 237, 4, 0.8, 'center');
    text(`${Math.ceil(Math.max(0, draw[1] - draw[0]))}s`, 465, 4, 0.7, 'right');
  }
  if ((draw[3699] || run) && screen === 'game') {
    const y = endFlagY(draw[3699] ? draw[3698] : draw[0]);
    if (y !== null && y > -256) {
      image('flag.png', 60, y);
      if (!draw[3699]) {
        text(
          `DAY ${run.day}${run.mode === 'campaign' ? ` of ${dayCount(data, run)}` : ''}`,
          175,
          y + 150,
          1,
          'center',
          [255, 255, 0],
        );
        text('GET READY!', 180, y + 185, 1, 'center');
      } else if (draw[3699] === 1) text('VICTORY!', 182, y + 180, 1, 'center');
      else {
        text(' DEFEAT!', 177, y + 134, 1, 'center');
        text('CASTLE', 170, y + 160, 1, 'center');
        text('FALLEN!', 190, y + 188, 1, 'center');
      }
    }
  }
  if (screen === 'game' && draw[3700] > 0) {
    ctx.fillStyle = `rgba(0,0,0,${Math.trunc(draw[3700]) / 255})`;
    ctx.fillRect(0, 0, 480, 320);
  }
  if (screen === 'paused' && !$('#castle-ui').hidden) {
    menuCommands([pauseShade]);
    const positions = pauseControls(pauseMotion.y);
    castleButtons.forEach((button, i) => {
      button.rect = positions[i].rect;
      $('#castle-ui').children[i].style.top = `${button.rect[1] / 3.2}%`;
      menuCommands(buttonScene(button, button.highlighted));
    });
  }
}
function unlockAudio() {
  prepareAudio('game');
}
async function loadBattleAudio(play = false) {
  if (!settings.sound || previewMuted) return;
  if (!audioContext) throw Error('Audio is unavailable');
  const names = [
    ...new Set([
      'menu_click_button.wav',
      'menu_buble_open.wav',
      ...(data.sounds?.creeps.flat().filter(Boolean) || []),
      ...Object.values(data.sounds?.other || {})
        .flat()
        .filter(Boolean),
    ]),
  ];
  const effects = await Promise.all([
    ...names.map(loadSound),
    !settings.muted && music.preload('menu'),
    !settings.muted && (play ? music.ready('game') : music.preload('game')),
  ]);
  if (effects.slice(0, names.length).some((buffer) => !buffer))
    throw Error('Sound effects could not be loaded');
}
function prepareAudio(group) {
  if (document.hidden) return;
  backgrounded = false;
  if (!settings.sound || previewMuted) return;
  audioUnlocked = true;
  audioWanted = true;
  music ??= new Soundtrack($('#music'), (reason) =>
    message(
      reason === 'blocked' ? 'Tap anywhere for sound' : 'Music download interrupted. Tap to retry.',
    ),
  );
  applyMusicSettings();
  if (!settings.muted) music.play(group);
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    loadSound('menu_click_button.wav');
    loadSound('menu_buble_open.wav');
    audioContext
      .resume()
      .then(() => {
        if (!audioWanted && !audioSources.size) audioContext.suspend().catch(() => {});
      })
      .catch(() => {});
  } catch {}
}
function applyMusicSettings() {
  $('#music').volume = settings.volume;
  if (settings.muted) music?.pause();
}
function resumeAudioOnGesture() {
  if (!saveSession) return;
  if (
    backgrounded &&
    !document.hidden &&
    [
      'menu',
      'result',
      'shop',
      'play',
      'continue',
      'paused',
      'options',
      'scores',
      'map',
      'map-hint',
      'help',
      'credits',
    ].includes(screen)
  ) {
    backgrounded = false;
    menuClock.start();
  }
  if (
    settings.sound &&
    !settings.muted &&
    [
      'loading',
      'menu',
      'play',
      'continue',
      'map',
      'map-hint',
      'game',
      'result',
      'shop',
      'options',
      'scores',
      'help',
      'credits',
    ].includes(screen) &&
    $('#music').paused
  )
    prepareAudio(music?.group ?? 'menu');
}
document.addEventListener('pointerdown', resumeAudioOnGesture, { capture: true });
document.addEventListener('keydown', resumeAudioOnGesture, { capture: true });
for (const event of ['blur', 'pagehide']) window.addEventListener(event, () => visualTime.pause());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) visualTime.pause();
});
for (const event of ['pointerdown', 'keydown'])
  document.addEventListener(
    event,
    () => {
      if (!document.hidden) visualTime.resume();
    },
    { capture: true },
  );
$('#music').addEventListener('playing', () => {
  if (
    ['Tap anywhere for sound', 'Music download interrupted. Tap to retry.'].includes(
      notice.textContent,
    )
  )
    message('');
});
function stopAudio() {
  audioWanted = false;
  audioEpoch++;
  audioPending = Promise.resolve();
  music?.pause();
  core?.clear_audio_events();
  // Fade only interrupted effects: suspension must not freeze a waveform mid-click.
  for (const [source, output] of audioSources) {
    const now = audioContext.currentTime;
    output.gain.setValueAtTime(output.gain.value, now);
    output.gain.linearRampToValueAtTime(0, now + 0.005);
    source.stop(now + 0.005);
  }
  if (audioContext && !audioSources.size) audioContext.suspend().catch(() => {});
}
function loadSound(name) {
  if (!audioBuffers.has(name))
    audioBuffers.set(
      name,
      (async () => {
        try {
          const r = await fetch(`./assets/${name}`);
          if (!r.ok) throw Error('Sound download failed');
          return await audioContext.decodeAudioData(await r.arrayBuffer());
        } catch {
          audioBuffers.delete(name);
          return null;
        }
      })(),
    );
  return audioBuffers.get(name);
}
async function sound(name, menuEffect = false) {
  if (
    !settings.sound ||
    previewMuted ||
    (!menuEffect && screen !== 'game') ||
    document.hidden ||
    backgrounded ||
    !audioContext ||
    audioContext.state === 'closed' ||
    (!menuEffect && !audioWanted) ||
    !data.assets.includes(name)
  )
    return;
  const epoch = audioEpoch;
  try {
    if (menuEffect) audioWanted = true;
    const ready =
      audioContext.state === 'running'
        ? undefined
        : audioContext.resume().then(() => {
            if (!audioWanted && !audioSources.size) return audioContext.suspend();
          });
    // Decode concurrently, but dispatch in the original PlaySound call order.
    audioPending = Promise.all([audioPending, loadSound(name), ready])
      .then(([, buffer]) => {
        if (!buffer || epoch !== audioEpoch || audioContext.state !== 'running') return;
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        const output = audioContext.createGain();
        source.connect(output);
        output.connect(audioContext.destination);
        audioSources.set(source, output);
        source.onended = () => {
          audioSources.delete(source);
          output.disconnect();
          if (!audioWanted && !audioSources.size) audioContext.suspend().catch(() => {});
        };
        source.start();
      })
      .catch(() => {});
    await audioPending;
  } catch {}
}
async function offline() {
  if (offlineTask) return offlineTask;
  offlineTask = downloadOffline();
  return offlineTask;
}
async function downloadOffline() {
  const status = $('#offline');
  if (!isSecureContext || !('serviceWorker' in navigator)) {
    status.textContent =
      'Offline play is unavailable here. Use a secure game link in Safari or Chrome.';
    return false;
  }
  status.textContent = 'Preparing offline play…';
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    const offerUpdate = () => {
      if (!registration.waiting || !navigator.serviceWorker.controller) {
        $('#update').hidden = true;
        return;
      }
      $('#update').hidden = false;
      $('#update').onclick = () => {
        pause('Updating');
        if (save() === false) return;
        stopAudio();
        const waiting = registration.waiting;
        if (!waiting) {
          location.reload();
          return;
        }
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), {
          once: true,
        });
        waiting.postMessage({ type: 'activate-update' });
      };
    };
    offerUpdate();
    registration.onupdatefound = () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed') offerUpdate();
      });
    };
    await waitForOfflineReady(navigator.serviceWorker, registration, (completed, total) => {
      status.textContent = `Downloading offline game… ${completed}/${total} files`;
      if (preparingOffline) {
        $('#loading').max = total;
        $('#loading').value = completed;
        $('#panel-text').textContent =
          `Saving the complete game for offline play… ${completed}/${total} files. Keep this app open.`;
      }
    });
    status.textContent = 'Ready offline';
    navigator.storage?.persist?.().catch(() => {});
    return true;
  } catch {
    offlineTask = null;
    status.textContent = 'Offline download interrupted · reconnect to retry';
    return false;
  }
}
navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.type === 'offline-ready') $('#offline').textContent = 'Ready offline';
});
window.addEventListener('online', () => {
  if (data && !offlineTask) offline();
});
async function boot() {
  prepareAudio('menu');
  try {
    const [response, wasm, fontResponse] = await Promise.all([
      fetch('./game-data.json'),
      fetch('./knights_core.wasm'),
      fetch('./assets/font_interface.fnt'),
    ]);
    if (!response.ok || !wasm.ok || !fontResponse.ok) throw Error('Game download failed');
    const [game, engine, font] = await Promise.all([
      response.json(),
      wasm.arrayBuffer().then((b) => WebAssembly.instantiate(b)),
      fontResponse.text(),
    ]);
    data = game;
    core = engine.instance.exports;
    core.fix_ballista_gate(
      new URLSearchParams(location.search).get('fixBallistaGate') === '1' ? 1 : 0,
    );
    imageLoader = new ImageLoader(data.art, assets, decodeImage);
    glyphs = parseFont(font);
    const installed =
      Boolean(navigator.standalone) ||
      window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
    preparingOffline = installed;
    if (installed) {
      show(
        'Preparing offline play',
        'Downloading the complete game. This is only needed once. Keep this app open.',
      );
      $('#loading').hidden = false;
      $('#loading').removeAttribute('value');
    }
    const downloaded = offline();
    if (installed && !(await downloaded)) {
      preparingOffline = false;
      const actions = [['Try again', () => location.reload()]];
      const update = $('#update');
      if (!update.hidden && update.onclick)
        actions.unshift(['Update game', () => update.onclick()]);
      show(
        'Offline download incomplete',
        'Reconnect to the internet and try again. Your saved progress is kept.',
        actions,
      );
      return;
    }
    preparingOffline = false;
    if (installed) show('Preparing your castle', 'Preparing the menus and campaign map…');
    $('#loading').hidden = false;
    $('#loading').max = 1;
    $('#loading').value = 0;
    await loadImages([
      'menu_background.png',
      'font_interface.png',
      ...mainAssets,
      ...playAssets,
      ...optionAssets,
      ...helpAssets,
      ...mapAssets,
    ]);
    resize();
    toMenu();
    setTimeout(() => {
      downloaded.then((ready) => {
        if (ready) warmMenu();
      });
    }, 0);
  } catch (error) {
    console.error('Could not load Knights Onrush', error);
    show('Could not load the game', 'Check your internet connection, then try again.', [
      ['Try again', () => location.reload()],
    ]);
  }
}
async function loadBattleImages(kinds, dayRun) {
  await loadImages(battleAssets(data, kinds, dayRun));
  if (screen === 'loading' && settings.sound && !previewMuted) {
    $('#panel-text').textContent = 'Getting music and sounds ready…';
    $('#loading').removeAttribute('value');
  }
  offline();
}
function loadImages(names) {
  return imageLoader.load(names, (value) => {
    $('#loading').value = value;
  });
}
function warmBattle(dayRun) {
  return imageLoader.load(battleAssets(data, dayRun.config.enemyTypeTable, dayRun)).catch(() => {});
}
async function warmMenu() {
  let next = prepareDay(data, createRun(data, 'campaign', 0, currentDifficulty, 73));
  try {
    const saved = JSON.parse(readRunSave('campaign'));
    if (saved?.version === 3 && validRun(data, saved.run)) {
      if (saved.run.phase === 'battle') next = saved.run;
      if (saved.run.phase === 'shop') next = prepareDay(data, saved.run);
    }
  } catch {}
  await Promise.allSettled([
    loadBattleAudio(),
    imageLoader.load(mapAssets),
    warmBattle(next),
    imageLoader.load(shopAssets(data)),
  ]);
  offline();
}
async function decodeImage(name, blob) {
  const a = new Image(),
    url = URL.createObjectURL(blob);
  try {
    a.src = url;
    await a.decode();
  } finally {
    URL.revokeObjectURL(url);
  }
  if (name !== 'sun.png') return a;
  // Native glColor4ub(255,255,70,255); tint once instead of filtering every frame.
  const tinted = document.createElement('canvas');
  tinted.width = a.width;
  tinted.height = a.height;
  const paint = tinted.getContext('2d');
  paint.drawImage(a, 0, 0);
  const pixels = paint.getImageData(0, 0, a.width, a.height);
  for (let i = 2; i < pixels.data.length; i += 4) pixels.data[i] *= 70 / 255;
  paint.putImageData(pixels, 0, 0);
  return tinted;
}
if (new URLSearchParams(location.search).get('perf') === '1') {
  const meter = document.createElement('pre');
  meter.id = 'performance';
  meter.style =
    'position:fixed;top:env(safe-area-inset-top,0px);left:0;z-index:100;pointer-events:none;margin:0;padding:4px;background:#000c;color:#fff;font:12px monospace;white-space:pre-wrap';
  meter.textContent = 'Performance readout · start a battle';
  document.body.append(meter);
  measureClock(clock, (sample) => {
    let actors = 0,
      effects = 0;
    for (let p = 20; p < 2420; p += 12) if (draw[p]) actors++;
    for (let p = 3701; p < 5237; p += 6) if (draw[p]) effects++;
    for (let p = 5237; p < 5837; p += 4) if (draw[p]) effects++;
    meter.textContent = [
      `Level ${run.level + 1} · day ${run.day} · ${canvas.width}×${canvas.height}`,
      `Draws ${sample.fps.toFixed(1)}/${clock.fps} per second · gap ${sample.gap.toFixed(1)} ms`,
      `Browser callbacks ${sample.callbacks.toFixed(1)}/s · gap ${sample.callbackGap.toFixed(1)} ms`,
      `CPU draw p95/max ${sample.drawP95.toFixed(1)}/${sample.drawMax.toFixed(1)} ms`,
      `CPU step p95/max ${sample.stepP95.toFixed(1)}/${sample.stepMax.toFixed(1)} ms`,
      `Actors ${actors} · effects ${effects} · sound ${previewMuted || !settings.sound ? 'muted' : 'enabled'}`,
    ].join('\n');
  });
}
let saveSession = false,
  sessionRequested = false,
  sessionEnded = false,
  releaseSaveSession;
async function startSession() {
  if (sessionRequested || sessionEnded) return;
  if (!navigator.locks) {
    show(
      'Browser update needed',
      'This browser cannot protect your saved game across tabs. Open the game in a current browser.',
    );
    return;
  }
  sessionRequested = true;
  try {
    await navigator.locks.request(SAVE_KEY, { ifAvailable: true }, async (lock) => {
      if (sessionEnded) return;
      if (!lock) {
        show('Game already open', 'Close Knights Onrush in your other tab or window, then retry.', [
          ['Try again', () => location.reload()],
        ]);
        return;
      }
      saveSession = true;
      try {
        settings = readSettings(localStorage.getItem(SETTINGS_KEY));
        currentDifficulty = settings.difficulty;
        best = Number(localStorage.getItem('knights-best') || 0);
      } catch {}
      powerLabel();
      await new Promise((resolve) => {
        releaseSaveSession = resolve;
        boot().catch(() => {
          show('Could not load the game', 'Reload this tab to try again.', [
            ['Try again', () => location.reload()],
          ]);
        });
      });
    });
  } catch {
    show('Could not protect your save', 'Close other game windows, then retry.', [
      ['Try again', () => location.reload()],
    ]);
  } finally {
    saveSession = false;
    releaseSaveSession = undefined;
    sessionRequested = false;
  }
}
// Release only after the earlier pagehide handler has saved the final checkpoint.
window.addEventListener('pagehide', () => {
  saveSession = false;
  sessionEnded = true;
  releaseSaveSession?.();
});
window.addEventListener('pageshow', (event) => {
  // A restored page can contain an older run after another window owned the save.
  if (event.persisted) location.reload();
});
startSession();
