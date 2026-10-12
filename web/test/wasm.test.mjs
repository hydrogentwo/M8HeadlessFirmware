// Smoke test for the WASM DSP core (run with plain node, no deps).
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bytes = readFileSync(join(root, 'dsp', 'voices.wasm'));
const mod = await WebAssembly.instantiate(bytes, {});
const w = mod.instance.exports;
const mem = () => new Float32Array(w.memory.buffer);

w.init(44100);

function renderFrames(type, freq, frames, params = {}) {
  const v = 0;
  w.choke(v);
  w.setType(v, type);
  for (const [id, val] of Object.entries(params)) w.setParam(v, Number(id), val);
  w.noteOn(v, freq, 0.9);
  const out = new Float32Array(frames);
  const bus = 0;
  let done = 0;
  while (done < frames) {
    const n = Math.min(128, frames - done);
    w.clearBus(bus, n);
    w.renderAdd(v, bus, n);
    const ptr = w.busPtr(bus) / 4;
    out.set(mem().subarray(ptr, ptr + n), done);
    done += n;
  }
  return out;
}

function energy(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) {
    assert.ok(Number.isFinite(x[i]), 'sample must be finite');
    s += x[i] * x[i];
  }
  return s / x.length;
}

// 1. every osc type produces sound
const names = { 1: 'saw', 2: 'sqr', 3: 'tri', 4: 'sin', 5: 'noise', 6: 'fm', 7: 'ssaw', 8: 'pluck' };
for (const [t, name] of Object.entries(names)) {
  const type = Number(t);
  const params = type === 6 ? { 8: 2.0, 9: 1.0 } : type === 8 ? { 0: 0.7, 1: 0.9995 } : {};
  const y = renderFrames(type, 220, 4410, params);
  // skip attack transient: measure second half
  const e = energy(y.subarray(2205));
  assert.ok(e > 1e-6, `${name}: expected audible energy, got ${e}`);
  console.log(`ok - ${name} energy=${e.toFixed(4)} peak=${Math.max(...y.map(Math.abs)).toFixed(3)}`);
}

// 2. noteOff -> release -> silence + inactive
{
  const v = 1;
  w.choke(v);
  w.setType(v, 1);
  w.noteOn(v, 110, 1);
  w.clearBus(1, 128);
  w.renderAdd(v, 1, 128);
  assert.equal(w.isActive(v), 1);
  w.noteOff(v);
  for (let i = 0; i < 200; i++) {
    w.clearBus(1, 128);
    w.renderAdd(v, 1, 128);
  }
  assert.equal(w.isActive(v), 0, 'voice should go idle after release');
  console.log('ok - noteOff/release/idle');
}

// 3. choke silences immediately
{
  const v = 2;
  w.setType(v, 4);
  w.noteOn(v, 440, 1);
  w.choke(v);
  w.clearBus(2, 128);
  w.renderAdd(v, 2, 128);
  const ptr = w.busPtr(2) / 4;
  const e = energy(mem().subarray(ptr, ptr + 128));
  assert.equal(e, 0);
  console.log('ok - choke');
}

// 4. filter closes down the sound (saw through low cutoff << bright)
{
  const bright = renderFrames(1, 220, 4410, { 0: 18000, 1: 0 });
  // crude HF measure: energy of first difference
  const hf = (y) => {
    let s = 0;
    for (let i = 1; i < y.length; i++) s += (y[i] - y[i - 1]) ** 2;
    return s / y.length;
  };
  const dark = renderFrames(1, 220, 4410, { 0: 300, 1: 0 });
  assert.ok(hf(dark) < hf(bright) * 0.2, `filter should darken: ${hf(dark)} vs ${hf(bright)}`);
  console.log('ok - lowpass darkens');
}

// 5. portamento glides (freq moves toward target across blocks)
{
  const v = 3;
  w.choke(v);
  w.setType(v, 4);
  w.setParam(v, 12, 0.1); // 100ms slide armed
  w.noteOn(v, 100, 1);
  w.noteOn(v, 400, 1); // retrig: should glide from ~100
  // zero-crossing estimate early vs late
  const early = (() => {
    w.clearBus(3, 128);
    w.renderAdd(v, 3, 128);
    const ptr = w.busPtr(3) / 4;
    return Float32Array.from(mem().subarray(ptr, ptr + 128));
  })();
  for (let i = 0; i < 40; i++) {
    w.clearBus(3, 128);
    w.renderAdd(v, 3, 128);
  }
  const zc = (y) => {
    let n = 0;
    for (let i = 1; i < y.length; i++) if ((y[i - 1] < 0) !== (y[i] < 0)) n++;
    return n;
  };
  const late = (() => {
    w.clearBus(3, 128);
    w.renderAdd(v, 3, 128);
    const ptr = w.busPtr(3) / 4;
    return Float32Array.from(mem().subarray(ptr, ptr + 128));
  })();
  assert.ok(zc(early) < zc(late), `slide should rise in pitch: ${zc(early)} vs ${zc(late)}`);
  console.log('ok - portamento');
}

console.log('\nWASM DSP: all tests passed');
