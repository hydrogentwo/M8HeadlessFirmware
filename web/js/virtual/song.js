// M8 Virtual Teensy - song data model
// ================================
// Clean-room data structures mirroring the M8 tracker workflow
// (song -> chains -> phrases -> instruments -> tables).
// Our file format (.vm8.json) is our own and is NOT compatible with
// real M8 song files - only the workflow is mirrored.

export const EMPTY = -1;
export const NOTE_OFF = 128;
export const MAX_CHAINS = 256;
export const MAX_PHRASES = 256;
export const MAX_INSTRUMENTS = 128;
export const MAX_GROOVES = 16;
export const TRACKS = 8;
export const STEPS = 16;

const NOTE_NAMES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];

export function noteName(n) {
  if (n === EMPTY || n === undefined || n === null) return '---';
  if (n === NOTE_OFF) return 'OFF';
  if (n < 0 || n > 127) return '???';
  return NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
}

export function noteFreq(n) {
  return 440 * Math.pow(2, (n - 69) / 12);
}

export function hex2(v) {
  v = Math.max(0, Math.min(255, v | 0));
  return v.toString(16).toUpperCase().padStart(2, '0');
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- empty constructors ------------------------------------------------
export function newFx() {
  return { c: '', v: 0 };
}

export function newPhraseRow() {
  return { n: EMPTY, v: 64, i: EMPTY, fx: [newFx(), newFx(), newFx()] };
}

export function newPhrase() {
  const rows = [];
  for (let i = 0; i < STEPS; i++) rows.push(newPhraseRow());
  return { rows };
}

export function newChain() {
  return {
    ph: new Array(STEPS).fill(EMPTY),
    ts: new Array(STEPS).fill(0),
  };
}

export function newTableRow() {
  return { n: EMPTY, v: EMPTY, fx: [newFx(), newFx(), newFx()] };
}

export function newTable() {
  const rows = [];
  for (let i = 0; i < STEPS; i++) rows.push(newTableRow());
  return { tic: 1, rows };
}

// ---- instrument types --------------------------------------------------
// Param def: { id, label, min, max, def, fmt? } values stored as ints.
const COMMON_SENDS = [
  { id: 'VOL', label: 'VOLUME', min: 0, max: 255, def: 200 },
  { id: 'PAN', label: 'PAN', min: 0, max: 255, def: 128 },
  { id: 'CHO', label: 'CHORUS', min: 0, max: 255, def: 0 },
  { id: 'DEL', label: 'DELAY', min: 0, max: 255, def: 0 },
  { id: 'REV', label: 'REVERB', min: 0, max: 255, def: 0 },
];
const COMMON_ENV = [
  { id: 'ATT', label: 'ATTACK', min: 0, max: 255, def: 4 },
  { id: 'DEC', label: 'DECAY', min: 0, max: 255, def: 30 },
  { id: 'SUS', label: 'SUSTAIN', min: 0, max: 255, def: 255 },
  { id: 'REL', label: 'RELEASE', min: 0, max: 255, def: 40 },
];

export const SHAPES = ['SAW', 'SQR', 'TRI', 'SIN', 'NOI', 'FM', 'SSW', 'PLK'];
export const MAC_MODELS = ['SAW', 'SQR', 'TRI', 'SIN', 'NOI', 'FM', 'SSW', 'PLK'];
export const SMP_LOOPS = ['OFF', 'FWD', 'PNG'];

export const INSTRUMENT_TYPES = {
  WAV: {
    name: 'WAVSYNTH',
    params: [
      { id: 'SHP', label: 'SHAPE', min: 0, max: 7, def: 0, names: SHAPES },
      { id: 'PIT', label: 'PITCH', min: -48, max: 48, def: 0 },
      { id: 'CUT', label: 'CUTOFF', min: 0, max: 255, def: 255 },
      { id: 'RES', label: 'RESO', min: 0, max: 255, def: 0 },
      { id: 'PWM', label: 'PW', min: 5, max: 95, def: 50 },
      { id: 'VIB', label: 'VIB SPD', min: 0, max: 255, def: 0 },
      { id: 'VBD', label: 'VIB DEP', min: 0, max: 255, def: 0 },
      ...COMMON_ENV,
      ...COMMON_SENDS,
    ],
  },
  FM: {
    name: 'FMSYNTH',
    params: [
      { id: 'RAT', label: 'RATIO', min: 0, max: 15, def: 2 },
      { id: 'IDX', label: 'MOD IDX', min: 0, max: 255, def: 90 },
      { id: 'FB', label: 'FEEDBACK', min: 0, max: 255, def: 0 },
      { id: 'PIT', label: 'PITCH', min: -48, max: 48, def: 0 },
      { id: 'CUT', label: 'CUTOFF', min: 0, max: 255, def: 255 },
      { id: 'RES', label: 'RESO', min: 0, max: 255, def: 0 },
      ...COMMON_ENV,
      ...COMMON_SENDS,
    ],
  },
  MAC: {
    name: 'MACROSYNTH',
    params: [
      { id: 'MOD', label: 'MODEL', min: 0, max: 7, def: 0, names: MAC_MODELS },
      { id: 'TMB', label: 'TIMBRE', min: 0, max: 255, def: 160 },
      { id: 'COL', label: 'COLOR', min: 0, max: 255, def: 64 },
      { id: 'PIT', label: 'PITCH', min: -48, max: 48, def: 0 },
      ...COMMON_ENV,
      ...COMMON_SENDS,
    ],
  },
  HYP: {
    name: 'HYPERSYNTH',
    params: [
      { id: 'SHP', label: 'SHAPE', min: 0, max: 3, def: 2, names: ['SAW', 'SQR', 'SSW', 'SIN'] },
      { id: 'DET', label: 'DETUNE', min: 0, max: 100, def: 18 },
      { id: 'SUB', label: 'SUB OSC', min: 0, max: 255, def: 90 },
      { id: 'PIT', label: 'PITCH', min: -48, max: 48, def: 0 },
      { id: 'CUT', label: 'CUTOFF', min: 0, max: 255, def: 230 },
      { id: 'RES', label: 'RESO', min: 0, max: 255, def: 0 },
      ...COMMON_ENV,
      ...COMMON_SENDS,
    ],
  },
  SMP: {
    name: 'SAMPLER',
    params: [
      { id: 'SMP', label: 'SAMPLE', min: 0, max: 63, def: 0 },
      { id: 'PIT', label: 'PITCH', min: -48, max: 48, def: 0 },
      { id: 'STA', label: 'START', min: 0, max: 255, def: 0 },
      { id: 'LEN', label: 'LENGTH', min: 1, max: 255, def: 255 },
      { id: 'LOP', label: 'LOOP', min: 0, max: 2, def: 0, names: SMP_LOOPS },
      { id: 'LPS', label: 'LOOP ST', min: 0, max: 255, def: 0 },
      { id: 'LPL', label: 'LOOP LN', min: 1, max: 255, def: 255 },
      { id: 'SLI', label: 'SLICE', min: 0, max: 16, def: 0 },
      { id: 'CUT', label: 'CUTOFF', min: 0, max: 255, def: 255 },
      { id: 'RES', label: 'RESO', min: 0, max: 255, def: 0 },
      ...COMMON_ENV,
      ...COMMON_SENDS,
    ],
  },
  MID: {
    name: 'MIDIOUT',
    params: [
      { id: 'CHN', label: 'CHANNEL', min: 1, max: 16, def: 1 },
      { id: 'BNK', label: 'BANK', min: 0, max: 127, def: 0 },
      { id: 'PRG', label: 'PROG', min: 0, max: 127, def: 0 },
      { id: 'VOL', label: 'VOLUME', min: 0, max: 255, def: 200 },
    ],
  },
};

export const TYPE_KEYS = Object.keys(INSTRUMENT_TYPES);

export function paramDef(type, id) {
  const t = INSTRUMENT_TYPES[type];
  if (!t) return null;
  return t.params.find((p) => p.id === id) || null;
}

export function defaultParams(type) {
  const t = INSTRUMENT_TYPES[type];
  const p = {};
  for (const d of t.params) p[d.id] = d.def;
  return p;
}

export function newInstrument(type = 'WAV', name = '') {
  return { type, name, p: defaultParams(type), table: newTable() };
}

// ---- mixer / sends ------------------------------------------------------
export function newMixerTrack() {
  return { vol: 200, pan: 128, cho: 0, del: 0, rev: 0 };
}

export function newMixer() {
  const tracks = [];
  for (let i = 0; i < TRACKS; i++) tracks.push(newMixerTrack());
  return {
    tracks,
    master: 220,
    delay: { time: 96, fb: 90, damp: 140, mix: 255 },
    reverb: { size: 170, decay: 150, damp: 160, mix: 255 },
    chorus: { type: 0, rate: 40, depth: 90, mix: 255 },
  };
}

// ---- grooves ------------------------------------------------------------
export function newGrooves() {
  const g = [];
  for (let i = 0; i < MAX_GROOVES; i++) {
    const steps = new Array(STEPS).fill(6);
    if (i === 1) for (let s = 0; s < STEPS; s++) steps[s] = s % 2 ? 8 : 4; // swing
    if (i === 2) for (let s = 0; s < STEPS; s++) steps[s] = 3; // double-time
    g.push({ steps });
  }
  return g;
}

export const SCALES = [
  { name: 'CHROMATIC', notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { name: 'MAJOR', notes: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'MINOR', notes: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'DORIAN', notes: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'MIXOLYDIAN', notes: [0, 2, 4, 5, 7, 9, 10] },
  { name: 'PENTA MAJ', notes: [0, 2, 4, 7, 9] },
  { name: 'PENTA MIN', notes: [0, 3, 5, 7, 10] },
  { name: 'BLUES', notes: [0, 3, 5, 6, 7, 10] },
];

// ---- song ---------------------------------------------------------------
export function newSong(name = 'NEW SONG') {
  const rows = [];
  for (let i = 0; i < 8; i++) rows.push({ ch: new Array(TRACKS).fill(EMPTY) });
  return {
    name,
    tempo: 140,
    transpose: 0,
    scale: 1,
    rows,
  };
}

export function newProject(name = 'NEW SONG') {
  return {
    v: 1,
    song: newSong(name),
    chains: {}, // num -> chain
    phrases: {}, // num -> phrase
    instruments: {}, // num -> instrument
    grooves: newGrooves(),
    mixer: newMixer(),
  };
}

// ---- helpers --------------------------------------------------------------
export function getChain(prj, n, create = false) {
  let c = prj.chains[n];
  if (!c && create) {
    c = newChain();
    prj.chains[n] = c;
  }
  return c || null;
}

export function getPhrase(prj, n, create = false) {
  let p = prj.phrases[n];
  if (!p && create) {
    p = newPhrase();
    prj.phrases[n] = p;
  }
  return p || null;
}

export function getInstrument(prj, n, create = false) {
  let ins = prj.instruments[n];
  if (!ins && create) {
    ins = newInstrument();
    prj.instruments[n] = ins;
  }
  return ins || null;
}

export function nextFree(map, max) {
  for (let i = 0; i < max; i++) if (!map[i]) return i;
  return -1;
}

export function deepClone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function isPhraseEmpty(ph) {
  if (!ph) return true;
  return ph.rows.every(
    (r) => r.n === EMPTY && r.i === EMPTY && r.fx.every((f) => !f.c)
  );
}

export function isChainEmpty(ch) {
  if (!ch) return true;
  return ch.ph.every((p) => p === EMPTY);
}

// Count references (for the "*" used-elsewhere marker)
export function phraseUseCount(prj, num, skipChain = -1, skipRow = -1) {
  let n = 0;
  for (const [cn, ch] of Object.entries(prj.chains)) {
    ch.ph.forEach((p, r) => {
      if (p === num && !(Number(cn) === skipChain && r === skipRow)) n++;
    });
  }
  return n;
}

export function chainUseCount(prj, num, skipRow = -1, skipTrack = -1) {
  let n = 0;
  prj.song.rows.forEach((row, r) => {
    row.ch.forEach((c, t) => {
      if (c === num && !(r === skipRow && t === skipTrack)) n++;
    });
  });
  return n;
}

// ---- (de)serialization ------------------------------------------------------
export function serialize(prj) {
  return JSON.stringify(prj);
}

export function deserialize(json) {
  const prj = JSON.parse(json);
  if (!prj || prj.v !== 1 || !prj.song) throw new Error('not a virtual-M8 song');
  // fill in anything missing so old saves keep loading
  prj.chains = prj.chains || {};
  prj.phrases = prj.phrases || {};
  prj.instruments = prj.instruments || {};
  prj.grooves = prj.grooves || newGrooves();
  prj.mixer = prj.mixer || newMixer();
  return prj;
}
