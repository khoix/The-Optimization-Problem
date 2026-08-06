import './style.css';
import { newGame, bridgeSpans, canPlace, clearRock, isRoadType, notify, placeBuilding, record, tileAt, MAX_BRIDGE_SPAN, ROCK_CLEAR_COST, MAP_W, MAP_H } from './game/state';
import { simTick } from './game/sim';
import { Renderer, type UiRenderState } from './render/renderer';
import { UI, type SessionRequest } from './ui/ui';
import { TILE } from './render/sprites';
import { BUILDING_DEFS } from './game/buildings';
import { AUTO_SLOT, consumeBootFlag, loadFrom, saveTo } from './game/save';
import { updateTutorial } from './game/tutorial';
import { EVENTS } from './game/events';
import { rawDeltas } from './game/preview';
import { invalidateNetwork, roadNetwork } from './game/network';
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
// over the save the player is about to be offered. Mutable, because the menu
// is somewhere the player can now return to without reloading the page.
let atMenu = wantsMenu;
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
ui.onSession = startSession;
if (wantsMenu) { g.speed = 0; ui.showTitle(); }
else if (freshGame) ui.showIntro();

/**
 * Replace the region on screen without reloading the page.
 *
 * This used to be a `location.reload()` with a boot flag, which was simple and
 * wrong in one specific way: the click that asked for the new session is the
 * only thing authorising audio, and it does not survive the navigation. The
 * player pressed Continue, got a silent city, and had to click again for no
 * reason they could see.
 *
 * `g` is the object every other system points at — the UI holds it, the
 * renderer and the soundscape are handed it each frame — so the state is
 * copied *into* it rather than rebound. Keys the incoming state does not have
 * are removed first: a leftover field from the previous city would be far
 * harder to find than a missing one.
 */
function startSession(req: SessionRequest): void {
  const next = req.kind === 'load'
    ? loadFrom(req.slot)
    : newGame(undefined, req.kind === 'new' ? req.scenario : 'verdant');
  if (!next) {
    ui.flashSystemNote('That save could not be read.');
    return;
  }
  for (const k of Object.keys(g)) if (!(k in next)) delete (g as unknown as Record<string, unknown>)[k];
  Object.assign(g, next);

  atMenu = req.kind === 'menu';
  if (atMenu) g.speed = 0;
  endStateSaved = false;
  simAccum = 0;
  roadsBuiltSinceRecord = 0;

  // Nothing about where the pointer was means anything on a different map.
  hoverTile = null; hoverWorld = null;
  dragging = false; roadPainting = false; demolishDragging = false;
  rocksClearedSinceRecord = 0;
  panDX = 0; panDY = 0; cursorDirty = true;
  xrayHeld = false;
  touches.clear(); pinchRef = 0; pendingZoom = null; toolPending = false;
  cancelLongPress();

  invalidateNetwork(g);
  renderer.resetSession();
  renderer.centerOn(Math.floor(g.mapW * 0.52), Math.floor(g.mapH * 0.5));
  ui.resetSession();

  if (atMenu) ui.showTitle();
  else if (req.kind === 'new') ui.showIntro();
  // We are inside the click that asked for this, so the gesture is still live
  // and the browser will let the context start. That is the whole point.
  sound.init();
}

const SPEED_MUL = [0, 1, 2.5, 6];

// Debug/testing handles (also lets the curious peek behind the curtain).
(window as unknown as Record<string, unknown>).__game = g;
(window as unknown as Record<string, unknown>).__renderer = renderer;
(window as unknown as Record<string, unknown>).__ui = ui;
(window as unknown as Record<string, unknown>).__api = {
  canPlace, placeBuilding, simTick, EVENTS, rawDeltas, notify,
  clearRock, bridgeSpans, ROCK_CLEAR_COST, MAX_BRIDGE_SPAN,
};
(window as unknown as Record<string, unknown>).__net = { roadNetwork };

// ---------------------------------------------------------------- input
//
// One pointer path for mouse, touch and pen, with deliberately different
// gestures on each. A mouse has buttons, a hover position and a wheel; a
// finger has none of those, and pretending otherwise is how a port ends up
// with a game you can look at but not play.
//
// Mouse, unchanged: left acts, middle or right drags the camera, the wheel
// zooms, and moving the pointer hovers.
//
// Touch:
//   - Empty-handed, one finger drags the map and a tap selects.
//   - With a tool in hand, one finger acts and drags to paint or sweep —
//     because a road you have to place tile by tile is not a road you will
//     place — and two fingers pan instead.
//   - Two fingers always pinch to zoom.
//   - Press and hold opens the x-ray window and reads out the tile under
//     your finger, which is the only thing touch has in place of a hover.

let dragging = false;
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
let demolishDragging = false;

/** Live touch points, by pointerId. Two of them means a pinch. */
const touches = new Map<number, { x: number; y: number }>();
/** True while the last thing that touched the map was a finger. */
let touchMode = false;
/** How far a finger may travel and still count as a tap, in CSS pixels. */
const TAP_SLOP = 12;
const LONG_PRESS_MS = 420;
let tapStartX = 0, tapStartY = 0, tapStartAt = 0, tapTravel = 0;
/** A tool touched down and has not yet decided whether it is a tap or a drag. */
let toolPending = false;
let longPressTimer = 0;
let longPressing = false;
/**
 * Pinch is accumulated and applied in whole steps.
 *
 * setZoom() reallocates five canvases, which is fine once per wheel click and
 * ruinous sixty times a second — so the ratio is tracked continuously and only
 * spent when it crosses a step.
 */
let pinchRef = 0;
let pinchCx = 0, pinchCy = 0;
const PINCH_IN = 1.32, PINCH_OUT = 0.76;

const cancelLongPress = (): void => {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = 0; }
  if (longPressing) { longPressing = false; xrayHeld = false; cursorDirty = true; }
};

canvas.addEventListener('pointerdown', (ev) => {
  if (ev.pointerType === 'touch') { touchDown(ev); return; }
  touchMode = false;
  lastMx = ev.clientX; lastMy = ev.clientY;
  if (ev.button === 1 || ev.button === 2) { dragging = true; ev.preventDefault(); return; }
  if (ev.button === 0) actAt(ev.clientX, ev.clientY);
});

/** The left-click / tap action, in one place so both paths agree. */
function actAt(clientX: number, clientY: number): void {
  const t = tileFromClient(clientX, clientY);
  if (ui.tool.kind === 'build') {
    if (t) tryBuild(ui.tool.type, t[0], t[1]);
    if (ui.tool.kind === 'build' && isRoadType(ui.tool.type)) roadPainting = true;
  } else if (ui.tool.kind === 'demolish') {
    if (t) demolishTile(t[0], t[1], false);
    // Roads and rock are safe to sweep; buildings are not, so a drag never
    // takes one. Losing a line of pavement to an overshot drag is a few
    // tiles of capital; losing a hospital to one is a different afternoon.
    demolishDragging = true;
  } else {
    selectTile(t);
  }
}

function touchDown(ev: PointerEvent): void {
  touchMode = true;
  // Capture, so a finger that slides off the canvas still reports its move and
  // its release. Only for touch: capturing the mouse would retarget its moves
  // to the canvas and make every point on screen look like the map.
  try { canvas.setPointerCapture(ev.pointerId); } catch { /* pointer already gone */ }
  touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (touches.size >= 2) {
    // A second finger means the gesture was never a placement.
    cancelLongPress();
    toolPending = false;
    roadPainting = false; demolishDragging = false;
    dragging = false;
    const [a, b] = [...touches.values()];
    pinchRef = Math.hypot(a.x - b.x, a.y - b.y);
    pinchCx = (a.x + b.x) / 2; pinchCy = (a.y + b.y) / 2;
    return;
  }
  tapStartX = ev.clientX; tapStartY = ev.clientY;
  tapStartAt = performance.now(); tapTravel = 0;
  lastMx = ev.clientX; lastMy = ev.clientY;
  cursorX = ev.clientX; cursorY = ev.clientY; cursorOnMap = true; cursorDirty = true;
  // Nothing is committed on the way down.
  //
  // Acting immediately, the way the mouse does, meant every pinch that began
  // with a tool in hand laid one stray tile: the first finger had already
  // built by the time the second arrived to say it was a pinch. So the tool
  // waits — for the finger to travel, which starts a paint at the point it
  // started from, or for it to lift, which places the one tile. A second
  // finger arriving before either means neither ever happens.
  if (ui.tool.kind === 'build' || ui.tool.kind === 'demolish') toolPending = true;
  else dragging = true;
  longPressTimer = window.setTimeout(() => {
    longPressTimer = 0;
    if (touches.size !== 1 || tapTravel > TAP_SLOP) return;
    longPressing = true;
    dragging = false;
    xrayHeld = true;
    cursorDirty = true;
  }, LONG_PRESS_MS);
}

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
let pendingZoom: [number, number, number] | null = null;
// getBoundingClientRect() forces layout; the canvas fills a fixed viewport, so
// its rect only changes on resize.
let canvasRect = canvas.getBoundingClientRect();
const refreshCanvasRect = () => { canvasRect = canvas.getBoundingClientRect(); };

/** Tile under a client-space point, or null if that is not the map. */
function tileFromClient(clientX: number, clientY: number): [number, number] | null {
  const [wx, wy] = renderer.screenToWorld(clientX - canvasRect.left, clientY - canvasRect.top);
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  return tx >= 0 && ty >= 0 && tx < g.mapW && ty < g.mapH ? [tx, ty] : null;
}

window.addEventListener('pointermove', (ev) => {
  if (ev.pointerType === 'touch') { touchMove(ev); return; }
  touchMode = false;
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

function touchMove(ev: PointerEvent): void {
  const p = touches.get(ev.pointerId);
  if (!p) return;
  p.x = ev.clientX; p.y = ev.clientY;
  if (touches.size >= 2) {
    const [a, b] = [...touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    panDX += cx - pinchCx; panDY += cy - pinchCy;
    pinchCx = cx; pinchCy = cy;
    if (pinchRef > 0) {
      const ratio = d / pinchRef;
      if (ratio > PINCH_IN) { pendingZoom = [1, cx, cy]; pinchRef = d; }
      else if (ratio < PINCH_OUT) { pendingZoom = [-1, cx, cy]; pinchRef = d; }
    } else {
      pinchRef = d;
    }
    return;
  }
  tapTravel += Math.hypot(ev.clientX - lastMx, ev.clientY - lastMy);
  if (tapTravel > TAP_SLOP) {
    cancelLongPress();
    if (toolPending) {
      // The finger has committed to a stroke. Start it where it began, so a
      // painted line does not lose its first tile to the slop threshold.
      toolPending = false;
      actAt(tapStartX, tapStartY);
    }
  }
  cursorX = ev.clientX; cursorY = ev.clientY; cursorOnMap = true; cursorDirty = true;
  if (dragging) {
    panDX += ev.clientX - lastMx;
    panDY += ev.clientY - lastMy;
  }
  lastMx = ev.clientX; lastMy = ev.clientY;
}

/** Turn the recorded pointer into tiles, hover text and camera motion. */
function applyCursor(): void {
  if (pendingZoom) {
    const [step, zx, zy] = pendingZoom;
    pendingZoom = null;
    renderer.setZoom(renderer.zoom + step, zx - canvasRect.left, zy - canvasRect.top);
  }
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
  // A finger has no hover. The card belongs to the mouse, and to the one touch
  // gesture that asks for it by name.
  ui.showHover(!touchMode || longPressing ? hoverTile : null, cursorX, cursorY);
  if (!dragging && roadPainting && hoverTile && ui.tool.kind === 'build') {
    tryBuild(ui.tool.type, hoverTile[0], hoverTile[1], true);
  }
  if (!dragging && demolishDragging && hoverTile && ui.tool.kind === 'demolish') {
    demolishTile(hoverTile[0], hoverTile[1], true);
  }
}

const endPointer = (ev: PointerEvent, cancelled: boolean): void => {
  if (ev.pointerType !== 'touch') {
    dragging = false; roadPainting = false; demolishDragging = false;
    return;
  }
  const wasSingle = touches.size === 1;
  touches.delete(ev.pointerId);
  cancelLongPress();
  if (touches.size < 2) { pinchRef = 0; }
  if (touches.size === 0) {
    // A tap that never became a drag does the one-shot version of whatever
    // was in hand: a tool places or removes exactly one tile, an empty hand
    // selects.
    const quick = performance.now() - tapStartAt < 500;
    const tapped = wasSingle && !cancelled && quick && tapTravel <= TAP_SLOP && !longPressing;
    if (tapped && toolPending) actAt(tapStartX, tapStartY);
    else if (tapped && ui.tool.kind === 'none') selectTile(tileFromClient(tapStartX, tapStartY));
    toolPending = false;
    dragging = false; roadPainting = false; demolishDragging = false;
    // Nothing is under a finger once it lifts.
    cursorOnMap = false; cursorDirty = true;
  }
};
window.addEventListener('pointerup', (ev) => endPointer(ev, false));
window.addEventListener('pointercancel', (ev) => endPointer(ev, true));
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

let roadsBuiltSinceRecord = 0;

/**
 * `sweeping` marks a tile reached by a drag rather than by its own click.
 * It only changes the sound: a refusal is worth hearing once when you meant
 * it, and worth nothing at all sixty times a second while a drag crosses
 * ground it has already paved.
 */
function tryBuild(type: keyof typeof BUILDING_DEFS, tx: number, ty: number, sweeping = false): void {
  if (g.asi.observer || g.gameOver) return;
  const before = g.resources.capital;
  const placed = placeBuilding(g, type, tx, ty);
  if (placed) {
    record(g, 'build', `Built ${BUILDING_DEFS[type].name}.`);
    sound.placed();
  } else if (isRoadType(type) && g.resources.capital < before) {
    sound.paint();
    // Roads return null by design; batch them so painting doesn't flood the log.
    if (++roadsBuiltSinceRecord >= 10) {
      record(g, 'build', 'Extended the road network.');
      roadsBuiltSinceRecord = 0;
    }
  } else if (!sweeping) {
    sound.refused();
  }
}

let rocksClearedSinceRecord = 0;

/**
 * Remove whatever is on this tile.
 *
 * Three things live here, and until now the tool only really handled one of
 * them: roads went immediately, buildings opened the inspector instead of
 * being demolished, and rock could not be touched at all. All three answer to
 * the same click now. `sweeping` is set when the pointer is being dragged,
 * which excludes buildings — see the mousedown handler.
 */
function demolishTile(tx: number, ty: number, sweeping: boolean): void {
  if (g.asi.observer || g.gameOver) return;
  const tile = tileAt(g, tx, ty);
  if (!tile) return;
  if (tile.buildingId !== -1) {
    if (!sweeping) ui.requestDemolish(tile.buildingId);
    return;
  }
  if (tile.road) {
    tile.road = false;
    g.mapVersion++;
    if (sweeping) sound.paint(); else sound.demolished();
    return;
  }
  if (tile.terrain === 'rock') {
    if (g.resources.capital < ROCK_CLEAR_COST) {
      if (!sweeping) {
        sound.refused();
        ui.flashSystemNote(`Clearing rock costs §${ROCK_CLEAR_COST} a tile.`);
      }
      return;
    }
    clearRock(g, tx, ty);
    if (sweeping) sound.paint(); else sound.demolished();
    // Batched like road painting, so sweeping a ridge doesn't flood the log.
    if (++rocksClearedSinceRecord >= 10) {
      record(g, 'build', 'Cleared rock for development.');
      rocksClearedSinceRecord = 0;
    }
  }
}

function selectTile(t: [number, number] | null): void {
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
  // Re-arm first, not last.
  //
  // This used to sit at the bottom, which meant any exception raised anywhere
  // in the frame skipped it and the loop simply stopped — rendering, input and
  // the simulation all dead until a reload, from one bad field in one panel.
  // Nothing is swallowed: the error still reaches the console. It just no
  // longer takes the whole game with it.
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const mul = SPEED_MUL[g.asi.observer ? 1 : g.speed];

  simAccum += dt * mul;
  while (simAccum >= TICK_SECONDS) {
    simAccum -= TICK_SECONDS;
    simTick(g);
    updateTutorial(g);
    if (!atMenu && g.tick % AUTOSAVE_TICKS === 0) saveTo(AUTO_SLOT, g);
  }
  // Capture the terminal state once, immediately — a locked observer save is
  // part of the design, not an accident of timing.
  if ((g.gameOver || g.asi.observer) && !endStateSaved && !atMenu) {
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
}
requestAnimationFrame(frame);
