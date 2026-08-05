import './style.css';
import { newGame, canPlace, isRoadType, notify, placeBuilding, record, tileAt, MAP_W, MAP_H } from './game/state';
import { simTick } from './game/sim';
import { Renderer, type UiRenderState } from './render/renderer';
import { UI } from './ui/ui';
import { TILE } from './render/sprites';
import { BUILDING_DEFS } from './game/buildings';
import { AUTO_SLOT, consumeBootFlag, loadFrom, saveTo } from './game/save';
import { updateTutorial } from './game/tutorial';
import { EVENTS } from './game/events';
import { rawDeltas } from './game/preview';
import { Soundscape } from './audio/soundscape';
import type { ScenarioId } from './game/scenarios';

const TICK_SECONDS = 4;          // one month of sim time at 1× speed
const HOURS_PER_SECOND = 24 / 80; // full day/night cycle ≈ 80s at 1×
const AUTOSAVE_TICKS = 12;       // once per in-game year

const app = document.getElementById('app')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;

// Boot: an explicit request wins; otherwise continue the autosave; otherwise
// found a new region.
const bootFlag = consumeBootFlag();
// The title screen is the entry point, full stop: every plain page load lands
// there. Only an explicit request — continue this slot, begin this scenario,
// return to the menu — routes anywhere else, and each of those is something the
// player just asked for by name.
const wantsMenu = bootFlag === 'menu' || bootFlag === null;
const isNew = bootFlag === 'new' || bootFlag?.startsWith('new:');
const scenarioChoice = (bootFlag?.startsWith('new:') ? bootFlag.slice(4) : 'verdant') as ScenarioId;
const g = (isNew || wantsMenu ? null : loadFrom(bootFlag ?? AUTO_SLOT)) ?? newGame(undefined, scenarioChoice);
// A menu backdrop is scenery, not an administration: it must never autosave
// over the save the player is about to be offered.
const freshGame = g.tick === 0 && !wantsMenu;

const renderer = new Renderer(canvas);
renderer.centerOn(Math.floor(MAP_W * 0.52), Math.floor(MAP_H * 0.5));

const sound = new Soundscape();
/**
 * Audio needs a user gesture, and the gesture does not survive a reload — so
 * arriving here from Continue or Load lands on a page that has never been
 * touched, however deliberately the player clicked to get here.
 *
 * These listeners are deliberately permanent rather than `once`. A gesture the
 * browser declines to count must not spend the only attempt, and a context can
 * be suspended long after it started — a backgrounded tab, an audio device
 * change — with no way back if we have already unhooked. init() is a no-op
 * once running, so the standing cost is a function call per click.
 */
const armAudio = (): void => sound.init();
for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
  window.addEventListener(ev, armAudio);
}
// Coming back to the tab can leave the context suspended behind us.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sound.init();
});

const ui = new UI(app, g, (s) => { g.speed = s; });
ui.sound = sound;
if (wantsMenu) { g.speed = 0; ui.showTitle(); }
else if (freshGame) ui.showIntro();

const SPEED_MUL = [0, 1, 2.5, 6];

// Debug/testing handles (also lets the curious peek behind the curtain).
(window as unknown as Record<string, unknown>).__game = g;
(window as unknown as Record<string, unknown>).__renderer = renderer;
(window as unknown as Record<string, unknown>).__ui = ui;
(window as unknown as Record<string, unknown>).__api = { canPlace, placeBuilding, simTick, EVENTS, rawDeltas, notify };

// ---------------------------------------------------------------- input
let dragging = false;
let dragButton = 0;
let lastMx = 0, lastMy = 0;
let hoverTile: [number, number] | null = null;
let hoverWorld: [number, number] | null = null;
// The x-ray key, tracked from whatever event last reported it. Mouse events
// carry the modifier state directly, which keeps it correct even if the key
// went down while the window was unfocused.
let xrayHeld = false;
const modifierHeld = (ev: MouseEvent | KeyboardEvent): boolean =>
  ui.xrayKey === 'alt' ? ev.altKey : ui.xrayKey === 'shift' ? ev.shiftKey : ev.ctrlKey || ev.metaKey;
let roadPainting = false;

canvas.addEventListener('mousedown', (ev) => {
  lastMx = ev.clientX; lastMy = ev.clientY;
  dragButton = ev.button;
  if (ev.button === 1 || ev.button === 2) { dragging = true; ev.preventDefault(); return; }
  if (ev.button === 0) {
    if (ui.tool.kind === 'build') {
      tryBuildAtCursor(ev);
      if (ui.tool.kind === 'build' && isRoadType(ui.tool.type)) roadPainting = true;
    } else if (ui.tool.kind === 'demolish') {
      demolishAtCursor(ev);
    } else {
      selectAtCursor(ev);
    }
  }
});
/**
 * The pointer moves faster than the screen does.
 *
 * A mouse reports at 125Hz or better; the frame runs at 60. Doing the work in
 * the handler meant tile maths, a hover-card rewrite and two forced layouts per
 * *event* — twice the frame rate, on a document whose HUD has grown a lot. The
 * handler now only records where the pointer is, and the frame loop acts on it
 * once. Nothing is dropped: the last position before a frame is the only one
 * that could have been drawn anyway.
 */
let cursorX = 0, cursorY = 0, cursorOnMap = false, cursorDirty = false;
let panDX = 0, panDY = 0;
// getBoundingClientRect() forces layout; the canvas fills a fixed viewport, so
// its rect only changes on resize.
let canvasRect = canvas.getBoundingClientRect();
const refreshCanvasRect = () => { canvasRect = canvas.getBoundingClientRect(); };

window.addEventListener('mousemove', (ev) => {
  cursorX = ev.clientX; cursorY = ev.clientY;
  // The listener is on the window so dragging survives leaving the canvas,
  // which means the pointer is often over the bar, a drawer or a toast — all
  // of which sit above map tiles. Those are not the map.
  cursorOnMap = ev.target === canvas;
  cursorDirty = true;
  xrayHeld = modifierHeld(ev);
  if (dragging) {
    panDX += ev.clientX - lastMx;
    panDY += ev.clientY - lastMy;
    lastMx = ev.clientX; lastMy = ev.clientY;
  }
});

/** Turn the recorded pointer into tiles, hover text and camera motion. */
function applyCursor(): void {
  if (panDX !== 0 || panDY !== 0) {
    renderer.camX -= panDX / renderer.zoom;
    renderer.camY -= panDY / renderer.zoom;
    panDX = 0; panDY = 0;
  }
  if (!cursorDirty) return;
  cursorDirty = false;
  const [wx, wy] = renderer.screenToWorld(cursorX - canvasRect.left, cursorY - canvasRect.top);
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  hoverTile = cursorOnMap && tx >= 0 && ty >= 0 && tx < g.mapW && ty < g.mapH ? [tx, ty] : null;
  hoverWorld = hoverTile ? [wx, wy] : null;
  ui.showHover(hoverTile, cursorX, cursorY);
  if (!dragging && roadPainting && hoverTile && ui.tool.kind === 'build') {
    tryBuild(ui.tool.type, hoverTile[0], hoverTile[1]);
  }
}
window.addEventListener('mouseup', () => { dragging = false; roadPainting = false; });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  renderer.setZoom(renderer.zoom + (ev.deltaY < 0 ? 1 : -1), ev.clientX - rect.left, ev.clientY - rect.top);
}, { passive: false });

window.addEventListener('keyup', (ev) => { xrayHeld = modifierHeld(ev); });
window.addEventListener('blur', () => { xrayHeld = false; });
window.addEventListener('keydown', (ev) => {
  xrayHeld = modifierHeld(ev);
  // Bar shortcuts get first refusal, but never while a modifier is held —
  // Ctrl+R should still reload the page rather than trip Manual Override.
  if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && ui.handleKey(ev.key)) {
    ev.preventDefault();
    return;
  }
  const pan = 24 / renderer.zoom * 8;
  switch (ev.key) {
    case 'ArrowUp': case 'w': renderer.camY -= pan; break;
    case 'ArrowDown': case 's': renderer.camY += pan; break;
    case 'ArrowLeft': case 'a': renderer.camX -= pan; break;
    case 'ArrowRight': case 'd': renderer.camX += pan; break;
    case 'Escape': ui.handleEscape(); break;
    case 'l': case 'L': ui.cycleOverlay(); break;
    case '?': ui.showHotkeys(); break;
    case 'Tab': ev.preventDefault(); ui.toggleCollapse(); break;
    case ' ':
      ev.preventDefault();
      g.speed = g.speed === 0 ? 1 : 0;
      break;
  }
});
window.addEventListener('resize', () => { renderer.resize(); refreshCanvasRect(); });
window.addEventListener('scroll', refreshCanvasRect, { passive: true });

function cursorTile(ev: MouseEvent): [number, number] | null {
  const rect = canvas.getBoundingClientRect();
  const [wx, wy] = renderer.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  if (tx < 0 || ty < 0 || tx >= g.mapW || ty >= g.mapH) return null;
  return [tx, ty];
}

let roadsBuiltSinceRecord = 0;

function tryBuild(type: keyof typeof BUILDING_DEFS, tx: number, ty: number): void {
  if (g.asi.observer || g.gameOver) return;
  const before = g.resources.capital;
  const placed = placeBuilding(g, type, tx, ty);
  if (placed) {
    record(g, 'build', `Built ${BUILDING_DEFS[type].name}.`);
  } else if (isRoadType(type) && g.resources.capital < before) {
    // Roads return null by design; batch them so painting doesn't flood the log.
    if (++roadsBuiltSinceRecord >= 10) {
      record(g, 'build', 'Extended the road network.');
      roadsBuiltSinceRecord = 0;
    }
  }
}

function tryBuildAtCursor(ev: MouseEvent): void {
  const t = cursorTile(ev);
  if (!t || ui.tool.kind !== 'build') return;
  tryBuild(ui.tool.type, t[0], t[1]);
}

function demolishAtCursor(ev: MouseEvent): void {
  const t = cursorTile(ev);
  if (!t || g.asi.observer || g.gameOver) return;
  const tile = tileAt(g, t[0], t[1]);
  if (!tile) return;
  if (tile.road) { tile.road = false; g.mapVersion++; return; }
  if (tile.buildingId !== -1) ui.showInspector(tile.buildingId);
}

function selectAtCursor(ev: MouseEvent): void {
  const t = cursorTile(ev);
  if (!t) return;
  const tile = tileAt(g, t[0], t[1]);
  if (tile && tile.buildingId !== -1) ui.showInspector(tile.buildingId);
  else { ui.selectedBuildingId = null; }
}

// ---------------------------------------------------------------- main loop
let simAccum = 0;
let uiAccum = 0;
let last = performance.now();
let endStateSaved = false;

function frame(now: number): void {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const mul = SPEED_MUL[g.asi.observer ? 1 : g.speed];

  simAccum += dt * mul;
  while (simAccum >= TICK_SECONDS) {
    simAccum -= TICK_SECONDS;
    simTick(g);
    updateTutorial(g);
    if (!wantsMenu && g.tick % AUTOSAVE_TICKS === 0) saveTo(AUTO_SLOT, g);
  }
  // Capture the terminal state once, immediately — a locked observer save is
  // part of the design, not an accident of timing.
  if ((g.gameOver || g.asi.observer) && !endStateSaved && !wantsMenu) {
    endStateSaved = true;
    saveTo(AUTO_SLOT, g);
  }
  applyCursor();
  renderer.hour = (renderer.hour + dt * mul * HOURS_PER_SECOND) % 24;
  renderer.update(g, dt, mul);
  sound.update(g, dt, renderer.nightFactor(), renderer.rain, renderer.snowing);

  const uiState: UiRenderState = {
    hoverTile,
    buildType: ui.tool.kind === 'build' ? ui.tool.type : null,
    canPlaceHere: hoverTile && ui.tool.kind === 'build' ? canPlace(g, ui.tool.type, hoverTile[0], hoverTile[1]) : false,
    selectedBuildingId: ui.selectedBuildingId,
    overlay: ui.overlay,
    cursorWorld: hoverWorld,
    xrayRadial: xrayHeld,
  };
  renderer.render(g, uiState);

  uiAccum += dt;
  if (uiAccum > 0.25) { uiAccum = 0; ui.refresh(); }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
