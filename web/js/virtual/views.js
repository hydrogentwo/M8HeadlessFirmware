// M8 Virtual Teensy - screen layouts
// ==================================
// One full-screen composer per view. Views read engine state (E) and
// draw into the 39x24 grid. Pure rendering: no input handling here.

import { Composer, COLS, ROWS } from './display.js';
import {
  EMPTY, NOTE_OFF, TRACKS, STEPS, noteName, hex2,
  getChain, getPhrase, getInstrument, phraseUseCount, chainUseCount,
  INSTRUMENT_TYPES, SCALES, isChainEmpty,
} from './song.js';
import { FX, FX_ORDER, fxHelp, fxValueHint } from './fx.js';

// View navigation map (Shift+arrows). null = no view.
export const VIEW_MAP = [
  ['PROJECT', 'GROOVE', 'POOL', 'FILE', null],
  ['SONG', 'CHAIN', 'PHRASE', 'INST', 'TABLE'],
  ['MIXER', 'SENDS', 'SYSTEM', null, null],
];
export const MAP_LETTERS = {
  PROJECT: 'P', GROOVE: 'G', POOL: 'O', FILE: 'F', SONG: 'S',
  CHAIN: 'C', PHRASE: 'P', INST: 'I', TABLE: 'T', MIXER: 'M',
  SENDS: 'X', SYSTEM: 'Y', HELP: '?',
};

export function mapPos(view) {
  for (let y = 0; y < VIEW_MAP.length; y++) {
    for (let x = 0; x < VIEW_MAP[y].length; x++) {
      if (VIEW_MAP[y][x] === view) return { x, y };
    }
  }
  return { x: 0, y: 1 };
}

export function viewHints(view) {
  switch (view) {
    case 'SONG': return 'SHF+ARW:GO EDT:CHAIN PLY:PLAY';
    case 'CHAIN': return 'SHF+ARW:GO EDT:PHRASE PLY:PLAY';
    case 'PHRASE': return 'EDT+U/D:FX? KEYJAZZ:A-\' PLY:PLAY';
    case 'INST': return 'EDT+ARW:EDIT OPT+ARW:NEXT INST';
    case 'TABLE': return 'EDT+U/D:FX? SHF+LFT:INST';
    case 'GROOVE': return 'EDT+ARW:TICKS OPT+ARW:GROOVE';
    case 'POOL': return 'EDT:EDIT PLY:PREVIEW OPT+EDT:DEL';
    case 'FILE': return 'EDT:LOAD PLY:PREV OPT+ARW:TAB';
    case 'MIXER': return 'OPT+SHF:MUTE OPT+PLY:SOLO';
    case 'SENDS': return 'EDT+ARW:EDIT SHF+UP:MIXER';
    case 'PROJECT': return 'EDT:RUN/SAVE SHF+UP:SONG';
    case 'SYSTEM': return 'EDT+ARW:CHANGE';
    case 'HELP': return 'EDT:INSERT OPT:BACK';
    default: return '';
  }
}

function transportStr(E) {
  const t = E.transport.playing ? '>' : '.';
  return `T>${E.prj.song.tempo}${t}`;
}

function header(g, E, title) {
  const T = E.theme;
  g.print(title, 0, 0, T.head);
  g.printRight(transportStr(E), COLS - 1, 0, E.transport.playing ? T.ok : T.dim);
}

function inSel(E, c, r) {
  const s = E.sel;
  if (!s || s.view !== E.view) return false;
  const c0 = Math.min(s.c0, s.c1);
  const c1 = Math.max(s.c0, s.c1);
  const r0 = Math.min(s.r0, s.r1);
  const r1 = Math.max(s.r0, s.r1);
  return c >= c0 && c <= c1 && r >= r0 && r <= r1;
}

function playCell(g, E, c, r, w, playing) {
  const T = E.theme;
  if (playing) g.rectCells(c, r, w, 1, T.playBg);
}

function cursorCell(g, E, c, r, w, selected) {
  const T = E.theme;
  if (selected) g.rectCells(c, r, w, 1, T.selBg);
  // caller draws cursor rect + inverted text when cursor is here
}

// Draw text with optional cursor inversion / selection / play highlight.
function gridText(g, E, str, c, r, opts = {}) {
  const T = E.theme;
  const w = String(str).length;
  if (opts.play) g.rectCells(c, r, w, 1, T.playBg);
  if (opts.sel) g.rectCells(c, r, w, 1, T.selBg);
  if (opts.cursor) g.rectCells(c, r, w, 1, T.cursorBg);
  let fg = opts.fg || T.fg;
  if (opts.play && !opts.cursor) fg = T.playFg;
  if (opts.cursor) fg = T.cursorFg;
  if (opts.dim) fg = T.dim;
  g.print(str, c, r, fg);
}

// ---- SONG ----------------------------------------------------------------
function viewSong(g, E) {
  const T = E.theme;
  const song = E.prj.song;
  header(g, E, `SONG ${song.name}`.slice(0, 28));
  const cur = E.cur.song;
  // track headers
  g.print('ROW', 0, 1, T.dim);
  for (let t = 0; t < TRACKS; t++) {
    const m = E.muted[t];
    const s = E.soloed[t];
    const flag = m && s ? '*' : m ? 'M' : s ? 'S' : ' ';
    const label = `${t + 1}${flag} `;
    const isCur = cur.t === t;
    gridText(g, E, label, 4 + t * 4, 1, { fg: isCur ? T.accent : T.track, cursor: false });
  }
  // rows
  const top = cur.top;
  for (let i = 0; i < 16; i++) {
    const r = top + i;
    const y = 2 + i;
    if (r >= song.rows.length) break;
    const isCursorRow = cur.row === r;
    gridText(g, E, hex2(r), 0, y, { fg: isCursorRow ? T.accent : T.dim });
    for (let t = 0; t < TRACKS; t++) {
      const v = song.rows[r].ch[t];
      const str = v === EMPTY ? '--' : hex2(v);
      const ph = E.playT[t];
      const playing = E.transport.playing && ph && ph.active && ph.songRow === r;
      const cursor = isCursorRow && cur.t === t;
      const sel = inSel(E, t, r);
      gridText(g, E, str, 4 + t * 4, y, {
        play: playing, cursor, sel, dim: E.muted[t] && !cursor,
      });
    }
  }
  // live status panel
  for (let t = 0; t < TRACKS; t++) {
    const ph = E.playT[t];
    const y = 18 + Math.floor(t / 4);
    const x = (t % 4) * 9;
    let s;
    if (E.transport.playing && ph && ph.active) {
      s = `${t + 1}:${ph.chain === EMPTY ? '--' : hex2(ph.chain)}/${ph.phrase === EMPTY ? '--' : hex2(ph.phrase)}`;
    } else {
      s = `${t + 1}:--/--`;
    }
    g.print(s, x, y, E.muted[t] ? T.faint : T.dim);
  }
  g.print(`TEMPO ${song.tempo} TRSP ${song.transpose >= 0 ? '+' : ''}${song.transpose}`, 0, 20, T.dim);
  g.print(`SCALE ${SCALES[song.scale].name} ROWS ${song.rows.length}`, 0, 21, T.dim);
}

// ---- CHAIN -----------------------------------------------------------------
function viewChain(g, E) {
  const T = E.theme;
  const n = E.chain;
  const used = chainUseCount(E.prj, n);
  header(g, E, `CHAIN ${hex2(n)}${used ? '*' : ''} TRK${E.track + 1}`);
  const cur = E.cur.chain;
  g.print('R  PH TSP', 0, 1, T.dim);
  const ch = getChain(E.prj, n);
  // find playhead if any track plays this chain
  const steps = new Set();
  if (E.transport.playing) {
    for (const ph of E.playT) {
      if (ph && ph.active && ph.chain === n) steps.add(ph.chainStep);
    }
  }
  for (let r = 0; r < STEPS; r++) {
    const y = 2 + r;
    gridText(g, E, hex2(r), 0, y, { fg: cur.row === r ? T.accent : T.dim });
    const pv = ch ? ch.ph[r] : EMPTY;
    const tv = ch ? ch.ts[r] : 0;
    const playing = steps.has(r);
    gridText(g, E, pv === EMPTY ? '--' : hex2(pv), 4, y, {
      play: playing, cursor: cur.row === r && cur.col === 0, sel: inSel(E, 0, r),
    });
    const ts = `${tv < 0 ? '-' : '+'}${Math.abs(tv).toString(16).toUpperCase().padStart(2, '0')}`;
    gridText(g, E, ts, 7, y, {
      play: playing, cursor: cur.row === r && cur.col === 1, sel: inSel(E, 1, r),
      dim: tv === 0,
    });
    if (pv !== EMPTY && phraseUseCount(E.prj, pv) > 1) g.print('*', 11, y, T.dim);
  }
  // info
  let len = 0;
  if (ch) for (let r = 0; r < STEPS; r++) { if (ch.ph[r] === EMPTY) break; len++; }
  g.print(`USED ${used}X IN SONG LEN ${len}PH ${len * STEPS}ST`, 0, 19, T.dim);
  g.print('OPT+U/D:CHAIN OPT+L/R:TRACK', 0, 21, T.faint);
}

// ---- PHRASE / TABLE (shared grid) --------------------------------------------
const PH_COLS = [
  { key: 'n', x: 3, w: 3 }, { key: 'v', x: 7, w: 2 }, { key: 'i', x: 10, w: 2 },
  { key: 'f0c', x: 13, w: 3 }, { key: 'f0v', x: 16, w: 2 },
  { key: 'f1c', x: 19, w: 3 }, { key: 'f1v', x: 22, w: 2 },
  { key: 'f2c', x: 25, w: 3 }, { key: 'f2v', x: 28, w: 2 },
];
const TB_COLS = [
  { key: 'n', x: 3, w: 3 }, { key: 'v', x: 7, w: 2 },
  { key: 'f0c', x: 10, w: 3 }, { key: 'f0v', x: 13, w: 2 },
  { key: 'f1c', x: 16, w: 3 }, { key: 'f1v', x: 19, w: 2 },
  { key: 'f2c', x: 22, w: 3 }, { key: 'f2v', x: 25, w: 2 },
];

function fxCellStr(fx) {
  return (fx.c || '---') + hex2(fx.v);
}

function viewPhraseGrid(g, E, rows, cur, steps, isTable) {
  const T = E.theme;
  const cols = isTable ? TB_COLS : PH_COLS;
  if (isTable) {
    g.print('R  N   V  FX1   FX2   FX3', 0, 1, T.dim);
  } else {
    g.print('R  N   V  I  FX1   FX2   FX3', 0, 1, T.dim);
  }
  for (let r = 0; r < STEPS; r++) {
    const y = 2 + r;
    const row = rows[r];
    const playing = steps.has(r);
    gridText(g, E, hex2(r), 0, y, { fg: cur.row === r ? T.accent : T.dim });
    // note / transpose
    let nStr;
    if (isTable) {
      nStr = row.n === EMPTY ? '---' : `${row.n < 0 ? '-' : '+'}${Math.abs(row.n).toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      nStr = noteName(row.n);
    }
    gridText(g, E, nStr, cols[0].x, y, {
      play: playing, cursor: cur.row === r && cur.col === 0, sel: inSel(E, 0, r),
      fg: row.n === EMPTY ? T.faint : row.n === NOTE_OFF && !isTable ? T.err : T.fg,
    });
    // vel
    const vStr = row.v === EMPTY ? '--' : hex2(row.v);
    gridText(g, E, vStr, cols[1].x, y, {
      play: playing, cursor: cur.row === r && cur.col === 1, sel: inSel(E, 1, r),
      dim: row.v === EMPTY,
    });
    // inst (phrase only)
    if (!isTable) {
      const iStr = row.i === EMPTY ? '--' : hex2(row.i);
      gridText(g, E, iStr, cols[2].x, y, {
        play: playing, cursor: cur.row === r && cur.col === 2, sel: inSel(E, 2, r),
        dim: row.i === EMPTY,
      });
    }
    // fx
    const base = isTable ? 2 : 3;
    row.fx.forEach((fx, fi) => {
      const cc = cols[base + fi * 2];
      const vc = cols[base + fi * 2 + 1];
      gridText(g, E, fx.c || '---', cc.x, y, {
        play: playing, cursor: cur.row === r && cur.col === base + fi * 2,
        sel: inSel(E, base + fi * 2, r),
        fg: fx.c ? T.track : T.faint,
      });
      gridText(g, E, hex2(fx.v), vc.x, y, {
        play: playing, cursor: cur.row === r && cur.col === base + fi * 2 + 1,
        sel: inSel(E, base + fi * 2 + 1, r),
        dim: !fx.c,
      });
    });
  }
}

function viewPhrase(g, E) {
  const T = E.theme;
  const n = E.phrase;
  const used = phraseUseCount(E.prj, n);
  header(g, E, `PHRASE ${hex2(n)}${used ? '*' : ''} TRK${E.track + 1}`);
  const cur = E.cur.phrase;
  const ph = getPhrase(E.prj, n);
  const rows = ph ? ph.rows : [];
  const steps = new Set();
  if (E.transport.playing) {
    for (const pht of E.playT) {
      if (pht && pht.active && pht.phrase === n) steps.add(pht.phraseStep);
    }
  }
  const empty = [];
  for (let i = 0; i < STEPS; i++) empty.push({ n: EMPTY, v: 64, i: EMPTY, fx: [{ c: '', v: 0 }, { c: '', v: 0 }, { c: '', v: 0 }] });
  viewPhraseGrid(g, E, ph ? rows : empty, cur, steps, false);
  // context line: instrument under cursor + fx help
  const row = (ph ? rows : empty)[cur.row];
  if (row && row.i !== EMPTY) {
    const ins = getInstrument(E.prj, row.i);
    g.print(`INS ${hex2(row.i)}:${ins ? INSTRUMENT_TYPES[ins.type].name : '???'} ${ins ? ins.name : ''}`.slice(0, 33), 0, 19, T.dim);
  } else {
    g.print(`USED ${used}X  SEL INS ${hex2(E.inst)}`, 0, 19, T.dim);
  }
  // fx help for cursor column
  if (cur.col >= 3) {
    const fi = Math.floor((cur.col - 3) / 2);
    const fx = row.fx[fi];
    const cmd = fx.c || '---';
    const hint = fx.v !== undefined && fx.c ? fxValueHint(fx.c, fx.v) : null;
    g.print(`${cmd}${hint ? ' ' + hint : ''}`, 0, 20, T.track);
    if (fx.c && FX[fx.c]) {
      const h = fxHelp(fx.c);
      g.print(h.slice(0, 33), 0, 21, T.dim);
      if (h.length > 33) g.print(h.slice(33, 66), 0, 22, T.dim);
    }
  } else if (cur.col === 0) {
    g.print('KEYJAZZ:A-W-S-E-D... -/=OCT', 0, 20, T.faint);
    g.print('EDT+U/D:OCT EDT+L/R:SEMI', 0, 21, T.faint);
  }
}

// ---- INSTRUMENT ---------------------------------------------------------------
function viewInst(g, E) {
  const T = E.theme;
  const n = E.inst;
  const ins = getInstrument(E.prj, n);
  const type = ins ? ins.type : 'WAV';
  header(g, E, `INST ${hex2(n)}:${INSTRUMENT_TYPES[type].name}${ins && ins.name ? ' ' + ins.name : ''}`.slice(0, 30));
  const cur = E.cur.inst;
  const defs = INSTRUMENT_TYPES[type].params;
  const rows = [{ id: '__TYPE', label: 'TYPE', type: true }, ...defs.map((d) => ({ ...d, type: false }))];
  const top = cur.top;
  for (let i = 0; i < rows.length && i < 21; i++) {
    const ri = top + i;
    if (ri >= rows.length) break;
    const y = 1 + i;
    const d = rows[ri];
    const cursor = cur.row === ri;
    let valStr, decStr;
    if (d.type) {
      valStr = type;
      decStr = INSTRUMENT_TYPES[type].name;
    } else {
      const v = ins ? ins.p[d.id] : d.def;
      if (d.names) {
        valStr = hex2(v);
        decStr = d.names[v] || '?';
      } else if (d.min < 0) {
        valStr = `${v < 0 ? '-' : '+'}${Math.abs(v).toString(16).toUpperCase().padStart(2, '0')}`;
        decStr = `${v >= 0 ? '+' : ''}${v}`;
      } else {
        valStr = hex2(v);
        decStr = paramDecoded(d, v);
      }
    }
    gridText(g, E, d.label.padEnd(9), 0, y, { cursor, fg: cursor ? undefined : T.dim });
    gridText(g, E, valStr, 10, y, { cursor });
    g.print(String(decStr).slice(0, 20), 14, y, cursor ? T.cursorFg : T.dim);
  }
  // table summary at bottom
  const tb = ins ? ins.table : null;
  let tbRows = 0;
  if (tb) for (const r of tb.rows) if (r.n !== EMPTY || r.v !== EMPTY || r.fx.some((f) => f.c)) tbRows++;
  g.print(`TABLE TIC${tb ? String(tb.tic).padStart(2, '0') : '01'} ${tbRows}/16 SHF+RGT:GOTO`, 0, 22, T.faint);
}

function paramDecoded(d, v) {
  switch (d.id) {
    case 'CUT': return Math.round(40 * Math.pow(450, v / 255)) + 'HZ';
    case 'VOL': return Math.round((v / 255) * 100) + '%';
    case 'PAN': return v === 128 ? 'C' : v < 128 ? `L${Math.round((128 - v) / 1.28)}` : `R${Math.round((v - 128) / 1.27)}`;
    case 'ATT': return (0.001 + Math.pow(v / 255, 2) * 2).toFixed(2) + 'S';
    case 'DEC': case 'REL': return (0.005 + Math.pow(v / 255, 2) * 4).toFixed(2) + 'S';
    case 'SUS': return Math.round((v / 255) * 100) + '%';
    case 'RAT': return [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 12, 16][v] + 'X';
    case 'CHN': return 'CH' + v;
    case 'DET': return v + 'CT';
    case 'PWM': return v + '%';
    default: return '';
  }
}

// ---- TABLE ----------------------------------------------------------------------
function viewTable(g, E) {
  const T = E.theme;
  const n = E.inst;
  const ins = getInstrument(E.prj, n, false);
  const tic = ins ? ins.table.tic : 1;
  header(g, E, `TABLE I${hex2(n)} TIC${String(tic).padStart(2, '0')}`);
  const cur = E.cur.table;
  const empty = [];
  for (let i = 0; i < STEPS; i++) empty.push({ n: EMPTY, v: EMPTY, fx: [{ c: '', v: 0 }, { c: '', v: 0 }, { c: '', v: 0 }] });
  // playheads: tracks whose note-table is this instrument's table
  const steps = new Set();
  if (E.transport.playing) {
    for (const pht of E.playT) {
      if (pht && pht.active && pht.tableInst === n && pht.tableStep >= 0) steps.add(pht.tableStep);
    }
  }
  viewPhraseGrid(g, E, ins ? ins.table.rows : empty, cur, steps, true);
  g.print('N=TRANSPOSE V=MULT OPT+EDT:DEL ROW', 0, 19, T.faint);
  const rows = ins ? ins.table.rows : empty;
  const row = rows[cur.row];
  if (cur.col >= 2 && row) {
    const fi = Math.floor((cur.col - 2) / 2);
    const fx = row.fx[fi];
    if (fx.c && FX[fx.c]) {
      g.print(`${fx.c}: ${fxHelp(fx.c)}`.slice(0, 33), 0, 20, T.dim);
    }
  }
  g.print('EDT ON TIC: SHF+OPT? USE SYSTEM', 0, 21, T.faint);
  g.print('HINT: TIC=TABLE SPEED, EDIT IN INST', 0, 22, T.faint);
}

// ---- GROOVE -----------------------------------------------------------------------
function viewGroove(g, E) {
  const T = E.theme;
  header(g, E, `GROOVE ${hex2(E.groove)}`);
  const cur = E.cur.groove;
  g.print('R  TIC', 0, 1, T.dim);
  const gr = E.prj.grooves[E.groove];
  for (let r = 0; r < STEPS; r++) {
    const y = 2 + r;
    gridText(g, E, hex2(r), 0, y, { fg: cur.row === r ? T.accent : T.dim });
    const v = gr.steps[r];
    gridText(g, E, hex2(v), 4, y, { cursor: cur.row === r, sel: inSel(E, 0, r) });
    if (v === 0) {
      g.print('SKIP', 8, y, T.faint);
    } else {
      g.print('#'.repeat(Math.min(20, v)), 8, y, cur.row === r ? T.accent : T.track);
    }
  }
  g.print('TRK GRV: ' + E.trackGrooves.map((x, i) => `${i + 1}:${hex2(x)}`).join(' '), 0, 19, T.dim);
  g.print('24TICKS/BEAT 00=SKIP STEP', 0, 20, T.faint);
  g.print('OPT+L/R:GROOVE GRV FX ASSIGNS', 0, 21, T.faint);
}

// ---- POOL ---------------------------------------------------------------------------
function viewPool(g, E) {
  const T = E.theme;
  const used = Object.keys(E.prj.instruments).length;
  header(g, E, `POOL ${used}/128`);
  const cur = E.cur.pool;
  for (let i = 0; i < 128; i++) {
    const c = i % 8;
    const r = Math.floor(i / 8);
    const x = 1 + c * 4;
    const y = 1 + r;
    const ins = E.prj.instruments[i];
    const str = ins ? hex2(i) + ins.type[0] : '---';
    const active = E.activeInst.has(i);
    gridText(g, E, str, x, y, {
      cursor: cur.idx === i, play: active && !ins ? false : active,
      fg: ins ? T.fg : T.faint,
    });
  }
  const ins = getInstrument(E.prj, cur.idx);
  if (ins) {
    g.print(`${hex2(cur.idx)}:${INSTRUMENT_TYPES[ins.type].name} ${ins.name}`.slice(0, 33), 0, 18, T.dim);
    const pv = Object.entries(E.prj.phrases).filter(([, p]) => p.rows.some((row) => row.i === cur.idx)).length;
    g.print(`USED IN ${pv} PHRASES`, 0, 19, T.dim);
  } else {
    g.print(`${hex2(cur.idx)}:EMPTY  EDT:CREATE`, 0, 18, T.dim);
  }
  g.print('EDT:GOTO INST PLY:PREVIEW', 0, 20, T.faint);
}

// ---- FILE -----------------------------------------------------------------------------
function viewFile(g, E) {
  const T = E.theme;
  header(g, E, 'FILES');
  const cur = E.cur.file;
  // tabs
  gridText(g, E, 'SAMPLES', 0, 1, { cursor: cur.tab === 0, fg: cur.tab === 0 ? undefined : T.dim });
  gridText(g, E, 'SONGS', 9, 1, { cursor: cur.tab === 1, fg: cur.tab === 1 ? undefined : T.dim });
  g.print('OPT+L/R:TAB', 20, 1, T.faint);
  if (cur.tab === 0) {
    const top = cur.top;
    for (let i = 0; i < 16; i++) {
      const s = top + i;
      if (s >= 64) break;
      const y = 3 + i;
      const meta = E.samplesMeta[s];
      gridText(g, E, hex2(s), 0, y, { fg: cur.idx === s ? T.accent : T.dim });
      if (meta) {
        gridText(g, E, meta.name.slice(0, 20).padEnd(20), 3, y, { cursor: cur.idx === s });
        g.print(meta.dur, 24, y, T.dim);
      } else {
        gridText(g, E, '--EMPTY--', 3, y, { cursor: cur.idx === s, fg: T.faint });
      }
    }
    g.print('EDT:UPLOAD PLY:PREVIEW OPT+EDT:DEL', 0, 20, T.faint);
  } else {
    const files = E.songFiles;
    const rows = [{ name: '+ SAVE CURRENT AS...' }, ...files];
    const top = cur.top;
    for (let i = 0; i < 16; i++) {
      const ri = top + i;
      if (ri >= rows.length) break;
      const y = 3 + i;
      const f = rows[ri];
      gridText(g, E, f.name.slice(0, 30), 0, y, {
        cursor: cur.idx === ri, fg: ri === 0 ? T.track : T.fg,
      });
      if (f.size) g.print(f.size, 31, y, T.dim);
    }
    g.print('EDT:LOAD/SAVE OPT+EDT:DELETE', 0, 20, T.faint);
  }
  g.print(E.sdUsage, 0, 21, T.dim);
}

// ---- MIXER ------------------------------------------------------------------------------
const MIX_COLS = [
  { id: 'vol', x: 4, label: 'VOL' }, { id: 'pan', x: 8, label: 'PAN' },
  { id: 'cho', x: 12, label: 'CHO' }, { id: 'del', x: 16, label: 'DEL' },
  { id: 'rev', x: 20, label: 'REV' },
];
function viewMixer(g, E) {
  const T = E.theme;
  header(g, E, 'MIXER');
  const cur = E.cur.mixer;
  g.print('TR', 0, 1, T.dim);
  for (const c of MIX_COLS) g.print(c.label, c.x - 1, 1, T.dim);
  const mx = E.prj.mixer;
  for (let t = 0; t < TRACKS; t++) {
    const y = 2 + t;
    const tr = mx.tracks[t];
    gridText(g, E, `${t + 1}${E.muted[t] ? 'M' : E.soloed[t] ? 'S' : ' '}`, 0, y, {
      fg: E.muted[t] ? T.faint : T.track,
    });
    MIX_COLS.forEach((c, ci) => {
      gridText(g, E, hex2(tr[c.id]), c.x, y, {
        cursor: cur.row === t && cur.col === ci, dim: E.muted[t],
      });
    });
  }
  gridText(g, E, 'M', 0, 10, { fg: T.accent });
  gridText(g, E, hex2(mx.master), 4, 10, { cursor: cur.row === 8 && cur.col === 0 });
  g.print('MASTER', 7, 10, T.dim);
  // live meters
  for (let t = 0; t < TRACKS; t++) {
    const y = 12 + t;
    const lv = E.levels ? E.levels[t] || 0 : 0;
    const n = Math.round(Math.min(1, lv) * 20);
    g.print(`${t + 1}`, 0, y, T.dim);
    g.print('#'.repeat(n).padEnd(20), 2, y, E.muted[t] ? T.faint : T.ok);
  }
  const ml = E.levels ? E.levels[8] || 0 : 0;
  g.print('M' + '#'.repeat(Math.round(Math.min(1, ml) * 20)).padEnd(20), 24, 19, T.accent);
}

// ---- SENDS ---------------------------------------------------------------------------------
function viewSends(g, E) {
  const T = E.theme;
  header(g, E, 'SEND FX');
  const cur = E.cur.sends;
  const mx = E.prj.mixer;
  const sections = [
    { name: 'DELAY', obj: mx.delay, params: [['time', 'TIME'], ['fb', 'FEEDBACK'], ['damp', 'DAMP'], ['mix', 'MIX']] },
    { name: 'REVERB', obj: mx.reverb, params: [['size', 'SIZE'], ['decay', 'DECAY'], ['damp', 'DAMP'], ['mix', 'MIX']] },
    { name: 'CHORUS', obj: mx.chorus, params: [['type', 'TYPE'], ['rate', 'RATE'], ['depth', 'DEPTH'], ['mix', 'MIX']] },
  ];
  let ri = 0;
  let y = 1;
  for (const s of sections) {
    g.print(s.name, 0, y++, T.track);
    for (const [id, label] of s.params) {
      const v = s.obj[id];
      const cursor = cur.row === ri;
      let dec = '';
      if (s.name === 'CHORUS' && id === 'type') dec = ['CHORUS', 'PHASER', 'FLANGER'][v] || '?';
      gridText(g, E, label.padEnd(9), 1, y, { cursor, fg: cursor ? undefined : T.dim });
      gridText(g, E, s.name === 'CHORUS' && id === 'type' ? `0${v}` : hex2(v), 11, y, { cursor });
      if (dec) g.print(dec, 15, y, cursor ? T.cursorFg : T.dim);
      ri++;
      y++;
    }
    y++;
  }
  g.print('SENDS: CHO DEL REV PER INST/TRK', 0, 20, T.faint);
}

// ---- PROJECT -----------------------------------------------------------------------------------
function viewProject(g, E) {
  const T = E.theme;
  header(g, E, 'PROJECT');
  const cur = E.cur.project;
  const song = E.prj.song;
  const rows = [
    { label: 'NAME', kind: 'name' },
    { label: 'TEMPO', kind: 'tempo' },
    { label: 'TRANSPOSE', kind: 'transpose' },
    { label: 'SCALE', kind: 'scale' },
    { label: 'ROWS', kind: 'rows' },
    { label: 'SAVE', kind: 'cmd' },
    { label: 'LOAD', kind: 'cmd' },
    { label: 'NEW', kind: 'cmd' },
    { label: 'EXPORT', kind: 'cmd' },
    { label: 'IMPORT', kind: 'cmd' },
    { label: 'BOUNCE WAV', kind: 'cmd' },
  ];
  rows.forEach((d, i) => {
    const y = 2 + i;
    const cursor = cur.row === i;
    gridText(g, E, d.label.padEnd(11), 2, y, { cursor, fg: cursor ? undefined : d.kind === 'cmd' ? T.track : T.dim });
    let val = '';
    if (d.kind === 'name') val = song.name.padEnd(16);
    else if (d.kind === 'tempo') val = `${song.tempo} BPM`;
    else if (d.kind === 'transpose') val = `${song.transpose >= 0 ? '+' : ''}${song.transpose}`;
    else if (d.kind === 'scale') val = SCALES[song.scale].name;
    else if (d.kind === 'rows') val = `${song.rows.length}`;
    else if (d.kind === 'cmd' && d.label === 'BOUNCE WAV' && E.rec.active) val = `REC ${E.rec.secs}S STOP:EDT`;
    if (val) gridText(g, E, String(val).slice(0, 22), 14, y, { cursor: cursor && d.kind === 'name' ? false : cursor });
  });
  // name char cursor
  if (cur.row === 0) {
    g.rectCells(14 + Math.min(15, cur.nameChar), 2, 1, 1, T.cursorBg);
    const ch = (song.name[cur.nameChar] || ' ');
    g.print(ch, 14 + Math.min(15, cur.nameChar), 2, T.cursorFg);
  }
  g.print('AUTOSAVE: ON (BROWSER STORAGE)', 0, 20, T.faint);
  g.print(`SONG: ${countObjects(E.prj)}`, 0, 21, T.dim);
}

function countObjects(prj) {
  const c = Object.keys(prj.chains).length;
  const p = Object.keys(prj.phrases).length;
  const i = Object.keys(prj.instruments).length;
  return `CH${c} PH${p} IN${i}`;
}

// ---- SYSTEM --------------------------------------------------------------------------------------
function viewSystem(g, E) {
  const T = E.theme;
  header(g, E, 'SYSTEM');
  const cur = E.cur.system;
  const info = E.engineInfo;
  const rows = [
    ['THEME', E.themeKey],
    ['OCTAVE', 'C' + E.keyOct],
    ['VELOCITY', String(E.keyVel)],
    ['SCOPE', E.scopeOn ? 'ON' : 'OFF'],
    ['ENGINE', info.wasm ? 'WASM OK' : 'JS FALLBACK'],
    ['VOICES', `${info.voices}/16`],
    ['STORAGE', E.sdUsageShort],
    ['BACKEND', info.backend],
  ];
  rows.forEach((d, i) => {
    const y = 2 + i;
    const cursor = cur.row === i;
    gridText(g, E, d[0].padEnd(10), 2, y, { cursor, fg: cursor ? undefined : T.dim });
    gridText(g, E, String(d[1]).slice(0, 24), 13, y, { cursor });
  });
  g.print('M8 VIRTUAL TEENSY V1.0', 2, 12, T.head);
  g.print('CLEAN-ROOM TRACKER. NO TEENSY', 2, 13, T.dim);
  g.print('REQUIRED. WORKFLOW MIRRORS M8.', 2, 14, T.dim);
  g.print('NOT AFFILIATED WITH DIRTYWAVE.', 2, 15, T.dim);
  g.print('SUPPORT: DIRTYWAVE.COM', 2, 16, T.track);
  g.print(`UPTIME ${info.uptime}`, 2, 18, T.faint);
}

// ---- HELP -------------------------------------------------------------------------------------------
function viewHelp(g, E) {
  const T = E.theme;
  header(g, E, `FX HELP${E.helpContext ? ' ' + E.helpContext : ''}`);
  const cur = E.cur.help;
  const top = cur.top;
  for (let i = 0; i < 17; i++) {
    const fi = top + i;
    if (fi >= FX_ORDER.length) break;
    const y = 2 + i;
    const cmd = FX_ORDER[fi];
    const f = FX[cmd];
    const cursor = cur.idx === fi;
    gridText(g, E, cmd, 1, y, { cursor, fg: cursor ? undefined : T.track });
    g.print(f.label.slice(0, 12).padEnd(12), 5, y, cursor ? T.cursorFg : T.dim);
    g.print(f.help.slice(0, 20), 18, y, cursor ? T.cursorFg : T.faint);
  }
  const cmd = FX_ORDER[cur.idx];
  const h = fxHelp(cmd);
  g.print(`${cmd}:`, 0, 20, T.accent);
  g.print(h.slice(0, 39), 0, 21, T.fg);
  g.print(h.slice(39, 78), 0, 22, T.fg);
}

// ---- dispatch + chrome -------------------------------------------------------------------------------
const RENDER = {
  SONG: viewSong, CHAIN: viewChain, PHRASE: viewPhrase, INST: viewInst,
  TABLE: viewTable, GROOVE: viewGroove, POOL: viewPool, FILE: viewFile,
  MIXER: viewMixer, SENDS: viewSends, PROJECT: viewProject, SYSTEM: viewSystem,
  HELP: viewHelp,
};

export function renderView(g, E) {
  const T = E.theme;
  g.cls(T.bg);
  const fn = RENDER[E.view] || viewSong;
  fn(g, E);
  drawMinimap(g, E);
  drawFooter(g, E);
}

function drawMinimap(g, E) {
  const T = E.theme;
  const pos = E.view === 'HELP' && E.viewReturn ? mapPos(E.viewReturn) : mapPos(E.view);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 5; x++) {
      const v = VIEW_MAP[y][x];
      const c = 33 + x;
      const r = 20 + y;
      if (!v) {
        g.print('.', c, r, T.faint);
      } else if (x === pos.x && y === pos.y) {
        g.rectCells(c, r, 1, 1, T.accent);
        g.print(MAP_LETTERS[v], c, r, T.bg);
      } else {
        g.print(MAP_LETTERS[v], c, r, T.dim);
      }
    }
  }
}

function drawFooter(g, E) {
  const T = E.theme;
  g.rectCells(0, ROWS - 1, COLS, 1, T.bg);
  const msg = E.statusText();
  if (msg) {
    g.print(msg.slice(0, 39), 0, ROWS - 1, T.accent);
  } else {
    let h = viewHints(E.view);
    if (E.sel) h = 'SEL:OPT=COPY SHF+EDT=PASTE';
    if (E.transport.playing) h = h.slice(0, 30);
    g.print(h.slice(0, 39), 0, ROWS - 1, T.dim);
    if (E.transport.playing) {
      const m = E.transport.mode.toUpperCase();
      g.printRight(`[${m}]`, COLS - 1, ROWS - 1, T.ok);
    }
  }
}

// Text snapshot helper (tests): renders current view to string rows.
export function snapshotText(E) {
  const g = new Composer();
  renderView(g, E);
  return g.textRows();
}
