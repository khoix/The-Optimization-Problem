import './style.css';
import { newGame, bridgeSpans, canPlace, clearRock, isRoadType, notify, placeBuilding, record, setAllocation, tileAt, touchMap, MAX_BRIDGE_SPAN, ROCK_CLEAR_COST, MAP_W, MAP_H } from './game/state';
import { simTick, tierOf } from './game/sim';
import { Renderer, type DemolishPreview, type UiRenderState } from './render/renderer';
import { canDemolish } from './game/asi';
import { UI, type ScreenRect, type SessionRequest } from './ui/ui';
import { TILE } from './render/sprites';
import { BUILDING_DEFS, TIER_NAMES } from './game/buildings';
import { AUTO_SLOT, MANUAL_SLOTS, consumeBootFlag, freeManualSlot, loadFrom, newestSave, peek, provideView, releaseSlots, savedGames, saveTo, serialize, writeEnvelope, type SavedView } from './game/save';
import { exportRegion, importRegion, regionFilename } from './game/transfer';
import { archiveRun, hasEnded } from './game/archive';
import { updateTutorial } from './game/tutorial';
import { EVENTS, resolveEvent } from './game/events';
import { rawDeltas } from './game/preview';
import { performUpgrade, upgradePlan, UPGRADE_PATH } from './game/upgrade';
import { unlockedBetween } from './game/buildings';
import { invalidateNetwork, roadNetwork } from './game/network';
import { isCached, openingSeed, regionThumbnail } from './ui/thumbnail';
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
// A boot with no flag lands on the title screen and loads nothing, so this only
// matters when the flag names a slot; the fallback is the newest save of any
// kind, which is what Continue means.
const bootSlot = bootFlag ?? newestSave()?.slot ?? AUTO_SLOT;
const bootView = isNew || wantsMenu ? null : peek(bootSlot)?.view ?? null;
const g = (isNew || wantsMenu ? null : loadFrom(bootSlot)) ?? newGame(undefined, scenarioChoice);
// A menu backdrop is scenery, not an administration: it must never autosave
// over the save the player is about to be offered. Mutable, because the menu
// is somewhere the player can now return to without reloading the page.
let atMenu = wantsMenu;
const freshGame = g.tick === 0 && !wantsMenu;

const renderer = new Renderer(canvas);
renderer.centerOn(Math.floor(MAP_W * 0.52), Math.floor(MAP_H * 0.5));
// The camera is the renderer's, so the save layer has to be told where to ask.
provideView((): SavedView => ({ camX: renderer.camX, camY: renderer.camY, zoom: renderer.zoom }));

/**
 * Put a resumed region back where it was left.
 *
 * A saved zoom can be one this screen cannot afford — written on a desktop,
 * opened on a phone — so it goes through setZoom, which clamps to the floor,
 * and the camera is set afterwards because setZoom moves it to hold a point
 * fixed. Anything the map cannot honour is corrected by clampCamera on the
 * first frame.
 */
function restoreView(view: SavedView | null | undefined): boolean {
  if (!view || !Number.isFinite(view.camX) || !Number.isFinite(view.camY) || !(view.zoom > 0)) return false;
  // setZoomDirect rather than setZoom: it also cancels any ease still in
  // flight from the session being left, which would otherwise pull the
  // restored zoom back toward a target belonging to a different region.
  renderer.setZoomDirect(view.zoom, 0, 0);
  renderer.camX = view.camX;
  renderer.camY = view.camY;
  return true;
}
restoreView(bootView);

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
/**
 * Exported for the boot screen, which collects the gesture this needs.
 *
 * The listeners below still stand: this is the one call that is *known* to
 * follow a real press, and everything after it is the safety net for a
 * context that gets suspended later.
 */
export const armAudio = (): void => sound.init();
for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
  window.addEventListener(ev, armAudio);
}
// Coming back to the tab can leave the context suspended behind us.
//
// And leaving it is the commonest way a session ends. The autosave writes once
// a game year, which at 1× is several minutes of real time — a tab closed from
// a phone's app switcher, or a laptop shut, loses everything since. Hiding the
// tab is the last moment anything is guaranteed to run, so it writes then too.
// The autosave slot only, never a manual one: those are the player's bookmarks
// and closing a tab is not a decision to spend one.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { sound.init(); return; }
  if (atMenu || g.tick === 0) return;
  saveTo(AUTO_SLOT, g);
});

const ui = new UI(app, g, (s) => { g.speed = s; });
ui.sound = sound;
ui.renderer = renderer;
ui.onSession = startSession;
ui.applyRenderPrefs();
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
  // Leaving a finished administration files it and frees the slots it was
  // sitting in. Without this the autosave held a dead region indefinitely, so
  // the title screen went on offering to review a run from three sessions ago
  // and a fresh start had nowhere clean to autosave into. The record survives;
  // the corpse does not.
  if (!atMenu && hasEnded(g)) {
    archiveRun(g);
    releaseSlots(g);
  }
  const loadedView = req.kind === 'load' ? peek(req.slot)?.view ?? null : null;
  const next = req.kind === 'load'
    ? loadFrom(req.slot)
    // The seed the picker was showing, when it was showing one. A card that
    // draws you a map and then hands you a different region is worse than a
    // card that draws you nothing.
    : newGame(req.kind === 'new' ? req.seed : undefined,
      req.kind === 'new' ? req.scenario : 'verdant');
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
  touches.clear(); pinchRef = 0; pinchZoom0 = 0; pendingZoom = null; toolPending = false;
  cancelLongPress();

  invalidateNetwork(g);
  renderer.resetSession();
  // A resumed region opens where it was left; anything else opens at the
  // middle, which is the only sensible place to start a map nobody has seen.
  if (!restoreView(loadedView)) {
    renderer.setZoomDirect(2, 0, 0);
    renderer.centerOn(Math.floor(g.mapW * 0.52), Math.floor(g.mapH * 0.5));
  }
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
  demolishPreview, TILE, BUILDING_DEFS, newGame, touchMap,
  upgradePlan, performUpgrade, UPGRADE_PATH, unlockedBetween,
  // The region class, so a harness can respect the same build-menu gates the
  // player is held to instead of placing things the menu would not offer.
  tierOf, TIER_NAMES,
  // The compute sliders' one mutator, so a harness moves the allocation the
  // same way the panel does — including paying for the move out of the other
  // sectors, which is the invariant an event used to break.
  setAllocation,
  // Exposed so a harness can swap in a seeded region the way startSession
  // does: the road network is cached against the state object, and a swap
  // that mutates it in place leaves a stale entry behind.
  invalidateNetwork,
  // The save layer, so a harness can write and read a slot without going
  // through the menu to do it. `loadFrom` reads the slot back the way a boot
  // does — through localStorage and the real deserializer — so a round-trip
  // test measures the format players actually get, not an in-memory copy.
  saveTo, loadFrom, peek, MANUAL_SLOT: 'top:save',
  // Region files: the export/import pair and the validator behind them, so a
  // harness can feed the importer a file rather than driving a file picker,
  // which is the one control a browser will not let a script fill in.
  exportRegion, importRegion, regionFilename, writeEnvelope, serialize,
  MANUAL_SLOTS, AUTO_SLOT, savedGames, newestSave, freeManualSlot,
  // The scenario picker's thumbnails, so their cost and their cache can be
  // measured rather than inferred from how long a dialog takes to open.
  regionThumbnail,
  // The seeds the boot screen surveyed and whether it kept them, so "the
  // picker opens on kept pictures" can be measured rather than assumed.
  openingSeed, isCached,
  // The boot screen's promise, checkable: did the tap actually start the audio.
  soundRunning: () => sound.running,
  armAudio,
  // Answering the mail. A harness that ticks a thousand months without this
  // stalls on the first decision and then never sees another event, which is
  // most of the simulation going untested.
  resolveEvent,
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
 * Pinch drives the zoom directly.
 *
 * It used to be accumulated and spent in whole steps, because setZoom()
 * reallocated five canvases and doing that sixty times a second is ruinous.
 * The buffers are decoupled from the zoom now, so the zoom can track the
 * fingers — measured against where the gesture *started* rather than against
 * the previous frame, so a slow pinch and a fast one covering the same
 * distance end in the same place and nothing accumulates drift.
 */
let pinchRef = 0;
let pinchZoom0 = 0;
let pinchCx = 0, pinchCy = 0;

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

/**
 * Where a footprint lands when the cursor is at this world point.
 *
 * The anchor is the footprint's top-left tile, and it used to be simply the
 * tile under the cursor: a 4×4 arcology grew down and to the right of the
 * pointer, so placing one meant aiming at a corner that isn't drawn, three
 * tiles from the thing you were looking at.
 *
 * Centred in world pixels rather than in tiles, because half the buildings in
 * the game have an even footprint and an even footprint has no centre tile.
 * Rounding the world position puts the snap line down the middle of the span —
 * a 2×2 sits left of the cursor on the left half of a tile and right of it on
 * the right half — instead of leaning the same way forever.
 */
function anchorAt(type: keyof typeof BUILDING_DEFS, wx: number, wy: number): [number, number] {
  const def = BUILDING_DEFS[type];
  return [Math.round(wx / TILE - def.w / 2), Math.round(wy / TILE - def.h / 2)];
}

/** The left-click / tap action, in one place so both paths agree. */
function actAt(clientX: number, clientY: number): void {
  const t = tileFromClient(clientX, clientY);
  if (ui.tool.kind === 'build') {
    // The cursor has to be on the map; the footprint it anchors may hang off
    // the edge, and canPlace is what refuses that.
    if (t) {
      const [wx, wy] = renderer.screenToWorld(clientX - canvasRect.left, clientY - canvasRect.top);
      const [ax, ay] = anchorAt(ui.tool.type, wx, wy);
      tryBuild(ui.tool.type, ax, ay);
    }
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
    pinchZoom0 = renderer.zoom;
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
let pendingZoom: { z: number; cx: number; cy: number; live: boolean } | null = null;
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
    if (pinchRef > 8) {
      // Deferred to the frame rather than applied here: a move event can fire
      // more than once between frames, and each setZoom moves the camera.
      pendingZoom = { z: pinchZoom0 * (d / pinchRef), cx, cy, live: true };
    } else {
      pinchRef = d;
      pinchZoom0 = renderer.zoom;
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
    const { z, cx, cy, live } = pendingZoom;
    pendingZoom = null;
    const ax = cx - canvasRect.left, ay = cy - canvasRect.top;
    if (live) renderer.setZoomDirect(z, ax, ay);
    else renderer.snapZoom(ax, ay);
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
    const [ax, ay] = anchorAt(ui.tool.type, wx, wy);
    tryBuild(ui.tool.type, ax, ay, true);
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
  const wasPinching = touches.size >= 2;
  touches.delete(ev.pointerId);
  cancelLongPress();
  if (touches.size < 2) {
    // Lifting a finger ends the pinch, and the zoom comes to rest on a rung.
    // Mid-gesture it can sit anywhere, which is soft; at rest it should be an
    // exact pixel ratio, which is crisp. The snap is what buys both.
    if (wasPinching && pinchRef > 0) pendingZoom = { z: 0, cx: pinchCx, cy: pinchCy, live: false };
    pinchRef = 0;
  }
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
  renderer.stepZoom(ev.deltaY < 0 ? 1 : -1, ev.clientX - rect.left, ev.clientY - rect.top);
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
      // The bar owns speed — it remembers what you were watching at, and it
      // knows when the system is no longer taking pause requests.
      ui.toggleSpeed();
      break;
  }
});
window.addEventListener('resize', () => { renderer.resize(); refreshCanvasRect(); ui.applyRenderPrefs(); });
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
    touchMap(g, tx, ty);
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

/**
 * What the demolish tool would do to the hovered tile, for the cursor.
 *
 * Deliberately built from the same three branches `demolishTile` takes, in the
 * same order, so the highlight cannot promise something the click won't do.
 * The refusals it reports are the ones the player can act on: no authority
 * (observer, game over), not enough capital for rock, or a structure the system
 * has decided is load-bearing.
 */
function demolishPreview(): DemolishPreview | null {
  if (ui.tool.kind !== 'demolish' || !hoverTile) return null;
  const [tx, ty] = hoverTile;
  const tile = tileAt(g, tx, ty);
  if (!tile) return null;
  const noAuthority = g.asi.observer || g.gameOver;
  if (tile.buildingId !== -1) {
    const b = g.buildings.get(tile.buildingId);
    if (!b) return null;
    const def = BUILDING_DEFS[b.type];
    const ok = !noAuthority && canDemolish(g, tile.buildingId).ok;
    return { x: b.x, y: b.y, w: def.w, h: def.h, kind: ok ? 'remove' : 'blocked', buildingId: b.id };
  }
  if (tile.road) {
    return { x: tx, y: ty, w: 1, h: 1, kind: noAuthority ? 'blocked' : 'remove', buildingId: null };
  }
  if (tile.terrain === 'rock') {
    const affordable = !noAuthority && g.resources.capital >= ROCK_CLEAR_COST;
    return { x: tx, y: ty, w: 1, h: 1, kind: affordable ? 'clear' : 'blocked', buildingId: null };
  }
  return null;
}

/**
 * The selected building's footprint in client pixels, so the inspector can sit
 * next to what it describes.
 *
 * Recomputed every frame rather than at selection: the camera is the thing the
 * player moves most, and a panel that pointed at where a building used to be
 * would be worse than the corner it used to live in.
 */
function selectionRect(id: number | null = ui.selectedBuildingId): ScreenRect | null {
  if (id == null) return null;
  const b = g.buildings.get(id);
  if (!b) return null;
  const def = BUILDING_DEFS[b.type];
  const z = renderer.zoom;
  return {
    x: (b.x * TILE - renderer.camX) * z + canvasRect.left,
    y: (b.y * TILE - renderer.camY) * z + canvasRect.top,
    w: def.w * TILE * z,
    h: def.h * TILE * z,
  };
}

function selectTile(t: [number, number] | null): void {
  if (!t) return;
  const tile = tileAt(g, t[0], t[1]);
  if (tile && tile.buildingId !== -1) {
    // Where it goes before it is shown, so it opens beside the building rather
    // than opening in the corner and jumping there on the next frame.
    ui.trackSelection(selectionRect(tile.buildingId));
    ui.showInspector(tile.buildingId);
  } else { ui.selectedBuildingId = null; }
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
  // Observer mode used to pin the clock to 1x and ignore g.speed entirely,
  // which was consistent while the transport was greyed out and became a lie
  // the moment it wasn't. Watching is a thing you do at your own pace.
  const mul = SPEED_MUL[g.speed];

  simAccum += dt * mul;
  while (simAccum >= TICK_SECONDS) {
    simAccum -= TICK_SECONDS;
    simTick(g);
    updateTutorial(g);
    if (!atMenu && g.tick % AUTOSAVE_TICKS === 0) saveTo(AUTO_SLOT, g);
  }
  // Capture the terminal state once, immediately — a locked observer save is
  // part of the design, not an accident of timing. The record is filed at the
  // same moment rather than when the player leaves, so a closed tab still
  // remembers the administration; the slots it occupies are freed on the way
  // out, in startSession, once there has been a chance to look at it.
  if ((g.gameOver || g.asi.observer) && !endStateSaved && !atMenu) {
    endStateSaved = true;
    saveTo(AUTO_SLOT, g);
    archiveRun(g);
  }
  applyCursor();
  renderer.hour = (renderer.hour + dt * mul * HOURS_PER_SECOND) % 24;
  renderer.update(g, dt, mul);
  sound.update(g, dt, renderer.nightFactor(), renderer.rain, renderer.snowing);

  const buildType = ui.tool.kind === 'build' ? ui.tool.type : null;
  // Not cached alongside hoverTile: the anchor depends on the footprint as well
  // as the pointer, and picking a bigger building off a card moves it without
  // the mouse having gone anywhere.
  const buildTile = buildType && hoverWorld ? anchorAt(buildType, hoverWorld[0], hoverWorld[1]) : null;
  const uiState: UiRenderState = {
    hoverTile,
    buildType,
    buildTile,
    canPlaceHere: buildType && buildTile ? canPlace(g, buildType, buildTile[0], buildTile[1]) : false,
    // A road drawn over a road is a replacement, not a new tile, and the cursor
    // says so — green reads as "goes here", which is true but not the news.
    buildReplaces: !!(buildType && buildTile && isRoadType(buildType) &&
      (tileAt(g, buildTile[0], buildTile[1])?.road ?? false)),
    demolish: demolishPreview(),
    selectedBuildingId: ui.selectedBuildingId,
    overlay: ui.overlay,
    cursorWorld: hoverWorld,
    xrayRadial: xrayHeld,
  };
  renderer.render(g, uiState);
  ui.trackSelection(selectionRect());

  uiAccum += dt;
  if (uiAccum > 0.25) { uiAccum = 0; ui.refresh(); }
}
requestAnimationFrame(frame);
