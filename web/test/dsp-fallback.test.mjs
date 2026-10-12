// Fallback DSP test: every voice type renders sane audio in pure JS,
// and WASM <-> JS outputs roughly agree.
// Run: node test/dsp-fallback.test.mjs
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FallbackVoices } from '../js/virtual/dsp-fallback.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function energy(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    assert.ok(Number.isFinite(x[i]), 'finite sample');
    s += x[i] * x[i];
  }
  return s / x.length;
}

const fb = new FallbackVoices();
fb.init(44100);
const names = { 1: 'saw', 2: 'sqr', 3: 'tri', 4: 'sin', 5: 'noise', 6: 'fm', 7: 'ssaw', 8: 'pluck' };
for (const [t, name] of Object.entries(names)) {
  const type = Number(t);
  fb.choke(0);
  fb.setType(0, type);
  if (type === 6) {
    fb.setParam(0, 8, 2.0);
    fb.setParam(0, 9, 1.0);
  }
  if (type === 8) {
    fb.setParam(0, 0, 0.7);
    fb.setParam(0, 1, 0.9995);
  }
  fb.noteOn(0, 220, 0.9);
  const out = new Float32Array(4352);
  for (let o = 0; o < 4352; o += 128) {
    const tmp = new Float32Array(128);
    fb.renderTo(0, tmp, 128);
    out.set(tmp, o);
  }
  const e = energy(out.subarray(2176));
  assert.ok(e > 1e-6, `${name} audible`);
  console.log(`ok - fallback ${name} energy=${e.toFixed(4)}`);
}

// WASM <-> fallback agreement (same notes, similar energy, correlated)
const bytes = readFileSync(join(root, 'dsp', 'voices.wasm'));
const w = (await WebAssembly.instantiate(bytes, {})).instance.exports;
w.init(44100);
for (const type of [1, 4, 6]) {
  const N = 2048;
  // wasm
  w.choke(0);
  w.setType(0, type);
  if (type === 6) {
    w.setParam(0, 8, 2.0);
    w.setParam(0, 9, 1.0);
  }
  w.noteOn(0, 220, 0.9);
  w.clearBus(0, N);
  // render in 128 chunks into bus offsets? renderAdd always starts at bus base,
  // so render 128-sample pieces and stitch via mem copies.
  const mem = () => new Float32Array(w.memory.buffer);
  const wy = new Float32Array(N);
  for (let o = 0; o < N; o += 128) {
    w.clearBus(0, 128);
    w.renderAdd(0, 0, 128);
    wy.set(mem().subarray(w.busPtr(0) / 4, w.busPtr(0) / 4 + 128), o);
  }
  // fallback
  fb.choke(1);
  fb.setType(1, type);
  if (type === 6) {
    fb.setParam(1, 8, 2.0);
    fb.setParam(1, 9, 1.0);
  }
  fb.noteOn(1, 220, 0.9);
  const jy = new Float32Array(N);
  for (let o = 0; o < N; o += 128) {
    const tmp = new Float32Array(128);
    fb.renderTo(1, tmp, 128);
    jy.set(tmp, o);
  }
  // normalized cross-correlation over steady part
  const a = wy.subarray(500);
  const b = jy.subarray(500);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const corr = dot / Math.sqrt(na * nb);
  assert.ok(corr > 0.9, `type ${type} wasm/js correlate, got ${corr}`);
  console.log(`ok - type ${type} wasm/js correlation=${corr.toFixed(4)}`);
}

console.log('\nFallback DSP: all tests passed');
