// The boot screen: the title, the work, and the gesture that starts the sound.
//
// This is the entry point now. `main.ts` is loaded by the last step below,
// which means the screen the player is looking at is on paint before the game
// module is even fetched — and everything that used to happen invisibly during
// a blank first second (five sprite atlases, four region surveys, the region
// itself) happens where it can be seen and counted.
//
// Three jobs, in order of how much they matter:
//
//   1. **The gesture.** A browser will not start an AudioContext without one,
//      and a page load is not one. Every previous entry into this game — a
//      reload, Continue, a shared link — arrived at a silent region and stayed
//      silent until the player happened to click something. "Tap to Begin" is
//      that click, asked for once, in the one place where it reads as the
//      start of the game rather than as a permissions prompt.
//   2. **The wait, made honest.** The bar reports steps finished out of steps
//      there are. It is not a timer, and it is not decoration over a fixed
//      delay: if a step is slow the bar sits still, which is the truth.
//   3. **The title.** A game about a city that optimizes itself should open on
//      a city optimizing itself.

import './style.css';
import { TitleCity } from './render/titlecity';
import {
  buildingSprites, carSprites, pedestrianSprites, roadSprites, terrainSprites,
} from './render/sprites';
import { openingSeed, regionThumbnail } from './ui/thumbnail';
import { SCENARIOS, SCENARIO_ORDER } from './game/scenarios';

const root = document.getElementById('boot')!;
const fill = document.getElementById('boot-fill')!;
const bar = document.getElementById('boot-bar')!;
const stepLabel = document.getElementById('boot-step')!;
const pctLabel = document.getElementById('boot-pct')!;
const begin = document.getElementById('boot-begin') as HTMLButtonElement;

// ------------------------------------------------------------------ title
//
// One span per letter, so they can arrive one after another.
let letters = 0;
for (const line of root.querySelectorAll<HTMLElement>('[data-split]')) {
  const text = line.textContent ?? '';
  line.textContent = '';
  line.setAttribute('aria-hidden', 'true');
  for (const ch of text) {
    const s = document.createElement('span');
    s.className = 'boot-ch';
    s.textContent = ch;
    // Staggered from the start of the whole title rather than of each line, so
    // it reads as one sweep across three lines instead of three sweeps.
    s.style.animationDelay = `${letters++ * 34 + 120}ms`;
    line.append(s);
  }
}

const city = new TitleCity(document.getElementById('boot-city') as HTMLCanvasElement);
city.start();

// ------------------------------------------------------------------ the work
//
// Every step below is work the game would otherwise do later, at a moment the
// player did not choose: the atlases on the first frame, the four region maps
// on the first press of *Begin New Simulation*, the region itself before
// anything at all can be drawn. None of it is invented to give the bar
// something to count.
//
// The four surveys use `openingSeed`, which is the same seed the picker will
// ask for. A cache keyed on region *and* seed is worth nothing if the two ends
// roll separately — that would be four regions founded for a dialog that then
// founds four more.
type Step = { label: string; run: () => unknown };
const steps: Step[] = [
  { label: 'Compiling terrain', run: terrainSprites },
  { label: 'Paving roads', run: roadSprites },
  { label: 'Raising structures', run: buildingSprites },
  { label: 'Populating streets', run: () => [carSprites(), pedestrianSprites()] },
  ...SCENARIO_ORDER.map((id) => ({
    label: `Surveying ${SCENARIOS[id].name}`,
    run: () => regionThumbnail(id, openingSeed(id)),
  })),
  // Last, and the largest: this is the module that generates the region,
  // builds the renderer around the atlases above, and puts the menu up
  // underneath this screen.
  { label: 'Founding the region', run: () => import('./main') },
];

/**
 * How long the title takes to land: the last of twenty-two letters starts at
 * 834ms and takes 640ms to settle, and the rule under it finishes at 1600ms.
 *
 * The prompt waits for this as well as for the work, and on any machine built
 * this decade the work is the shorter of the two — nine steps finish in about
 * a quarter of a second, which put "Tap to Begin" on screen while the word
 * OPTIMIZATION was still half-drawn and blue. A prompt is an instruction to
 * stop reading and press something; it should not arrive in the middle of the
 * sentence it is interrupting.
 *
 * It is a floor on the *prompt*, never on the player: a press before this is
 * up skips the whole intro to its final frame and shows the prompt at once.
 */
const INTRO_MS = 1900;

let mainModule: typeof import('./main') | null = null;
let loaded = false;
let loadedAt = -1;
let introDone = false;
let dismissed = false;

function progress(done: number, label: string): void {
  const pct = Math.round((done / steps.length) * 100);
  fill.style.width = `${pct}%`;
  bar.setAttribute('aria-valuenow', String(pct));
  stepLabel.textContent = label;
  pctLabel.textContent = `${pct}%`;
}

/**
 * Hand the frame back long enough for the bar to actually appear to move.
 *
 * A rAF callback runs *before* the paint, so resolving there would let the
 * next step start on the same frame and the whole sequence would land in one
 * repaint — a bar that goes 0% to 100% in a single flash, which tells the
 * player nothing about what is taking the time. The timeout runs as a task
 * after the frame has been presented. Nine steps, one frame each: about 150ms
 * spent so that the wait is legible, and it is spent while real work is
 * outstanding rather than added on top of it.
 */
const yieldToPaint = (): Promise<void> =>
  new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

async function preload(): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    // The label names what is *about* to happen and the bar what has already
    // finished. The alternative — advance the bar first — reports work that
    // has not been done yet, which is the ordinary way a loading bar lies.
    progress(i, steps[i].label);
    await yieldToPaint();
    const result = await steps[i].run();
    if (i === steps.length - 1) mainModule = result as typeof import('./main');
  }
  progress(steps.length, 'Ready');
  loaded = true;
  loadedAt = performance.now();
  offerToBegin();
}

/** Show the prompt, once there is nothing left to wait for and nothing to miss. */
function offerToBegin(): void {
  if (!loaded || !introDone || dismissed || !begin.hidden) return;
  begin.hidden = false;
  document.querySelector('.boot-foot')!.classList.add('done');
  // The only control on the screen, and the player is about to be asked to
  // press it. Focusing it means the keyboard can, without a tab.
  begin.focus({ preventScroll: true });
}

/**
 * Put the whole intro in its finished state, immediately.
 *
 * `settled` is the same set of end-state rules that reduced motion gets, which
 * is the point: if the animation can be switched off for somebody who does not
 * want it, it can be switched off for somebody who is not waiting for it, and
 * the screen underneath has to be the same screen either way.
 */
function settle(): void {
  introDone = true;
  root.classList.add('settled');
  city.hurry();
  offerToBegin();
}
setTimeout(settle, INTRO_MS);

// ------------------------------------------------------------------ the tap
/**
 * What a press does depends on whether there is anything left to wait for.
 *
 * Before the work is finished it means "get on with it", and the only thing
 * that can honestly be got on with is the animation — so the city jumps to its
 * finished state and the loading carries on. It must never mean "wait", and
 * the screen must never appear to ignore a press.
 */
function activate(): void {
  if (dismissed) return;
  // Before the prompt is up a press means "get on with it" — so the intro
  // jumps to its end, and if the loading is already done the prompt appears
  // under the finger that just asked for it. It must never mean "wait", and
  // the screen must never look like it ignored a press.
  if (begin.hidden) { settle(); return; }
  dismissed = true;
  // Off, immediately. A window-level handler that swallows every keypress is
  // fine for the four seconds this screen owns the page and intolerable for
  // the rest of the session — it would eat the hotkeys, the transport, and
  // Escape, from a screen that is no longer on it.
  removeEventListener('keydown', onKey);
  // The gesture, spent on the thing it was collected for. `main.ts` also arms
  // audio from a window-level listener, which this press would reach anyway;
  // calling it here is what makes the promise on the screen a promise the code
  // keeps, rather than one it happens to satisfy by accident.
  mainModule?.armAudio();
  root.classList.add('going');
  // Long enough for the fade, then gone for good: this screen is never shown
  // twice, and returning to the menu must not have to step around it.
  setTimeout(() => {
    city.stop();
    root.remove();
    document.body.classList.remove('booting');
  }, 480);
}

// Any key, not just Enter: this is a "press anything" screen and a player who
// hits the space bar has not made a mistake worth correcting. Tab is left
// alone so the focus ring still works, and a modifier chord is a browser
// shortcut rather than an answer to the prompt.
const onKey = (e: KeyboardEvent): void => {
  if (e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
  e.preventDefault();
  activate();
};
root.addEventListener('pointerdown', activate);
begin.addEventListener('click', activate);
addEventListener('keydown', onKey);

// A handle for measurement: the labels the bar can show, where it is, and
// whether the screen is still up.
(window as unknown as Record<string, unknown>).__boot = {
  labels: steps.map((s) => s.label),
  // When the last step finished, so "the title was painted before the game
  // module was" can be compared against the paint timeline rather than against
  // a number somebody thought looked fast.
  loadedAt: () => loadedAt,
  loaded: () => loaded,
  offered: () => !begin.hidden,
  dismissed: () => dismissed,
  percent: () => Number(bar.getAttribute('aria-valuenow')),
  activate,
};

void preload();
