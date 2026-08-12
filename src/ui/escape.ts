/**
 * Escaping for text that goes into markup.
 *
 * The interface is built out of template strings and `innerHTML`, which was
 * safe for as long as every character in them had been written by us: there is
 * no text field anywhere in this game, no prompt, nothing the player types. A
 * region file changes that. An imported save carries its own decision history,
 * its own alert texts, its own region class and its own epitaph, and every one
 * of those is drawn into the console by interpolation.
 *
 * So anything that came out of a `GameState` goes through here on the way to
 * markup. Authored constants do not need it and do not get it — wrapping the
 * copy in the intro would only make the copy harder to read — the rule is
 * about provenance, not about being thorough for its own sake.
 */
const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function esc(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[&<>"']/g, (c) => ENTITIES[c]);
}
