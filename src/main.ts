import './style.css';
import { newGame, canPlace, placeBuilding, tileAt, MAP_W, MAP_H } from './game/state';
import { simTick } from './game/sim';
import { Renderer, type UiRenderState } from './render/renderer';
import { UI } from './ui/ui';
import { TILE } from './render/sprites';
import { BUILDING_DEFS } from './game/buildings';

const TICK_SECONDS = 4;          // one month of sim time at 1× speed
const HOURS_PER_SECOND = 24 / 80; // full day/night cycle ≈ 80s at 1×

const app = document.getElementById('app')!;
const canvas = document.getElementById('game') as HTMLCanvasElement;

const g = newGame();
const renderer = new Renderer(canvas);
renderer.centerOn(Math.floor(MAP_W * 0.52), Math.floor(MAP_H * 0.5));

const ui = new UI(app, g, (s) => { g.speed = s; });

const SPEED_MUL = [0, 1, 2.5, 6];

// Debug/testing handles (also lets the curious peek behind the curtain).
(window as unknown as Record<string, unknown>).__game = g;
(window as unknown as Record<string, unknown>).__renderer = renderer;

// ---------------------------------------------------------------- input
let dragging = false;
let dragButton = 0;
let lastMx = 0, lastMy = 0;
let hoverTile: [number, number] | null = null;
let roadPainting = false;

canvas.addEventListener('mousedown', (ev) => {
  lastMx = ev.clientX; lastMy = ev.clientY;
  dragButton = ev.button;
  if (ev.button === 1 || ev.button === 2) { dragging = true; ev.preventDefault(); return; }
  if (ev.button === 0) {
    if (ui.tool.kind === 'build') {
      tryBuildAtCursor(ev);
      if (ui.tool.kind === 'build' && ui.tool.type === 'road') roadPainting = true;
    } else if (ui.tool.kind === 'demolish') {
      demolishAtCursor(ev);
    } else {
      selectAtCursor(ev);
    }
  }
});
window.addEventListener('mousemove', (ev) => {
  const rect = canvas.getBoundingClientRect();
  const [wx, wy] = renderer.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  hoverTile = tx >= 0 && ty >= 0 && tx < g.mapW && ty < g.mapH ? [tx, ty] : null;
  if (dragging) {
    renderer.camX -= (ev.clientX - lastMx) / renderer.zoom;
    renderer.camY -= (ev.clientY - lastMy) / renderer.zoom;
    lastMx = ev.clientX; lastMy = ev.clientY;
  } else if (roadPainting && hoverTile) {
    tryBuild('road', hoverTile[0], hoverTile[1]);
  }
});
window.addEventListener('mouseup', () => { dragging = false; roadPainting = false; });
canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  renderer.setZoom(renderer.zoom + (ev.deltaY < 0 ? 1 : -1), ev.clientX - rect.left, ev.clientY - rect.top);
}, { passive: false });

window.addEventListener('keydown', (ev) => {
  const pan = 24 / renderer.zoom * 8;
  switch (ev.key) {
    case 'ArrowUp': case 'w': renderer.camY -= pan; break;
    case 'ArrowDown': case 's': renderer.camY += pan; break;
    case 'ArrowLeft': case 'a': renderer.camX -= pan; break;
    case 'ArrowRight': case 'd': renderer.camX += pan; break;
    case 'Escape': ui.tool = { kind: 'none' }; ui.selectedBuildingId = null; break;
    case ' ':
      ev.preventDefault();
      g.speed = g.speed === 0 ? 1 : 0;
      break;
  }
});
window.addEventListener('resize', () => renderer.resize());

function cursorTile(ev: MouseEvent): [number, number] | null {
  const rect = canvas.getBoundingClientRect();
  const [wx, wy] = renderer.screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
  const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
  if (tx < 0 || ty < 0 || tx >= g.mapW || ty >= g.mapH) return null;
  return [tx, ty];
}

function tryBuild(type: keyof typeof BUILDING_DEFS, tx: number, ty: number): void {
  if (g.asi.observer || g.gameOver) return;
  placeBuilding(g, type, tx, ty);
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
  if (tile.road) { tile.road = false; return; }
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

function frame(now: number): void {
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const mul = SPEED_MUL[g.asi.observer ? 1 : g.speed];

  simAccum += dt * mul;
  while (simAccum >= TICK_SECONDS) {
    simAccum -= TICK_SECONDS;
    simTick(g);
  }
  renderer.hour = (renderer.hour + dt * mul * HOURS_PER_SECOND) % 24;
  renderer.update(g, dt, mul);

  const uiState: UiRenderState = {
    hoverTile,
    buildType: ui.tool.kind === 'build' ? ui.tool.type : null,
    canPlaceHere: hoverTile && ui.tool.kind === 'build' ? canPlace(g, ui.tool.type, hoverTile[0], hoverTile[1]) : false,
    selectedBuildingId: ui.selectedBuildingId,
  };
  renderer.render(g, uiState);

  uiAccum += dt;
  if (uiAccum > 0.25) { uiAccum = 0; ui.refresh(); }

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
