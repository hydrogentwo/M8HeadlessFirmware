// Demo song test: boots the demo, plays 2 rows, checks every track sounds.
import { VirtualAudio } from '../js/virtual/audio-engine.js';
import { installAudioExtras } from '../js/virtual/audio-extras.js';
import { buildDemoSong, buildDemoKit } from '../js/virtual/demo.js';
import { getInstrument, EMPTY } from '../js/virtual/song.js';

installAudioExtras(VirtualAudio);

const a = new VirtualAudio();
const events = [];
a.ctx = { currentTime: 0, sampleRate: 44100 };
a.node = { port: { postMessage: () => {} } };
a._post = (m) => events.push({ ...m });
const prj = buildDemoSong();
a.prj = prj;
const kit = buildDemoKit();

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log('  ok - ' + name);
  } else {
    fail++;
    console.log('  FAIL - ' + name);
  }
}

// instrument params referenced by demo exist in type defs
{
  let bad = [];
  const { INSTRUMENT_TYPES } = await import('../js/virtual/song.js');
  for (const [n, ins] of Object.entries(prj.instruments)) {
    const def = INSTRUMENT_TYPES[ins.type];
    if (!def) {
      bad.push(n + ':type');
      continue;
    }
    for (const k of Object.keys(ins.p)) {
      if (!def.params.some((p) => p.id === k)) bad.push(n + ':' + k);
    }
  }
  ok('all demo instrument params valid', bad.length === 0);
}

// every SMP instrument in the demo resolves to a kit sample
{
  let bad = [];
  for (const [n, ins] of Object.entries(prj.instruments)) {
    if (ins.type === 'SMP' && !kit.has(ins.p.SMP)) bad.push(n);
  }
  ok('all demo SMP slots in kit', bad.length === 0);
}

// play the whole song start to finish (bounded ticks)
{
  a.mode = 'song';
  for (let t = 0; t < 8; t++) {
    const tr = a._tracks[t];
    tr.active = true;
    tr.songRow = 0;
    tr.chainStep = 0;
    tr.phraseStep = -1;
    tr.ticksLeft = 0;
  }
  let time = 1.0;
  const tickLen = 60 / prj.song.tempo / 24;
  for (let i = 0; i < 4000 && time < 100; i++) {
    a._processTick(time, tickLen);
    time += tickLen;
  }
  const notes = events.filter((e) => e.t === 'note');
  const byTrack = new Set(notes.map((e) => e.v));
  ok('notes triggered', notes.length > 50);
  ok('tracks 0-4 all sound', [0, 1, 2, 3, 4].every((t) => byTrack.has(t)));
  ok('tracks 5-7 silent', ![5, 6, 7].some((t) => byTrack.has(t)));
  ok('sample notes used', notes.some((e) => e.s.kind === 'sample'));
  ok('synth notes used', notes.some((e) => e.s.kind === 'synth'));
  const badFreq = notes.filter((e) => e.s.kind === 'synth' && !(e.s.freq > 1 && e.s.freq < 20000));
  ok('all synth freqs finite/audible', badFreq.length === 0);
  const badRate = notes.filter((e) => e.s.kind === 'sample' && !(e.s.rate > 0.05 && e.s.rate < 32));
  ok('all sample rates sane', badRate.length === 0);
  // song loops: after enough ticks we're back at row 0/1 with active tracks
  ok('tracks still active (looping)', [0, 1, 2, 3, 4].every((t) => a._tracks[t].active));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
