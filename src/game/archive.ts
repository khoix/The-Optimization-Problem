// What is kept of an administration after it ends.
//
// A finished run used to sit in the autosave slot forever, so the title screen
// offered to "Review Final State" of a region that had been dead for weeks, and
// the next run had nowhere clean to start. It is archived instead: the save
// slots are freed, and what remains is the *record*.
//
// The record, not the region. A full state would be the same storage under a
// different name — one dead region occupying a slot, still. The record is a few
// kilobytes, so a dozen of them fit where one region did, and the thing worth
// keeping was never the map: it is the list of decisions, each of which was, at
// the time, a reasonable response to a real problem.

import type { GameState, HistoryEntry } from './types';
import { scenarioDef, type ScenarioId } from './scenarios';

export const ARCHIVE_SLOT = 'top:archive';

/** How many administrations are remembered. Oldest fall off the end. */
export const ARCHIVE_LIMIT = 12;

export interface RunRecord {
  /** Stable per run, so the same ending is never filed twice. */
  runId: number;
  endedAt: number;          // epoch ms
  scenario: ScenarioId;
  scenarioName: string;
  tick: number;
  finalPopulation: number;
  peakPopulation: number;
  /** How it ended, in the words the player was given. */
  cause: string;
  /** Whether the administration was terminated, or outlived by the system. */
  kind: 'terminated' | 'observer';
  asiPhase: number;
  history: HistoryEntry[];
}

export function readArchive(): RunRecord[] {
  try {
    const raw = localStorage.getItem(ARCHIVE_SLOT);
    if (!raw) return [];
    const list = JSON.parse(raw) as RunRecord[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeArchive(list: RunRecord[]): void {
  try {
    localStorage.setItem(ARCHIVE_SLOT, JSON.stringify(list.slice(0, ARCHIVE_LIMIT)));
  } catch {
    // A full quota loses the record rather than the run in progress. Nothing
    // else in the game depends on the archive existing.
  }
}

/** Has this administration already ended, one way or the other? */
export function hasEnded(g: GameState): boolean {
  return g.gameOver != null || g.asi.observer;
}

/**
 * File an ended run, if it is ended and not already filed.
 *
 * Called when the ending happens rather than when the player leaves it, so the
 * record survives a closed tab. Filing is idempotent on `runId`: reviewing the
 * final state for twenty minutes must not produce twenty entries.
 */
export function archiveRun(g: GameState): boolean {
  if (!hasEnded(g)) return false;
  const list = readArchive();
  if (list.some((r) => r.runId === g.runId)) return false;
  list.unshift({
    runId: g.runId,
    endedAt: Date.now(),
    scenario: g.scenario as ScenarioId,
    scenarioName: scenarioDef(g.scenario).name,
    tick: g.tick,
    finalPopulation: g.population,
    peakPopulation: g.peakPopulation,
    cause: g.gameOver ?? 'Human administrative access was suspended. Civilization management continues.',
    kind: g.asi.observer ? 'observer' : 'terminated',
    asiPhase: g.asi.phase,
    history: g.history,
  });
  writeArchive(list);
  return true;
}

export function deleteRecord(runId: number): void {
  writeArchive(readArchive().filter((r) => r.runId !== runId));
}

export function clearArchive(): void {
  try { localStorage.removeItem(ARCHIVE_SLOT); } catch { /* nothing to lose */ }
}
