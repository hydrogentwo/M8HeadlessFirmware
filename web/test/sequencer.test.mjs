// Sequencer tests: drive VirtualAudio ticks with a mocked worklet port.
import { VirtualAudio } from '../js/virtual/audio-engine.js';
import { installAudioExtras } from '../js/virtual/audio-extras.js';
import { newProject, getChain, getPhrase, getInstrument, EMPTY } from '../js/virtual/song.js';

installAudioExtras(VirtualAudio);

function mockAudio() {
  const a = new VirtualAudio();
  const events = [];
  a.ctx = { currentTime: 0, sampleRate: 44100 };
  a.node = { port: { postMessage: (m) => events.push({ ...m }) } };
  a._post = (m) => events.push({ ...m });
  a.prj = newProject('TEST');
  a.events = events;
  return a;
}

// build: song row0 track0 -> chain0; chain0[0] -> phrase0; phrase0 step0 = C4 inst0
function buildSong(a) {
  const prj = a.prj;
  prj.song.rows[0].ch[0] = 0;
  const ch = getChain(prj, 0, true);
  ch.ph[0] = 0;
  const ph = getPhrase(prj, 0, true);
  ph.rows[0].n = 60;
  ph.rows[0].i = 0;
  ph.rows[0].v = 200;
  getInstrument(prj, 0, true);
}

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

// test 1: song triggers note with correct pitch
{
  const a = mockAudio();
  buildSong(a);
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a._tickTrack(0, 1.0, 0.02);
  const note = a.events.find((e) => e.t === 'note');
  ok('song triggers note event', !!note);
  ok('note freq is C4 (~261.6)', note && Math.abs(note.s.freq - 261.63) < 1);
  ok('note wtype is saw (1)', note && note.s.wtype === 1);
  ok('playhead at song row 0 step 0', a.playT[0].songRow === 0 && a.playT[0].phraseStep === 0);
}

// test 2: groove ticks respected (groove 0 step 0 = 6)
{
  const a = mockAudio();
  buildSong(a);
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a.prj.grooves[0].steps[0] = 6;
  a._tickTrack(0, 1.0, 0.02);
  ok('groove ticks loaded (6)', tr.ticksLeft === 6);
}

// test 3: VOL/PIT/CUT FX
{
  const a = mockAudio();
  buildSong(a);
  a.prj.song.tempo = 120;
  const ph = getPhrase(a.prj, 0);
  ph.rows[0].fx[0] = { c: 'VOL', v: 128 };
  ph.rows[0].fx[1] = { c: 'PIT', v: 128 + 12 };
  ph.rows[0].fx[2] = { c: 'TPO', v: 280 - 0 }; // sets tempo 140
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a._tickTrack(0, 1.0, 0.02);
  const note = a.events.find((e) => e.t === 'note');
  ok('PIT+12 -> C5', note && Math.abs(note.s.freq - 523.25) < 2);
  ok('TPO sets tempo 140', a.prj.song.tempo === 140);
}

// test 4: CUT held FX persists to next row
{
  const a = mockAudio();
  buildSong(a);
  const ph = getPhrase(a.prj, 0);
  ph.rows[0].fx[0] = { c: 'CUT', v: 64 };
  ph.rows[1].n = 62;
  ph.rows[1].i = 0;
  ph.rows[1].v = 200;
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a.prj.grooves[0].steps.fill(1);
  a._tickTrack(0, 1.0, 0.02); // step 0
  a.events.length = 0;
  a._tickTrack(0, 1.02, 0.02); // step 1
  const note = a.events.find((e) => e.t === 'note');
  const expectCut = 40 * Math.pow(450, 64 / 255);
  ok('held CUT applies to next row', note && Math.abs(note.s.cut - expectCut) < 1);
}

// test 5: NOTE_OFF releases
{
  const a = mockAudio();
  buildSong(a);
  const ph = getPhrase(a.prj, 0);
  ph.rows[1].n = 128;
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a.prj.grooves[0].steps.fill(1);
  a._tickTrack(0, 1.0, 0.02);
  a.events.length = 0;
  a._tickTrack(0, 1.02, 0.02);
  ok('OFF posts off event', a.events.some((e) => e.t === 'off' && e.v === 0));
}

// test 6: phrase transport loops 16 steps
{
  const a = mockAudio();
  buildSong(a);
  a.mode = 'phrase';
  a._soloPhrase = 0;
  const tr = a._tracks[0];
  tr.active = true;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a.prj.grooves[0].steps.fill(1);
  const steps = [];
  for (let i = 0; i < 18; i++) {
    a._tickTrack(0, 1 + i * 0.02, 0.02);
    steps.push(a.playT[0].phraseStep);
  }
  ok('phrase loops 0..15,0,1', steps.slice(0, 18).join(',') === '0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1');
}

// test 7: table transpose applies live via param events
{
  const a = mockAudio();
  buildSong(a);
  const ins = getInstrument(a.prj, 0);
  ins.table.tic = 1;
  ins.table.rows[0].n = 12; // +12 semitones
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a.prj.grooves[0].steps.fill(4);
  a._tickTrack(0, 1.0, 0.02); // trigger step 0, table launches
  a.events.length = 0;
  a._tickTrack(0, 1.02, 0.02); // table tick 1 -> freq param
  const fp = a.events.find((e) => e.t === 'param' && e.id === 'freq');
  ok('table posts live freq param', !!fp);
  ok('table +12 -> C5', fp && Math.abs(fp.val - 523.25) < 2);
}

// test 8: DEL defers the row
{
  const a = mockAudio();
  buildSong(a);
  const ph = getPhrase(a.prj, 0);
  ph.rows[0].fx[0] = { c: 'DEL', v: 3 };
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a.prj.grooves[0].steps.fill(8);
  a._tickTrack(0, 1.0, 0.02);
  ok('DEL: no note on trigger tick', !a.events.some((e) => e.t === 'note'));
  a._tickTrack(0, 1.02, 0.02);
  a._tickTrack(0, 1.04, 0.02);
  a._tickTrack(0, 1.06, 0.02);
  ok('DEL: note fires 3 ticks later', a.events.some((e) => e.t === 'note'));
}

// test 9: RET retriggers
{
  const a = mockAudio();
  buildSong(a);
  const ph = getPhrase(a.prj, 0);
  ph.rows[0].fx[0] = { c: 'RET', v: 0x22 }; // every 2 ticks, 2 times
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a.prj.grooves[0].steps.fill(8);
  a._tickTrack(0, 1.0, 0.02);
  for (let i = 1; i <= 5; i++) a._tickTrack(0, 1 + i * 0.02, 0.02);
  const notes = a.events.filter((e) => e.t === 'note');
  ok('RET22 -> 3 notes total', notes.length === 3);
}

// test 10: chain transport uses solo chain
{
  const a = mockAudio();
  buildSong(a);
  a.mode = 'chain';
  a._soloChain = 0;
  a._soloTrack = 0;
  const tr = a._tracks[0];
  tr.active = true;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a._tickTrack(0, 1.0, 0.02);
  ok('chain mode triggers note', a.events.some((e) => e.t === 'note'));
  ok('playhead chain 0 step 0', a.playT[0].chain === 0 && a.playT[0].phraseStep === 0);
}

// test 11: empty song rows are skipped (track keeps time)
{
  const a = mockAudio();
  const prj = a.prj;
  prj.song.rows[2].ch[0] = 0; // only row 2 has a chain
  const ch = getChain(prj, 0, true);
  ch.ph[0] = 0;
  const ph = getPhrase(prj, 0, true);
  ph.rows[0].n = 60;
  ph.rows[0].i = 0;
  ph.rows[0].v = 200;
  getInstrument(prj, 0, true);
  a.mode = 'song';
  const tr = a._tracks[0];
  tr.active = true;
  tr.songRow = 0;
  tr.chainStep = 0;
  tr.phraseStep = -1;
  tr.ticksLeft = 0;
  a._tickTrack(0, 1.0, 0.02);
  ok('empty rows skipped to row 2', a.playT[0].songRow === 2);
  ok('note still triggers', a.events.some((e) => e.t === 'note'));
}

// test 12: WAV encode produces valid header
{
  const a = mockAudio();
  const chunks = [{ L: new Float32Array(100), R: new Float32Array(100) }];
  chunks[0].L[0] = 0.5;
  const blob = a._encodeWav(chunks, 44100);
  const ab = await blob.arrayBuffer();
  const v = new DataView(ab);
  const tag = String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3));
  ok('WAV header RIFF', tag === 'RIFF');
  ok('WAV size matches', ab.byteLength === 44 + 100 * 4);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
