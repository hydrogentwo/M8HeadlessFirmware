// Full-stack smoke test: engine + storage + demo + mocked audio,
// SLIP output parsed by the STOCK frontend Parser with a stub renderer.
import { VirtualTeensy, KEY } from '../js/virtual/engine.js';
import { VirtualSD } from '../js/virtual/sdcard.js';
import { VirtualConnection } from '../js/virtual/connection.js';
import { Parser } from '../js/parser.js';

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

function mockAudio() {
  return {
    calls: [],
    async ensure() {},
    isWasm() { return true; },
    setProject(prj) { this.prj = prj; this.calls.push('setProject'); },
    setSample() {},
    removeSample() {},
    async decodeUpload() { throw new Error('no files in test'); },
    playSong(row) { this.calls.push('playSong:' + row); },
    playChain() { this.calls.push('playChain'); },
    playPhrase() { this.calls.push('playPhrase'); },
    stop() { this.calls.push('stop'); },
    previewNote() {},
    previewOff() {},
    previewSample() {},
    setTrackState() {},
    getPlayheads() { return []; },
    getTrackGrooves() { return [0, 0, 0, 0, 0, 0, 0, 0]; },
    getActiveInst() { return new Set(); },
    getVoiceCount() { return 0; },
    pushMix() {},
    onScope: null,
    onLevels: null,
  };
}

// stub renderer implementing the stock Renderer interface
function stubRenderer() {
  return {
    rects: 0, texts: 0, waves: 0, fonts: [],
    drawRect() { this.rects++; },
    drawText() { this.texts++; },
    drawWave() { this.waves++; },
    setFont(f) { this.fonts.push(f); },
    clear() {},
  };
}

const engine = new VirtualTeensy({ onDownload: () => {}, onRequestUpload: () => {} });
const audio = mockAudio();
engine.attachAudio(audio);
engine.attachStorage(new VirtualSD());
const conn = new VirtualConnection(engine);
const frames = [];
conn.onData = (b) => frames.push(...b);

await conn.connect();
engine._splashUntil = 0;
engine.redraw();

ok('boots with demo song', engine.prj && engine.prj.song.name === 'DEMO SONG');
ok('demo kit seeded to storage', (await engine.storage.listSamples()).length === 3);
ok('audio got project', audio.prj === engine.prj);

// drive PLAY through the connection bitmask path
conn.sendKeys(KEY.STA);
conn.sendKeys(0);
ok('play starts transport', engine.transport.playing === true);
ok('audio.playSong called', audio.calls.some((c) => c.startsWith('playSong')));

// navigate views via Shift+arrows bitmask
conn.sendKeys(KEY.SEL | KEY.RIGHT);
conn.sendKeys(0);
ok('SEL+RIGHT leaves SONG view', engine.view !== 'SONG');

// stop
conn.sendKeys(KEY.STA);
conn.sendKeys(0);
ok('second play press stops', engine.transport.playing === false);

// persistence round-trip (memory fallback in Node)
await engine.storage.saveSong('TEST1', JSON.stringify({ hello: 1 }));
const songs = await engine.storage.listSongs();
ok('song saved + listed', songs.some((s) => s.name === 'TEST1'));
const rec = await engine.storage.getSong('TEST1');
ok('song retrieved', rec && rec.data === JSON.stringify({ hello: 1 }));
await engine.storage.saveSettings({ themeKey: 'X' });
ok('settings round-trip', (await engine.storage.getSettings()).themeKey === 'X');
const st = await engine.storage.stats();
ok('stats shape', st && typeof st.songs === 'number' && typeof st.mb === 'string');

// SLIP output parses cleanly through the STOCK frontend Parser
const stub = stubRenderer();
const parser = new Parser(stub);
const errors = [];
const origLog = console.log;
console.log = (...a) => {
  const s = a.join(' ');
  if (/Bad|BAD|Unexpected|recovered/.test(s)) errors.push(s);
};
parser.process(Uint8Array.from(frames));
console.log = origLog;
ok('SLIP frames emitted', frames.length > 1000);
ok('no parser errors', errors.length === 0);
ok('rects drawn', stub.rects > 0);
ok('text cells drawn', stub.texts > 100);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
