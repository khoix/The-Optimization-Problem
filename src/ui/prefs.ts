// Interface preferences. Stored separately from the save, because they belong
// to the player rather than to any one administration — a setting chosen in
// Verdant Valley should still hold after that administration is terminated.

import type { OverlayId, XrayMode } from '../render/renderer';

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
  /** The diagnostic layer to restore on load. */
  layer: OverlayId | null;
  /**
   * How the map gets out of its own way. 'hover' dissolves whatever mass the
   * cursor is behind; 'radius' opens a window in the skyline around it.
   */
  xray: XrayMode;
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
  layer: null,
  xray: 'hover',
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
