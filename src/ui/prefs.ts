// Interface preferences. Stored separately from the save, because they belong
// to the player rather than to any one administration — a setting chosen in
// Verdant Valley should still hold after that administration is terminated.

import type { OverlayId, XrayKey } from '../render/renderer';

export interface Prefs {
  /** Civic Systems Bar folded to a single row. */
  barCollapsed: boolean;
  /** Vital signs inside the bar, or stacked in a sidebar clear of the map edge. */
  vitalsPlacement: 'bar' | 'sidebar';
  /** Stop the clock when a decision or report arrives. */
  autoPauseOnDecision: boolean;
  sound: boolean;
  /** Transient alerts over the map. The archive is unaffected either way. */
  toasts: boolean;
  /** Suppress animation beyond what the OS setting already suppresses. */
  reducedMotion: boolean;
  /**
   * The tilt-shift depth-of-field pass.
   *
   * 'auto' is on above the compact breakpoint and off below it, which is
   * where it was measured to be both invisible and expensive. It is a
   * preference at all because it is expensive *everywhere* — 64% of render
   * time on a desktop viewport in the same measurement — and that is a trade
   * some players will want to make and others will not.
   */
  depthOfField: 'auto' | 'on' | 'off';
  /** The diagnostic layer to restore on load. */
  layer: OverlayId | null;
  /**
   * Held to open the x-ray window around the cursor. Dissolving whatever the
   * cursor is directly behind is always on and needs no key.
   */
  xrayKey: XrayKey;
}

const KEY = 'top:prefs';
const LEGACY_COLLAPSE = 'top:barCollapsed';

export const DEFAULT_PREFS: Prefs = {
  barCollapsed: false,
  vitalsPlacement: 'bar',
  autoPauseOnDecision: true,
  sound: true,
  toasts: true,
  reducedMotion: false,
  depthOfField: 'auto',
  layer: null,
  xrayKey: 'ctrl',
};

export function loadPrefs(): Prefs {
  const p = { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) Object.assign(p, JSON.parse(raw) as Partial<Prefs>);
    // The bar's collapsed state predates this file; carry it across once.
    else if (localStorage.getItem(LEGACY_COLLAPSE) === '1') p.barCollapsed = true;
  } catch {
    // A corrupt preferences blob should cost the player their settings, not
    // their game — fall through to defaults.
  }
  return p;
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage full or blocked: the session keeps working, just unremembered.
  }
}
