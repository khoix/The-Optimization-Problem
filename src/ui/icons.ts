// The console's icon set.
//
// Every mark on the civic bar used to be a character: some of them typographic
// glyphs the UI font drew in the interface's own colour (▣ ✚ ◈ ⚙ § ★), and some
// of them colour emoji the operating system drew in its own house style (🛣 🏘
// ⚡ 💧 🌳 🏭 📊 🗳 🔔 🏠 👥). Sitting on one row, that reads as two interfaces
// stapled together — five flat grey marks next to a bright yellow lightning
// bolt and a little green tree. The indicators the bar is meant to agree with
// were split the same way down the middle.
//
// So: one set, drawn here, and coloured here.
//
// Inline SVG rather than the procedural canvases the map is made of. Nothing is
// fetched and nothing is added to the build — this is source, like every other
// asset in the project — but two things the chrome needs are much easier this
// way than with a baked bitmap: the same icon renders at 18px on the belt, 15px
// in the menu, 12px in the indicators and 9px on a build card and has to hold
// together at each; and it scales to whatever pixel ratio the screen has,
// which on a phone is two or three.
//
// House rules, so a later addition looks like it belongs:
//
//   - A 16×16 box. Shapes are *filled*, not stroked: at twelve pixels a 1.5px
//     outline is most of the icon, and a mass holds its colour where a line
//     just goes grey.
//   - Two tones per subject, from the palette below — a body and a lighter
//     face — so a small mark still has a light side and a dark side. A third
//     tone only where it carries meaning: a lit window, a status LED.
//   - Colour is semantic and consistent with the map and the gauges. Power is
//     the amber the power gauge uses. Water is the cyan of the water gauge and
//     of the river. Parks are the green of the canopy. Anything the player is
//     about to lose is red.
//   - Structural greys are the panel's own steel, so an icon sits on the bar
//     rather than on top of it.

/**
 * The palette.
 *
 * Deliberately small and reused. Thirty-three icons each inventing their own
 * blue is how a set stops looking like a set.
 */
const C = {
  steel: '#8494ad',
  steelLit: '#aebbd0',
  steelDim: '#5b6b85',
  ink: '#1b2331',
  paper: '#dfe7f3',
  amber: '#ffc23d',
  amberDeep: '#f08a1c',
  cyan: '#5cd0f0',
  cyanDeep: '#2f9cc4',
  green: '#5fc76c',
  greenDeep: '#3a9a4a',
  red: '#f2706d',
  redDeep: '#cc4a48',
  gold: '#ffd24a',
  goldInk: '#7a5a10',
  blue: '#6ea8fe',
  blueDeep: '#4179d6',
  brown: '#a4703f',
} as const;

export type IconId =
  // build categories
  | 'road' | 'housing' | 'power' | 'water' | 'compute' | 'services' | 'parks' | 'industry'
  // panels
  | 'indicators' | 'layers' | 'allocation' | 'policies' | 'politics'
  // system controls
  | 'alerts' | 'override' | 'menu' | 'collapse' | 'expand'
  // menu items
  | 'history' | 'save' | 'load' | 'newgame' | 'help' | 'settings' | 'resume'
  // the action button
  | 'demolish' | 'cancel' | 'reroll'
  // readouts
  | 'jobs' | 'labour' | 'appeal' | 'trust' | 'health' | 'unrest' | 'radius';

const PATHS: Record<IconId, string> = {
  // ---- build categories -------------------------------------------------
  // Carriageway in perspective with its centre line. Drawn flat, as three
  // equal verticals, it read as the numeral three.
  road: `<path fill="${C.steelDim}" d="M5.4 1.6h5.2l3 12.8H2.4z"/>`
    + `<path fill="${C.steel}" d="M6 2.6h4l2.5 10.8H3.5z"/>`
    + `<path fill="${C.amber}" d="M7.5 3.2h1l.15 2.1H7.35zM7.2 6.5h1.6l.2 2.4H7zM6.8 10.1h2.4l.25 2.6H6.55z"/>`,
  housing: `<path fill="${C.redDeep}" d="M8 1.4L15.4 8H.6z"/>`
    + `<path fill="${C.paper}" d="M2.9 8h10.2v6.6H2.9z"/>`
    + `<path fill="${C.steelDim}" d="M6.7 10.3h2.6v4.3H6.7z"/>`
    + `<path fill="${C.cyan}" d="M3.9 9.4h2v2h-2zM10.1 9.4h2v2h-2z"/>`,
  power: `<path fill="${C.amberDeep}" d="M9.9 1.2L3.2 9.7h4.1l-1 5.1 6.5-8.7H8.7z"/>`
    + `<path fill="${C.amber}" d="M9.3 2.8L5 8.5h3.4l-.7 3.6 4.3-5.6H9z"/>`,
  water: `<path fill="${C.cyanDeep}" d="M8 1.2c3.1 3.6 4.8 6.1 4.8 8a4.8 4.8 0 0 1-9.6 0c0-1.9 1.7-4.4 4.8-8z"/>`
    + `<path fill="${C.cyan}" d="M8 3.4c2.2 2.7 3.4 4.5 3.4 6a3.4 3.4 0 0 1-6.8 0c0-1.5 1.2-3.3 3.4-6z"/>`
    + `<path fill="#c9edfa" d="M6.2 8.8c-.6 1.5.5 2.6 1.6 2.3-1 0-1.8-1-1.6-2.3z"/>`,
  // A rack with its lights on. The one icon allowed to look busy: the data
  // centre is the thing this whole game is quietly about.
  compute: `<path fill="${C.steel}" d="M2.2 1.4h11.6v13.2H2.2z"/>`
    + `<path fill="${C.ink}" d="M3.5 2.7h9v3h-9zM3.5 6.5h9v3h-9zM3.5 10.3h9v3h-9z"/>`
    + `<path fill="${C.cyan}" d="M4.4 3.6h1.7v1.2H4.4zM4.4 7.4h1.7v1.2H4.4z"/>`
    + `<path fill="${C.amber}" d="M4.4 11.2h1.7v1.2H4.4z"/>`
    + `<path fill="${C.steelDim}" d="M7 3.6h4.5v1.2H7zM7 7.4h4.5v1.2H7zM7 11.2h4.5v1.2H7z"/>`,
  // Blue, not the medical red — Health is the red one, and a category that
  // covers schools and fire stations should not be a hospital cross.
  services: `<path fill="${C.blueDeep}" d="M6.1 1.4h3.8v4.3h4.3v3.8H9.9v4.3H6.1V9.5H1.8V5.7h4.3z"/>`
    + `<path fill="${C.blue}" d="M6.9 2.3h2.2v4.3h4.3v2.2H9.1v4.3H6.9V8.8H2.6V6.6h4.3z"/>`,
  parks: `<path fill="${C.brown}" d="M7.1 10.6h1.8v4H7.1z"/>`
    + `<path fill="${C.greenDeep}" d="M8 5L2.9 12.2h10.2z"/>`
    + `<path fill="${C.green}" d="M8 1.2L4.2 7h7.6z"/>`,
  industry: `<path fill="${C.steel}" d="M1.4 14.4V7.2l3.7 2.5V7.2l3.7 2.5V14.4z"/>`
    + `<path fill="${C.steelDim}" d="M9.4 14.4V3.6h4.2v10.8z"/>`
    + `<path fill="${C.steelDim}" d="M10.1 1.2h1.5v2.4h-1.5z"/>`
    + `<path fill="${C.amber}" d="M10.3 5.2h2.4v1.8h-2.4zM10.3 8.4h2.4v1.8h-2.4z"/>`
    + `<path fill="${C.amberDeep}" d="M2.5 11.2h1.8v1.6H2.5zM6.2 11.2h1.8v1.6H6.2z"/>`,

  // ---- panels -----------------------------------------------------------
  // The three colours the gauges themselves use, in the order they read.
  indicators: `<path fill="${C.steelDim}" d="M1.4 12.9h13.2v1.5H1.4z"/>`
    + `<path fill="${C.cyan}" d="M2.6 7.8h2.8v5.1H2.6z"/>`
    + `<path fill="${C.green}" d="M6.6 3.6h2.8v9.3H6.6z"/>`
    + `<path fill="${C.amber}" d="M10.6 6h2.8v6.9h-2.8z"/>`,
  layers: `<path fill="${C.steelDim}" d="M8 8.4l6.3 3.3L8 15l-6.3-3.3z"/>`
    + `<path fill="${C.blueDeep}" d="M8 4.7l6.3 3.3L8 11.3 1.7 8z"/>`
    + `<path fill="${C.cyan}" d="M8 1L14.3 4.3 8 7.6 1.7 4.3z"/>`,
  // Sliders, not a gear: the Compute panel is an allocation, and what the
  // player does in it is move proportions between six sectors.
  allocation: `<path fill="${C.steelDim}" d="M1.4 3.4h13.2v1.7H1.4zM1.4 7.2h13.2v1.7H1.4zM1.4 11h13.2v1.7H1.4z"/>`
    + `<circle cx="5.2" cy="4.25" r="2.2" fill="${C.cyan}"/>`
    + `<circle cx="10.4" cy="8.05" r="2.2" fill="${C.green}"/>`
    + `<circle cx="4.4" cy="11.85" r="2.2" fill="${C.amber}"/>`,
  policies: `<path fill="${C.paper}" d="M3.2 1.4h6l3.6 3.6v10H3.2z"/>`
    + `<path fill="${C.steel}" d="M9.2 1.4l3.6 3.6H9.2z"/>`
    + `<path fill="${C.steelDim}" d="M4.9 7.4h6.2v1.2H4.9zM4.9 9.8h6.2v1.2H4.9z"/>`
    + `<circle cx="10.9" cy="12.2" r="2.4" fill="${C.blueDeep}"/>`
    + `<path fill="${C.paper}" d="M9.8 12.1l.8.8 1.6-1.6.7.7-2.3 2.3-1.5-1.5z"/>`,
  politics: `<path fill="${C.paper}" d="M4.6 1.4h6.8v7H4.6z"/>`
    + `<path fill="${C.green}" d="M5.9 4.6l1.3 1.3 2.5-2.5.9.9-3.4 3.4-2.2-2.2z"/>`
    + `<path fill="${C.steelDim}" d="M1.2 7.8h13.6v6.8H1.2z"/>`
    + `<path fill="${C.ink}" d="M5.4 9.2h5.2v1.5H5.4z"/>`,

  // ---- system controls --------------------------------------------------
  alerts: `<path fill="${C.amber}" d="M8 1a1.3 1.3 0 0 1 1.3 1.3v.4A4.2 4.2 0 0 1 12.2 6.7v3.1l1.4 2H2.4l1.4-2V6.7a4.2 4.2 0 0 1 2.9-4v-.4A1.3 1.3 0 0 1 8 1z"/>`
    + `<path fill="${C.amberDeep}" d="M5.9 12.6h4.2a2.1 2.1 0 0 1-4.2 0z"/>`,
  override: `<path fill="${C.amberDeep}" d="M8 1.2l6.8 13.2H1.2z"/>`
    + `<path fill="${C.amber}" d="M8 3.6l4.9 9.4H3.1z"/>`
    + `<path fill="${C.ink}" d="M7.2 6.2h1.6v3.9H7.2zM7.2 10.8h1.6v1.5H7.2z"/>`,
  menu: `<path fill="${C.steelLit}" d="M1.8 3.2h12.4v1.9H1.8zM1.8 7.05h12.4v1.9H1.8zM1.8 10.9h12.4v1.9H1.8z"/>`,
  collapse: `<path fill="${C.steelLit}" d="M8 4.4l5.6 5.6-1.9 1.9L8 8.2l-3.7 3.7-1.9-1.9z"/>`,
  expand: `<path fill="${C.steelLit}" d="M8 11.6L2.4 6l1.9-1.9L8 7.8l3.7-3.7L13.6 6z"/>`,

  // ---- menu items -------------------------------------------------------
  // The only mark this set was missing: the menu's Continue, which is neither
  // loading a file nor starting a game. Same two tones as everything else.
  resume: `<circle cx="8" cy="8" r="6.6" fill="${C.cyanDeep}"/>`
    + `<circle cx="8" cy="8" r="5.2" fill="${C.cyan}"/>`
    + `<path fill="${C.ink}" d="M6.4 4.8l4.6 3.2-4.6 3.2z"/>`,
  history: `<path fill="${C.steel}" d="M5.4 2.8h8.8v1.8H5.4zM5.4 7.1h8.8v1.8H5.4zM5.4 11.4h8.8v1.8H5.4z"/>`
    + `<circle cx="2.6" cy="3.7" r="1.5" fill="${C.cyan}"/>`
    + `<circle cx="2.6" cy="8" r="1.5" fill="${C.amber}"/>`
    + `<circle cx="2.6" cy="12.3" r="1.5" fill="${C.red}"/>`,
  save: `<path fill="${C.green}" d="M6.6 1.2h2.8v5.2h2.9L8 11.4 3.7 6.4h2.9z"/>`
    + `<path fill="${C.steelDim}" d="M1.6 11.6h12.8v3.2H1.6z"/>`,
  load: `<path fill="${C.cyan}" d="M8 1L12.3 6H9.4v5.2H6.6V6H3.7z"/>`
    + `<path fill="${C.steelDim}" d="M1.6 11.6h12.8v3.2H1.6z"/>`,
  newgame: `<path fill="${C.cyan}" d="M6.4 1l1.8 4.4L12.6 7.2 8.2 9l-1.8 4.4L4.6 9 .2 7.2 4.6 5.4z"/>`
    + `<path fill="${C.gold}" d="M12.3 9.2l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z"/>`,
  help: `<circle cx="8" cy="8" r="6.6" fill="${C.blueDeep}"/>`
    + `<circle cx="8" cy="8" r="5.2" fill="${C.blue}"/>`
    + `<path fill="#fff" d="M7 10.9h2v2.1H7z"/>`
    + `<path fill="#fff" d="M8 2.9c2 0 3.4 1.2 3.4 2.9 0 1.3-.7 2-1.7 2.7-.5.4-.7.6-.7 1.1H7c0-1.2.4-1.8 1.3-2.5.6-.5 1-.7 1-1.3s-.5-1.1-1.3-1.1c-.9 0-1.4.5-1.5 1.3H4.6C4.7 4.1 6 2.9 8 2.9z"/>`,
  settings: `<path fill="${C.steel}" d="M6.9 .6h2.2l.3 2.2 1.4.6 1.8-1.3 1.5 1.5-1.3 1.8.6 1.4 2.2.3v2.2l-2.2.3-.6 1.4 1.3 1.8-1.5 1.5-1.8-1.3-1.4.6-.3 2.2H6.9l-.3-2.2-1.4-.6-1.8 1.3-1.5-1.5 1.3-1.8-.6-1.4-2.2-.3V6.9l2.2-.3.6-1.4-1.3-1.8 1.5-1.5 1.8 1.3 1.4-.6z"/>`
    + `<circle cx="8" cy="8" r="3.4" fill="${C.steelDim}"/>`
    + `<circle cx="8" cy="8" r="1.7" fill="${C.ink}"/>`,

  // ---- the action button ------------------------------------------------
  // A sledgehammer. A pickaxe drawn as an arc over a shaft read as an arrow,
  // and then as an umbrella.
  demolish: `<path fill="${C.brown}" d="M5.9 6.2l2.1 2.1-5.3 5.3-2.1-2.1z"/>`
    + `<path fill="${C.steelDim}" d="M9.3 1.2l5.5 5.5-2.6 2.6L6.7 3.8z"/>`
    + `<path fill="${C.steelLit}" d="M9.9 2.6l4.1 4.1-1.2 1.2-4.1-4.1z"/>`,
  cancel: `<path fill="${C.red}" d="M3.6 1.8L8 6.2l4.4-4.4 1.8 1.8L9.8 8l4.4 4.4-1.8 1.8L8 9.8l-4.4 4.4-1.8-1.8L6.2 8 1.8 3.6z"/>`,
  // Deal another region. An arrow chasing its own tail — the one shape
  // everybody already reads as "again, differently". The single case in the set
  // that is a stroke rather than a mass: a ring of even weight is what makes it
  // read as a loop, and drawing that as an outline would be drawing it twice.
  reroll: `<path fill="none" stroke="${C.cyan}" stroke-width="2.3" d="M12.7 9a5 5 0 1 1-1.2-4.4"/>`
    + `<path fill="${C.cyan}" d="M14.4 1.5l.2 5.2-5-1.4z"/>`,

  // ---- readouts ---------------------------------------------------------
  jobs: `<circle cx="8" cy="4.6" r="3" fill="${C.blue}"/>`
    + `<path fill="${C.blueDeep}" d="M8 8.6c3.2 0 5.6 2 5.6 4.6v1.2H2.4v-1.2c0-2.6 2.4-4.6 5.6-4.6z"/>`,
  labour: `<circle cx="11.4" cy="5.2" r="2.4" fill="${C.greenDeep}"/>`
    + `<path fill="${C.greenDeep}" d="M11.4 8.4c2.5 0 4.2 1.6 4.2 3.8v2.2H7.8v-2.2c0-2.2 1.7-3.8 3.6-3.8z"/>`
    + `<circle cx="5.4" cy="4.8" r="3" fill="${C.blue}"/>`
    + `<path fill="${C.blueDeep}" d="M5.4 8.6c3 0 5 1.9 5 4.3v1.5H.4v-1.5c0-2.4 2-4.3 5-4.3z"/>`,
  appeal: `<path fill="${C.amberDeep}" d="M8 .8l2.2 4.5 5 .7-3.6 3.5.85 4.95L8 12.1l-4.45 2.3.85-4.95L.8 6l5-.7z"/>`
    + `<path fill="${C.gold}" d="M8 2.9l1.5 3.1 3.4.5-2.45 2.4.6 3.4L8 10.7l-3.05 1.6.6-3.4L3.1 6.5l3.4-.5z"/>`,
  trust: `<circle cx="8" cy="8" r="6.6" fill="${C.amberDeep}"/>`
    + `<circle cx="8" cy="8" r="5.4" fill="${C.gold}"/>`
    + `<circle cx="5.9" cy="6.4" r="1.05" fill="${C.goldInk}"/>`
    + `<circle cx="10.1" cy="6.4" r="1.05" fill="${C.goldInk}"/>`
    + `<path fill="${C.goldInk}" d="M4.4 8.9h7.2c0 2-1.6 3.4-3.6 3.4S4.4 10.9 4.4 8.9z"/>`,
  // A heart, not another cross. Services already has the cross, and two red
  // medical marks on one bar is one too many.
  health: `<path fill="${C.redDeep}" d="M8 14.8S1 10.5 1 6.1a3.7 3.7 0 0 1 7-2 3.7 3.7 0 0 1 7 2c0 4.4-7 8.7-7 8.7z"/>`
    + `<path fill="${C.red}" d="M8 13.1S2.6 9.7 2.6 6.3a2.6 2.6 0 0 1 5-1 2.6 2.6 0 0 1 5 1c0 3.4-4.6 6.8-4.6 6.8z"/>`
    + `<path fill="#ffb3b1" d="M4.6 5c-.9.7-1.1 1.7-.9 2.6-.7-1.1-.4-2.2.9-2.6z"/>`,
  // A loudhailer. A raised fist is the obvious mark for this and is a smudge
  // at twelve pixels; a placard was worse still — at any size it read as a T.
  unrest: `<path fill="${C.amberDeep}" d="M1.2 5.8h3.2l5.8-3.8v12l-5.8-3.8H1.2z"/>`
    + `<path fill="${C.amber}" d="M2.4 6.8h2.4l4-2.6v7.6l-4-2.6H2.4z"/>`
    + `<path fill="${C.red}" d="M11.6 4.6a5 5 0 0 1 0 6.8l1.2 1.1a6.6 6.6 0 0 0 0-9z"/>`,
  radius: `<path fill="${C.cyanDeep}" fill-rule="evenodd" d="M8 .8a7.2 7.2 0 1 1 0 14.4A7.2 7.2 0 0 1 8 .8zm0 1.9a5.3 5.3 0 1 0 0 10.6A5.3 5.3 0 0 0 8 2.7z"/>`
    + `<circle cx="8" cy="8" r="2.6" fill="${C.cyan}"/>`,
};

/**
 * One icon, as markup.
 *
 * Sized in `em`, so it takes the font size of whatever slot it lands in and
 * every existing rule about those slots keeps working. `aria-hidden` because
 * each one sits beside its own label — a screen reader that announced "bell,
 * Alerts" would be reading the decoration out loud.
 */
export function icon(id: IconId, cls = ''): string {
  return `<svg class="ico ico-${id}${cls ? ' ' + cls : ''}" viewBox="0 0 16 16" `
    + 'aria-hidden="true" focusable="false">' + PATHS[id] + '</svg>';
}

/** Every id there is, for anything that needs to enumerate the set. */
export const ICON_IDS = Object.keys(PATHS) as IconId[];
