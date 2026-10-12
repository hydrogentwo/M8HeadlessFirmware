// M8 Virtual Teensy - FX (effect command) definitions
// =====================================================
// Subset of the classic tracker FX vocabulary, tuned to what the
// virtual audio engine implements. Each command: 3-letter code +
// 1-byte value.
//
// Kinds:
//   seq  - sequencer / transport control
//   note - per-note performance (pitch, volume, timing)
//   inst - instrument parameter offsets (held until changed)
//   mix  - mixer / send offsets

export const FX = {
  // -- sequencer --
  TPO: { kind: 'seq', label: 'TEMPO', help: 'SET SONG TEMPO 20-250BPM. VAL=HALF BPM (E.G. 8C=140)' },
  GRV: { kind: 'seq', label: 'GROOVE', help: 'SET TRACK GROOVE 00-0F. HELD UNTIL CHANGED' },
  HOP: { kind: 'seq', label: 'HOP', help: 'HOP TO ROW Y OF NEXT PHRASE. HOPFF STOPS TRACK' },
  KIL: { kind: 'seq', label: 'KILL', help: 'STOP INSTRUMENT AFTER XX TICKS. KIL00 STOPS NOW' },
  DEL: { kind: 'seq', label: 'DELAY', help: 'DELAY THIS ROW BY XX TICKS' },
  RET: { kind: 'seq', label: 'RETRIG', help: 'RETRIGGER NOTE EVERY X TICKS, Y TIMES. XY NYBBLES' },
  NTH: { kind: 'seq', label: 'EVERY NTH', help: 'PLAY ROW EVERY XTH LOOP, STARTING AT Y. XY NYBBLES' },
  TBL: { kind: 'seq', label: 'TABLE', help: 'SWITCH TO TABLE OF INSTRUMENT XX FOR THIS NOTE' },
  TIC: { kind: 'seq', label: 'TAB TIC', help: 'SET TABLE SPEED XX TICKS PER STEP' },
  // -- note performance --
  VOL: { kind: 'note', label: 'VOLUME', help: 'SET NOTE VOLUME 00-FF' },
  PIT: { kind: 'note', label: 'PITCH', help: 'PITCH OFFSET IN SEMITONES. 80=CENTER (+/-64)' },
  PAN: { kind: 'note', label: 'PAN', help: 'PAN 00=LEFT FF=RIGHT 80=CENTER' },
  PSL: { kind: 'note', label: 'P SLIDE', help: 'PORTAMENTO TO NOTE OVER XX TICKS' },
  VIB: { kind: 'note', label: 'VIBRATO', help: 'VIBRATO DEPTH. X=RATE(0-F) Y=DEPTH(0-F)' },
  ARP: { kind: 'note', label: 'ARP', help: 'ARPEGGIATE +X THEN +Y SEMITONES EACH TICK' },
  TUN: { kind: 'note', label: 'TUNE', help: 'FINE TUNE IN CENTS. 80=CENTER (+/-64)' },
  // -- instrument --
  INS: { kind: 'inst', label: 'INSTR', help: 'OVERRIDE INSTRUMENT NUMBER FOR THIS ROW' },
  CUT: { kind: 'inst', label: 'CUTOFF', help: 'FILTER CUTOFF 00-FF' },
  RES: { kind: 'inst', label: 'RESO', help: 'FILTER RESONANCE 00-FF' },
  SHP: { kind: 'inst', label: 'SHAPE', help: 'OSC SHAPE/MODEL SELECT 00-07' },
  // -- mixer / sends --
  CHO: { kind: 'mix', label: 'CHORUS', help: 'CHORUS SEND 00-FF' },
  DLY: { kind: 'mix', label: 'DELAY', help: 'DELAY SEND 00-FF' },
  REV: { kind: 'mix', label: 'REVERB', help: 'REVERB SEND 00-FF' },
  MVO: { kind: 'mix', label: 'TRK VOL', help: 'TRACK VOLUME 00-FF' },
};

export const FX_ORDER = [
  'TPO', 'GRV', 'HOP', 'KIL', 'DEL', 'RET', 'NTH', 'TBL', 'TIC',
  'VOL', 'PIT', 'PAN', 'PSL', 'VIB', 'ARP', 'TUN',
  'INS', 'CUT', 'RES', 'SHP',
  'CHO', 'DLY', 'REV', 'MVO',
];

export function fxLabel(cmd) {
  const f = FX[cmd];
  return f ? f.label : '???';
}

export function fxHelp(cmd) {
  const f = FX[cmd];
  return f ? f.help : 'UNKNOWN COMMAND';
}

export function isFx(cmd) {
  return !!FX[cmd];
}

// Value display hint for the status line, e.g. "TICKS", "00-FF"
export function fxValueHint(cmd, v) {
  switch (cmd) {
    case 'TPO':
      return Math.round(v / 2) + 'BPM';
    case 'HOP':
      return v === 0xff ? 'STOP' : 'ROW ' + (v & 0x0f).toString(16).toUpperCase();
    case 'NTH':
      return `1/${(v >> 4) || 1}`;
    case 'RET':
      return `T${(v >> 4).toString(16).toUpperCase()}X${(v & 15).toString(16).toUpperCase()}`;
    case 'PIT':
      return (v - 128 >= 0 ? '+' : '') + (v - 128);
    case 'TUN':
      return (v - 128 >= 0 ? '+' : '') + (v - 128) + 'CT';
    default:
      return null;
  }
}
