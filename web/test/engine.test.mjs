// Engine tests: navigation, editing, selection, protocol round-trip.
// Run: node test/engine.test.mjs
import { strict as assert } from 'node:assert';
import { VirtualTeensy, KEY } from '../js/virtual/engine.js';
import { Parser } from '../js/parser.js';

function makeEngine() {
  const captured = [];
  const engine = new VirtualTeensy({ onData: (b) => captured.push(...b) });
  return { engine, captured };
}

function press(e, ...states) {
  // press sequence ending with release, e.g. press(e, KEY.RIGHT)
  let st = 0;
  for (const s of states) {
    st |= s;
    e.sendKeys(st);
  }
  e.sendKeys(0);
}

function row0(e) {
  return e.snapshotText()[0];
}

// ---- boot + SONG view ----
{
  const { engine } = makeEngine();
  await engine.enable();
  engine._splashUntil = 0;
  const rows = engine.snapshotText();
  assert.ok(rows[0].startsWith('SONG'), 'header shows SONG: ' + rows[0]);
  assert.ok(rows[23].includes('SHF+ARW'), 'footer hints: ' + rows[23]);
  assert.ok(rows[1].includes('ROW'), 'track header row');
  console.log('ok - boot + SONG view');
}

// ---- view navigation ----
{
  const { engine } = makeEngine();
  await engine.enable();
  engine._splashUntil = 0;
  assert.equal(engine.view, 'SONG');
  // SEL+RIGHT -> CHAIN
  engine.sendKeys(KEY.SEL);
  engine.sendKeys(KEY.SEL | KEY.RIGHT);
  engine.sendKeys(0);
  assert.equal(engine.view, 'CHAIN');
  assert.ok(row0(engine).startsWith('CHAIN'), row0(engine));
  // SEL+RIGHT -> PHRASE
  engine.sendKeys(KEY.SEL);
  engine.sendKeys(KEY.SEL | KEY.RIGHT);
  engine.sendKeys(0);
  assert.equal(engine.view, 'PHRASE');
  // SEL+DOWN -> SYSTEM (map: PHRASE(2,1) -> SYSTEM(2,2))
  engine.sendKeys(KEY.SEL);
  engine.sendKeys(KEY.SEL | KEY.DOWN);
  engine.sendKeys(0);
  assert.equal(engine.view, 'SYSTEM');
  assert.ok(row0(engine).startsWith('SYSTEM'));
  // SEL+UP -> PHRASE, SEL+LEFT -> CHAIN
  engine.sendKeys(KEY.SEL);
  engine.sendKeys(KEY.SEL | KEY.UP);
  engine.sendKeys(0);
  assert.equal(engine.view, 'PHRASE');
  console.log('ok - view navigation');
}

// ---- song editing ----
{
  const { engine } = makeEngine();
  await engine.enable();
  engine._splashUntil = 0;
  // cursor to track 1 row 0, EDIT tap inserts last chain (00)
  press(engine, KEY.EDIT);
  assert.equal(engine.prj.song.rows[0].ch[0], 0);
  // EDIT+RIGHT increments
  engine.sendKeys(KEY.EDIT);
  engine.sendKeys(KEY.EDIT | KEY.RIGHT);
  engine.sendKeys(KEY.EDIT);
  engine.sendKeys(0);
  assert.equal(engine.prj.song.rows[0].ch[0], 1);
  // EDIT tap on filled cell -> goto CHAIN
  press(engine, KEY.EDIT);
  assert.equal(engine.view, 'CHAIN');
  assert.equal(engine.chain, 1);
  console.log('ok - song editing + drill-down');
}

// ---- phrase note + FX editing ----
{
  const { engine } = makeEngine();
  await engine.enable();
  engine._splashUntil = 0;
  engine._goto('PHRASE');
  engine.phrase = 0;
  // EDIT+RIGHT on note col inserts C-3 (48) then +1 -> C#3 (49)
  engine.sendKeys(KEY.EDIT);
  engine.sendKeys(KEY.EDIT | KEY.RIGHT);
  engine.sendKeys(0);
  const r = engine.prj.phrases[0].rows[0];
  assert.equal(r.n, 49, 'note should be C#3, got ' + r.n);
  const rows = engine.snapshotText();
  assert.ok(rows[2].includes('C#3'), 'grid shows C#3: ' + rows[2]);
  // move to FX1 cmd col (col 3) and open HELP via EDIT+UP
  press(engine, KEY.RIGHT);
  press(engine, KEY.RIGHT);
  press(engine, KEY.RIGHT);
  assert.equal(engine.cur.phrase.col, 3);
  engine.sendKeys(KEY.EDIT);
  engine.sendKeys(KEY.EDIT | KEY.UP);
  engine.sendKeys(0);
  assert.equal(engine.view, 'HELP', 'EDIT+UP on FX opens help');
  assert.ok(row0(engine).startsWith('FX HELP'));
  // EDIT inserts selected cmd (TPO, idx 0) and returns
  press(engine, KEY.EDIT);
  assert.equal(engine.view, 'PHRASE');
  assert.equal(engine.prj.phrases[0].rows[0].fx[0].c, 'TPO');
  console.log('ok - phrase note + FX help insert');
}

// ---- keyjazz note entry ----
{
  const { engine } = makeEngine();
  await engine.enable();
  engine._splashUntil = 0;
  engine._goto('PHRASE');
  engine.cur.phrase.col = 0;
  engine.cur.phrase.row = 5;
  engine.noteOn(60, 100);
  const r = engine.prj.phrases[0].rows[5];
  assert.equal(r.n, 60);
  assert.equal(r.v, 100);
  assert.equal(engine.cur.phrase.row, 6, 'cursor advances');
  console.log('ok - keyjazz entry');
}

// ---- selection copy/paste ----
{
  const { engine } = makeEngine();
  await engine.enable();
  engine._splashUntil = 0;
  engine._goto('PHRASE');
  engine.cur.phrase.col = 0;
  engine.cur.phrase.row = 0;
  engine.noteOn(60, 100); // row 0
  engine.cur.phrase.row = 0;
  // SEL then OPT (SEL first) -> selection on
  engine.sendKeys(KEY.SEL);
  engine.sendKeys(KEY.SEL | KEY.OPT);
  engine.sendKeys(0);
  assert.ok(engine.sel, 'selection active');
  press(engine, KEY.DOWN); // extend to row 1
  engine.noteOn(64, 100); // hmm, noteOn while sel: no insert (sel active) - fine, row1 via edit
  // set row 1 directly then copy
  engine.prj.phrases[0].rows[1].n = 64;
  // OPT tap -> copy
  press(engine, KEY.OPT);
  assert.ok(engine.clip && engine.clip.h === 2, 'copied 2 rows');
  // selection off, move to row 4, SEL+EDIT paste
  engine.sendKeys(KEY.SEL);
  engine.sendKeys(KEY.SEL | KEY.OPT);
  engine.sendKeys(0);
  assert.ok(!engine.sel, 'selection off');
  engine.cur.phrase.row = 4;
  engine.sendKeys(KEY.SEL);
  engine.sendKeys(KEY.SEL | KEY.EDIT);
  engine.sendKeys(0);
  assert.equal(engine.prj.phrases[0].rows[4].n, 60);
  assert.equal(engine.prj.phrases[0].rows[5].n, 64);
  console.log('ok - selection copy/paste');
}

// ---- mute via OPT-then-SEL ----
{
  const { engine } = makeEngine();
  await engine.enable();
  engine._splashUntil = 0;
  engine.sendKeys(KEY.OPT);
  engine.sendKeys(KEY.OPT | KEY.SEL);
  engine.sendKeys(0);
  assert.equal(engine.muted[0], true, 'track 1 muted');
  assert.ok(!engine.sel, 'no selection');
  console.log('ok - OPT+SEL mute');
}

// ---- SLIP protocol round-trip through stock Parser ----
{
  const { engine, captured } = makeEngine();
  await engine.enable();
  engine._splashUntil = 0;
  captured.length = 0;
  engine.redraw();
  const calls = { rect: 0, text: 0, wave: 0, font: null, chars: [] };
  const mockRenderer = {
    drawRect: () => calls.rect++,
    drawText: (c) => {
      calls.text++;
      calls.chars.push(c);
    },
    drawWave: () => calls.wave++,
    setFont: (f) => (calls.font = f),
    clear: () => {},
  };
  const parser = new Parser(mockRenderer);
  parser.process(new Uint8Array(captured));
  assert.ok(calls.rect >= 1, 'rect frames decoded');
  assert.ok(calls.text >= 39 * 24 - 1, `char frames decoded (${calls.text})`);
  // first text row should spell the SONG header
  const firstRow = calls.chars.slice(0, 39).map((c) => String.fromCharCode(c)).join('');
  assert.ok(firstRow.startsWith('SONG'), 'header round-trips: ' + firstRow);
  // wave frame
  captured.length = 0;
  calls.wave = 0;
  const peaks = new Float32Array(120).fill(0.5);
  engine._sendWave(peaks);
  parser.process(new Uint8Array(captured));
  assert.equal(calls.wave, 1, 'wave frame decoded');
  console.log('ok - SLIP round-trip (rect/text/wave)');
}

console.log('\nEngine: all tests passed');
process.exit(0);
