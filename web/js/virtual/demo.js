// M8 Virtual Teensy - demo song + synthesized drum kit
// =======================================================
// First-boot content: a 2-row loop (drums/bass/lead/arp/pad) and a
// tiny synthesized sample kit so the sampler demo works offline.

import {
  EMPTY, newProject, getChain, getPhrase, getInstrument, defaultParams,
} from './song.js';

function setRow(ph, step, n, inst, vel = 200, fx = null) {
  ph.rows[step].n = n;
  ph.rows[step].i = inst;
  ph.rows[step].v = vel;
  if (fx) {
    fx.forEach((f, i) => {
      if (i < 3 && f) ph.rows[step].fx[i] = { c: f[0], v: f[1] };
    });
  }
}

function setInst(prj, n, type, name, params) {
  const ins = getInstrument(prj, n, true);
  ins.type = type;
  ins.name = name;
  ins.p = defaultParams(type);
  Object.assign(ins.p, params);
  return ins;
}

export function buildDemoSong() {
  const prj = newProject('DEMO SONG');
  prj.song.tempo = 132;

  // ---- instruments ----
  setInst(prj, 0, 'SMP', 'KICK', { SMP: 0, VOL: 230, ATT: 2, REL: 30 });
  setInst(prj, 1, 'SMP', 'HAT', { SMP: 1, VOL: 150, ATT: 2, REL: 20 });
  setInst(prj, 2, 'SMP', 'SNARE', { SMP: 2, VOL: 210, ATT: 2, REL: 40 });
  setInst(prj, 3, 'WAV', 'BASS', {
    SHP: 0, PIT: 0, CUT: 90, RES: 40, VOL: 205,
    ATT: 3, DEC: 40, SUS: 200, REL: 30,
  });
  setInst(prj, 4, 'HYP', 'LEAD', {
    SHP: 2, DET: 25, SUB: 60, CUT: 200, RES: 20, VOL: 180,
    ATT: 8, DEC: 60, SUS: 220, REL: 60, DEL: 70, REV: 60,
  });
  setInst(prj, 5, 'WAV', 'ARP', {
    SHP: 1, CUT: 170, RES: 30, VOL: 150,
    ATT: 2, DEC: 55, SUS: 0, REL: 40, DEL: 95, REV: 40,
  });
  setInst(prj, 6, 'FM', 'PAD', {
    RAT: 2, IDX: 90, FB: 20, CUT: 160, VOL: 120,
    ATT: 70, DEC: 80, SUS: 255, REL: 130, REV: 95,
  });

  // ---- phrases ----
  const drumsA = getPhrase(prj, 0, true);
  drumsA.name = 'DRUMS A';
  for (const s of [0, 4, 8, 12]) setRow(drumsA, s, 60, 0, 230);
  for (const s of [4, 12]) setRow(drumsA, s, 60, 2, 215); // snare over kick? no: separate steps below
  // (kick at 4/12 replaced by snare above; re-add kick layer via phrase B variation instead)
  for (const s of [2, 6, 10, 14]) setRow(drumsA, s, 60, 1, 140);
  setRow(drumsA, 0, 60, 0, 240);
  setRow(drumsA, 4, 60, 2, 220);
  setRow(drumsA, 8, 60, 0, 230);
  setRow(drumsA, 12, 60, 2, 220);

  const drumsB = getPhrase(prj, 1, true);
  drumsB.name = 'DRUMS B';
  for (const s of [0, 4, 8, 12, 14]) setRow(drumsB, s, 60, 0, s === 14 ? 180 : 235);
  setRow(drumsB, 4, 60, 2, 220);
  setRow(drumsB, 12, 60, 2, 220);
  for (let s = 0; s < 16; s += 2) {
    if (drumsB.rows[s].n === EMPTY) setRow(drumsB, s, 60, 1, 120);
  }
  setRow(drumsB, 15, 60, 1, 160); // extra hat push

  const bassA = getPhrase(prj, 2, true);
  bassA.name = 'BASS A';
  [33, 33, 36, 33, 31, 31, 35, 31].forEach((n, i) => setRow(bassA, i * 2, n, 3, 220));

  const bassB = getPhrase(prj, 3, true);
  bassB.name = 'BASS B';
  [29, 29, 33, 29, 31, 31, 31, 35].forEach((n, i) => setRow(bassB, i * 2, n, 3, 220));

  const leadA = getPhrase(prj, 4, true);
  leadA.name = 'LEAD A';
  [69, 72, 76, 81, 79, 76, 72, 74].forEach((n, i) => setRow(leadA, i * 2, n, 4, 200));

  const leadB = getPhrase(prj, 5, true);
  leadB.name = 'LEAD B';
  [77, 76, 74, 72, 74, 76, 79, 76].forEach((n, i) => setRow(leadB, i * 2, n, 4, 200));

  const arp = getPhrase(prj, 6, true);
  arp.name = 'ARP 16';
  [57, 60, 64, 69, 72, 76, 81, 76, 72, 69, 64, 60, 57, 60, 64, 69]
    .forEach((n, i) => setRow(arp, i, n, 5, i % 4 === 0 ? 175 : 145));

  const padA = getPhrase(prj, 7, true);
  padA.name = 'PAD A';
  setRow(padA, 0, 45, 6, 190);
  setRow(padA, 8, 41, 6, 190);

  const padB = getPhrase(prj, 8, true);
  padB.name = 'PAD B';
  setRow(padB, 0, 43, 6, 190);
  setRow(padB, 8, 45, 6, 190);

  // ---- chains ----
  const chDrums = getChain(prj, 0, true);
  chDrums.name = 'DRUMS';
  chDrums.ph[0] = 0;
  chDrums.ph[1] = 1;
  const chBass = getChain(prj, 1, true);
  chBass.name = 'BASS';
  chBass.ph[0] = 2;
  chBass.ph[1] = 3;
  const chLead = getChain(prj, 2, true);
  chLead.name = 'LEAD';
  chLead.ph[0] = 4;
  chLead.ph[1] = 5;
  const chArp = getChain(prj, 3, true);
  chArp.name = 'ARP';
  chArp.ph[0] = 6;
  chArp.ph[1] = 6;
  const chPad = getChain(prj, 4, true);
  chPad.name = 'PAD';
  chPad.ph[0] = 7;
  chPad.ph[1] = 8;

  // ---- song: 2 rows, 5 tracks ----
  prj.song.rows[0].ch[0] = 0;
  prj.song.rows[0].ch[1] = 1;
  prj.song.rows[0].ch[2] = 2;
  prj.song.rows[0].ch[3] = 3;
  prj.song.rows[0].ch[4] = 4;
  prj.song.rows[1].ch = [0, 1, 2, 3, 4, EMPTY, EMPTY, EMPTY];

  // ---- mixer ----
  const mx = prj.mixer;
  mx.master = 220;
  mx.tracks[0].vol = 220;
  mx.tracks[1].vol = 200;
  mx.tracks[2].vol = 180;
  mx.tracks[2].pan = 140;
  mx.tracks[2].del = 40;
  mx.tracks[2].rev = 50;
  mx.tracks[3].vol = 150;
  mx.tracks[3].pan = 100;
  mx.tracks[3].del = 60;
  mx.tracks[3].rev = 30;
  mx.tracks[4].vol = 120;
  mx.tracks[4].rev = 70;
  mx.delay.time = 90;
  mx.delay.fb = 90;
  mx.delay.damp = 100;
  mx.delay.mix = 200;
  mx.reverb.size = 180;
  mx.reverb.decay = 160;
  mx.reverb.damp = 120;
  mx.reverb.mix = 160;
  mx.chorus.type = 0;
  mx.chorus.rate = 60;
  mx.chorus.depth = 80;
  mx.chorus.mix = 0;

  return prj;
}

// ---- synthesized drum kit (mono 44100) ----
const KIT_SR = 44100;

function makeKick() {
  const len = Math.floor(KIT_SR * 0.35);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / KIT_SR;
    const f = 45 + 115 * Math.exp(-t * 28);
    phase += (2 * Math.PI * f) / KIT_SR;
    const amp = Math.exp(-t * 11);
    const click = i < 220 ? (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.6 : 0;
    out[i] = Math.sin(phase) * amp * 0.95 + click;
  }
  return out;
}

function makeHat() {
  const len = Math.floor(KIT_SR * 0.09);
  const out = new Float32Array(len);
  let prev = 0;
  for (let i = 0; i < len; i++) {
    const t = i / KIT_SR;
    const n = Math.random() * 2 - 1;
    const hp = n - prev; // crude highpass
    prev = n;
    out[i] = hp * Math.exp(-t * 90) * 0.5;
  }
  return out;
}

function makeSnare() {
  const len = Math.floor(KIT_SR * 0.22);
  const out = new Float32Array(len);
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / KIT_SR;
    phase += (2 * Math.PI * 190) / KIT_SR;
    const tone = Math.sin(phase) * Math.exp(-t * 30) * 0.6;
    const noise = (Math.random() * 2 - 1) * Math.exp(-t * 26) * 0.5;
    out[i] = tone + noise;
  }
  return out;
}

export function buildDemoKit() {
  return new Map([
    [0, { name: 'KICK', sr: KIT_SR, ch0: makeKick(), ch1: null }],
    [1, { name: 'HAT', sr: KIT_SR, ch0: makeHat(), ch1: null }],
    [2, { name: 'SNARE', sr: KIT_SR, ch0: makeSnare(), ch1: null }],
  ]);
}
