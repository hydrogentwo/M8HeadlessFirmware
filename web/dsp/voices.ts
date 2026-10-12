// M8 Virtual Teensy - WebAssembly DSP core (AssemblyScript)
// ============================================================
// Polyphonic synthesizer voice engine. Runs inside an AudioWorklet,
// driven by the virtual sequencer. No GC, no heap allocation, no
// transcendental imports: pure number crunching on a fixed memory map.
//
// Memory map (8 pages = 512 KiB, never grows so JS views stay valid):
//   0 .. 2047        voice structs (16 slots x 128 bytes)
//   4096 .. 36863    mix buses (4 x 2048 frames f32, see busPtr())
//   65536 .. 327679  Karplus-Strong pluck lines (16 x 4096 f32)
//
// Voice struct (128 bytes, offsets below). All float params are in
// physical units (Hz, seconds, 0..1) - the JS side maps M8 00-FF
// values to these. This keeps the WASM side stable and testable.

// ---- struct offsets -------------------------------------------------
const VS_TYPE: i32 = 0; // i32: 0 off 1 saw 2 sqr 3 tri 4 sin 5 noise 6 fm 7 ssaw 8 pluck
const VS_FREQ: i32 = 4; // f32: current freq Hz (with slide)
const VS_TFREQ: i32 = 8; // f32: target freq Hz
const VS_PHASE: i32 = 12; // f32: osc phase 0..1
const VS_MODPH: i32 = 16; // f32: FM modulator phase 0..1
const VS_CUT: i32 = 20; // f32: filter cutoff Hz (pluck: damping 0..0.95)
const VS_RES: i32 = 24; // f32: filter reso 0..1 (pluck: decay 0.9..0.99999)
const VS_LP: i32 = 28; // f32: SVF lowpass state
const VS_BP: i32 = 32; // f32: SVF bandpass state
const VS_ENVST: i32 = 36; // i32: env stage 0 idle 1 att 2 dec 3 sus 4 rel
const VS_ENV: i32 = 40; // f32: env level 0..1
const VS_ATT: i32 = 44; // f32: attack sec
const VS_DEC: i32 = 48; // f32: decay sec
const VS_SUS: i32 = 52; // f32: sustain level
const VS_REL: i32 = 56; // f32: release sec
const VS_VEL: i32 = 60; // f32: velocity 0..1
const VS_VIBR: i32 = 64; // f32: vibrato rate Hz
const VS_VIBD: i32 = 68; // f32: vibrato depth semitones
const VS_VIBPH: i32 = 72; // f32: vibrato phase 0..1
const VS_FMIDX: i32 = 76; // f32: FM index (radians-ish 0..~8)
const VS_FMRAT: i32 = 80; // f32: FM ratio multiplier
const VS_DET: i32 = 84; // f32: supersaw detune cents
const VS_SUB: i32 = 88; // f32: sub osc level 0..1
const VS_SLIDELEFT: i32 = 92; // i32: portamento samples remaining
const VS_SLIDESTEP: i32 = 96; // f32: portamento Hz increment / sample
const VS_NOISE: i32 = 100; // i32: xorshift state
const VS_PREVMOD: i32 = 104; // f32: FM feedback memory
const VS_FMFB: i32 = 108; // f32: FM feedback 0..0.95
const VS_PKIDX: i32 = 112; // i32: pluck read index
const VS_PKLEN: i32 = 116; // i32: pluck line length
const VS_RELSTART: i32 = 120; // f32: env level at note-off
const VS_PWM: i32 = 124; // f32: square pulse width 0.05..0.95
const VS_SLOT: i32 = 128;
const MAXV: i32 = 16;

// ---- param ids for setParam -----------------------------------------
export const P_CUT: i32 = 0;
export const P_RES: i32 = 1;
export const P_ATT: i32 = 2;
export const P_DEC: i32 = 3;
export const P_SUS: i32 = 4;
export const P_REL: i32 = 5;
export const P_VIBR: i32 = 6;
export const P_VIBD: i32 = 7;
export const P_FMIDX: i32 = 8;
export const P_FMRAT: i32 = 9;
export const P_DET: i32 = 10;
export const P_SUB: i32 = 11;
export const P_SLIDE: i32 = 12; // portamento time sec (armed for next noteOn)
export const P_PWM: i32 = 13;
export const P_FMFB: i32 = 14;

const BUS_BASE: i32 = 4096;
const BUS_LEN: i32 = 2048; // frames per bus
const BUS_STRIDE: i32 = 8192; // bytes per bus
const PLUCK_BASE: i32 = 65536;
const PLUCK_LEN: i32 = 4096;
const PLUCK_STRIDE: i32 = 16384; // bytes per line

let sr: f32 = 44100.0;
let isr: f32 = 1.0 / 44100.0;
let slideArmed: f32 = 0.0; // shared pending slide time (per-voice set before noteOn)

// Math helpers (no libm imports allowed)
@inline function ffloor(x: f32): f32 {
  return <f32>Math.floor(x);
}
@inline function fmin(a: f32, b: f32): f32 {
  return a < b ? a : b;
}
@inline function fmax(a: f32, b: f32): f32 {
  return a > b ? a : b;
}
@inline function fclamp(x: f32, lo: f32, hi: f32): f32 {
  return x < lo ? lo : x > hi ? hi : x;
}

// Fast accurate sin(2*pi*c), c in cycles. Range-folded Taylor 9th.
@inline function fsin(c: f32): f32 {
  let x: f32 = c - ffloor(c); // 0..1
  x *= 6.283185307179586; // 0..2pi
  let sign: f32 = 1.0;
  if (x > 3.141592653589793) {
    x -= 3.141592653589793;
    sign = -1.0;
  }
  if (x > 1.5707963267948966) x = 3.141592653589793 - x;
  const x2: f32 = x * x;
  // sin(x) = x - x^3/6 + x^5/120 - x^7/5040 + x^9/362880
  let y: f32 = x;
  y -= x * x2 * 0.16666666666666666;
  y += x * x2 * x2 * 0.008333333333333333;
  y -= x * x2 * x2 * x2 * 0.0001984126984126984;
  y += x * x2 * x2 * x2 * x2 * 0.0000027557319223985893;
  return sign * y;
}

// PolyBLEP residual for band-limited saw/square
@inline function blep(t: f32, dt: f32): f32 {
  if (t < dt) {
    const u: f32 = t / dt;
    return u + u - u * u - 1.0;
  }
  if (t > 1.0 - dt) {
    const u: f32 = (t - 1.0) / dt;
    return u * u + u + u + 1.0;
  }
  return 0.0;
}

@inline function vbase(v: i32): i32 {
  return v * VS_SLOT;
}

export function init(rate: f32): void {
  sr = rate;
  isr = 1.0 / rate;
  memory.fill(0, 0, BUS_BASE); // zero voice structs
  for (let v: i32 = 0; v < MAXV; v++) {
    const b: i32 = vbase(v);
    store<i32>(b + VS_NOISE, 22222 + v * 7777);
    store<f32>(b + VS_CUT, 18000.0);
    store<f32>(b + VS_SUS, 1.0);
    store<f32>(b + VS_ATT, 0.005);
    store<f32>(b + VS_DEC, 0.05);
    store<f32>(b + VS_REL, 0.08);
    store<f32>(b + VS_FMRAT, 1.0);
    store<f32>(b + VS_PWM, 0.5);
    store<f32>(b + VS_VEL, 1.0);
  }
}

export function busPtr(i: i32): i32 {
  return BUS_BASE + i * BUS_STRIDE;
}

export function clearBus(i: i32, frames: i32): void {
  memory.fill(BUS_BASE + i * BUS_STRIDE, 0, frames * 4);
}

export function setType(v: i32, t: i32): void {
  if (v < 0 || v >= MAXV) return;
  store<i32>(vbase(v) + VS_TYPE, t);
}

export function setParam(v: i32, id: i32, val: f32): void {
  if (v < 0 || v >= MAXV) return;
  const b: i32 = vbase(v);
  if (id == P_CUT) store<f32>(b + VS_CUT, val);
  else if (id == P_RES) store<f32>(b + VS_RES, val);
  else if (id == P_ATT) store<f32>(b + VS_ATT, val);
  else if (id == P_DEC) store<f32>(b + VS_DEC, val);
  else if (id == P_SUS) store<f32>(b + VS_SUS, val);
  else if (id == P_REL) store<f32>(b + VS_REL, val);
  else if (id == P_VIBR) store<f32>(b + VS_VIBR, val);
  else if (id == P_VIBD) store<f32>(b + VS_VIBD, val);
  else if (id == P_FMIDX) store<f32>(b + VS_FMIDX, val);
  else if (id == P_FMRAT) store<f32>(b + VS_FMRAT, val);
  else if (id == P_DET) store<f32>(b + VS_DET, val);
  else if (id == P_SUB) store<f32>(b + VS_SUB, val);
  else if (id == P_SLIDE) slideArmed = val;
  else if (id == P_PWM) store<f32>(b + VS_PWM, fclamp(val, 0.05, 0.95));
  else if (id == P_FMFB) store<f32>(b + VS_FMFB, fclamp(val, 0.0, 0.95));
}

@inline function xrand(b: i32): f32 {
  let x: u32 = <u32>load<i32>(b + VS_NOISE);
  x ^= x << 13;
  x ^= x >> 17;
  x ^= x << 5;
  if (x == 0) x = 0x9e3779b9;
  store<i32>(b + VS_NOISE, <i32>x);
  return <f32>x / 4294967296.0;
}

export function noteOn(v: i32, freq: f32, vel: f32): void {
  if (v < 0 || v >= MAXV) return;
  const b: i32 = vbase(v);
  const old: f32 = load<f32>(b + VS_FREQ);
  // portamento: glide from previous freq when armed and voice was active
  if (slideArmed > 0.0005 && old > 1.0) {
    const n: i32 = <i32>(slideArmed * sr);
    store<i32>(b + VS_SLIDELEFT, n > 0 ? n : 0);
    store<f32>(b + VS_SLIDESTEP, n > 0 ? (freq - old) / <f32>n : 0.0);
    // keep VS_FREQ at old, target new
  } else {
    store<f32>(b + VS_FREQ, freq);
    store<i32>(b + VS_SLIDELEFT, 0);
  }
  store<f32>(b + VS_TFREQ, freq);
  store<f32>(b + VS_VEL, fclamp(vel, 0.0, 1.0));
  store<i32>(b + VS_ENVST, 1);
  store<f32>(b + VS_ENV, 0.0);
  // keep osc phase continuous (avoids clicks on legato/retrig)
  const t: i32 = load<i32>(b + VS_TYPE);
  if (t == 8) {
    // excite Karplus-Strong line with noise burst
    let len: i32 = <i32>(sr / fmax(freq, 10.0) + 0.5);
    if (len < 2) len = 2;
    if (len > PLUCK_LEN) len = PLUCK_LEN;
    store<i32>(b + VS_PKLEN, len);
    store<i32>(b + VS_PKIDX, 0);
    const lb: i32 = PLUCK_BASE + v * PLUCK_STRIDE;
    for (let i: i32 = 0; i < len; i++) {
      store<f32>(lb + i * 4, xrand(b) * 2.0 - 1.0);
    }
  }
}

export function noteOff(v: i32): void {
  if (v < 0 || v >= MAXV) return;
  const b: i32 = vbase(v);
  const st: i32 = load<i32>(b + VS_ENVST);
  if (st == 1 || st == 2 || st == 3) {
    store<f32>(b + VS_RELSTART, load<f32>(b + VS_ENV));
    store<i32>(b + VS_ENVST, 4);
  }
}

// Live pitch override (tables, pitch FX). Cancels portamento.
export function setFreq(v: i32, f: f32): void {
  if (v < 0 || v >= MAXV) return;
  const b: i32 = vbase(v);
  store<f32>(b + VS_FREQ, f);
  store<f32>(b + VS_TFREQ, f);
  store<i32>(b + VS_SLIDELEFT, 0);
}

// Immediate silence (transport stop / voice steal)
export function choke(v: i32): void {
  if (v < 0 || v >= MAXV) return;
  const b: i32 = vbase(v);
  store<i32>(b + VS_ENVST, 0);
  store<f32>(b + VS_ENV, 0.0);
  store<f32>(b + VS_LP, 0.0);
  store<f32>(b + VS_BP, 0.0);
}

export function isActive(v: i32): i32 {
  if (v < 0 || v >= MAXV) return 0;
  return load<i32>(vbase(v) + VS_ENVST) == 0 ? 0 : 1;
}

// Render voice v, adding `frames` mono samples into bus `bus`.
export function renderAdd(v: i32, bus: i32, frames: i32): void {
  if (v < 0 || v >= MAXV) return;
  if (frames <= 0 || frames > BUS_LEN) return;
  const b: i32 = vbase(v);
  let st: i32 = load<i32>(b + VS_ENVST);
  if (st == 0) return;
  const typ: i32 = load<i32>(b + VS_TYPE);
  if (typ <= 0) {
    store<i32>(b + VS_ENVST, 0);
    return;
  }

  let freq: f32 = load<f32>(b + VS_FREQ);
  const tfreq: f32 = load<f32>(b + VS_TFREQ);
  let phase: f32 = load<f32>(b + VS_PHASE);
  let modph: f32 = load<f32>(b + VS_MODPH);
  let prevmod: f32 = load<f32>(b + VS_PREVMOD);
  const cut: f32 = load<f32>(b + VS_CUT);
  const res: f32 = load<f32>(b + VS_RES);
  let lp: f32 = load<f32>(b + VS_LP);
  let bp: f32 = load<f32>(b + VS_BP);
  let env: f32 = load<f32>(b + VS_ENV);
  const att: f32 = load<f32>(b + VS_ATT);
  const dec: f32 = load<f32>(b + VS_DEC);
  const sus: f32 = load<f32>(b + VS_SUS);
  const rel: f32 = load<f32>(b + VS_REL);
  const relstart: f32 = load<f32>(b + VS_RELSTART);
  const vel: f32 = load<f32>(b + VS_VEL);
  const vibr: f32 = load<f32>(b + VS_VIBR);
  const vibd: f32 = load<f32>(b + VS_VIBD);
  let vibph: f32 = load<f32>(b + VS_VIBPH);
  const fmidx: f32 = load<f32>(b + VS_FMIDX);
  const fmrat: f32 = load<f32>(b + VS_FMRAT);
  const fmfb: f32 = load<f32>(b + VS_FMFB);
  const det: f32 = load<f32>(b + VS_DET);
  const sub: f32 = load<f32>(b + VS_SUB);
  const pwm: f32 = load<f32>(b + VS_PWM);
  let slideLeft: i32 = load<i32>(b + VS_SLIDELEFT);
  const slideStep: f32 = load<f32>(b + VS_SLIDESTEP);

  // filter coefficient + resonance (Chamberlin SVF)
  const fc: f32 = fclamp(cut, 20.0, sr * 0.45);
  const f: f32 = fmin(0.99, 2.0 * fc * isr);
  const q: f32 = 2.0 * (1.0 - fclamp(res, 0.0, 1.0) * 0.96);

  const attInc: f32 = att <= 0.0005 ? 10.0 : isr / att;
  const decInc: f32 = dec <= 0.0005 ? 10.0 : (1.0 - sus) * isr / dec;
  const relInc: f32 = rel <= 0.0005 ? 10.0 : isr / rel;

  // pluck locals
  const lb: i32 = PLUCK_BASE + v * PLUCK_STRIDE;
  let pklen: i32 = load<i32>(b + VS_PKLEN);
  let pkidx: i32 = load<i32>(b + VS_PKIDX);
  if (pklen < 2) pklen = 2;
  if (pklen > PLUCK_LEN) pklen = PLUCK_LEN;
  const damp: f32 = fclamp(cut, 0.0, 0.95); // pluck reuses CUT as damping
  const pdecay: f32 = fclamp(res, 0.8, 0.999999); // ... and RES as decay

  const out: i32 = BUS_BASE + bus * BUS_STRIDE;
  const nyq: f32 = sr * 0.5;

  for (let i: i32 = 0; i < frames; i++) {
    // --- portamento ---
    if (slideLeft > 0) {
      freq += slideStep;
      slideLeft--;
      if (slideLeft == 0) freq = tfreq;
    }
    // --- vibrato ---
    let mult: f32 = 1.0;
    if (vibd > 0.0001 && vibr > 0.01) {
      vibph += vibr * isr;
      if (vibph >= 1.0) vibph -= 1.0;
      mult = 1.0 + vibd * fsin(vibph) * 0.0578; // ~2^(semi/12) linearised
    }
    let fr: f32 = fclamp(freq * mult, 1.0, nyq * 0.92);

    // --- oscillator ---
    let s: f32 = 0.0;
    if (typ == 1) {
      // band-limited saw
      const dt: f32 = fr * isr;
      phase += dt;
      if (phase >= 1.0) phase -= 1.0;
      s = 2.0 * phase - 1.0 - blep(phase, dt);
    } else if (typ == 2) {
      // band-limited pulse
      const dt: f32 = fr * isr;
      phase += dt;
      if (phase >= 1.0) phase -= 1.0;
      s = phase < pwm ? 1.0 : -1.0;
      s += blep(phase, dt);
      let p2: f32 = phase + 1.0 - pwm;
      if (p2 >= 1.0) p2 -= 1.0;
      s -= blep(p2, dt);
      s *= 0.7;
    } else if (typ == 3) {
      phase += fr * isr;
      if (phase >= 1.0) phase -= 1.0;
      s = phase < 0.5 ? 4.0 * phase - 1.0 : 3.0 - 4.0 * phase;
      s *= 0.9;
    } else if (typ == 4) {
      phase += fr * isr;
      if (phase >= 1.0) phase -= 1.0;
      s = fsin(phase);
    } else if (typ == 5) {
      s = xrand(b) * 2.0 - 1.0;
    } else if (typ == 6) {
      // 2-op FM with feedback
      const mdt: f32 = fr * fmrat * isr;
      modph += mdt;
      if (modph >= 1.0) modph -= 1.0;
      const m: f32 = fsin(modph + fmfb * prevmod * 0.15915494);
      prevmod = m;
      phase += fr * isr;
      if (phase >= 1.0) phase -= 1.0;
      s = fsin(phase + fmidx * m * 0.15915494);
    } else if (typ == 7) {
      // supersaw: 3 detuned saws + sub sine
      const dt: f32 = fr * isr;
      const dc: f32 = det * 0.000594; // cents -> ratio delta approx
      phase += dt;
      if (phase >= 1.0) phase -= 1.0;
      let pA: f32 = phase - dc;
      let pB: f32 = phase + dc;
      if (pA < 0.0) pA += 1.0;
      if (pB >= 1.0) pB -= 1.0;
      s = (2.0 * phase - 1.0 - blep(phase, dt)) * 0.5
        + (2.0 * pA - 1.0 - blep(pA, dt)) * 0.25
        + (2.0 * pB - 1.0 - blep(pB, dt)) * 0.25;
      if (sub > 0.001) {
        let sp: f32 = phase * 0.5;
        s += fsin(sp) * sub * 0.8;
      }
      s *= 0.6;
    } else if (typ == 8) {
      // Karplus-Strong pluck
      const a: f32 = load<f32>(lb + pkidx * 4);
      let ni: i32 = pkidx + 1;
      if (ni >= pklen) ni = 0;
      const c: f32 = load<f32>(lb + ni * 4);
      const k: f32 = 0.5 * damp;
      const v2: f32 = pdecay * (a * (1.0 - k) + c * k);
      store<f32>(lb + pkidx * 4, v2);
      pkidx = ni;
      s = v2 * 1.5;
    }

    // --- filter (skip for pluck: already damped) ---
    let y: f32 = s;
    if (typ != 8 && typ != 0) {
      const hp: f32 = s - lp - q * bp;
      bp += f * hp;
      lp += f * bp;
      y = lp;
      // gentle drive compensation
      y *= 1.0 + fclamp(res, 0.0, 1.0) * 0.4;
    }

    // --- envelope ---
    if (st == 1) {
      env += attInc;
      if (env >= 1.0) {
        env = 1.0;
        st = 2;
      }
    } else if (st == 2) {
      env -= decInc;
      if (env <= sus) {
        env = sus;
        st = 3;
      }
    } else if (st == 4) {
      env -= relstart * relInc;
      if (env <= 0.0) {
        env = 0.0;
        st = 0;
      }
    }
    // --- accumulate ---
    const o: f32 = load<f32>(out + i * 4);
    store<f32>(out + i * 4, o + y * env * vel);
    if (st == 0) {
      // keep rendering silence? no: fill rest by early exit
      // (bus already holds earlier samples; remaining stay as-is)
      // Fast-forward loop end:
      i = frames; // break
    }
  }

  store<f32>(b + VS_FREQ, freq);
  store<f32>(b + VS_PHASE, phase);
  store<f32>(b + VS_MODPH, modph);
  store<f32>(b + VS_PREVMOD, prevmod);
  store<f32>(b + VS_LP, lp);
  store<f32>(b + VS_BP, bp);
  store<i32>(b + VS_ENVST, st);
  store<f32>(b + VS_ENV, env);
  store<f32>(b + VS_VIBPH, vibph);
  store<i32>(b + VS_SLIDELEFT, slideLeft);
  store<i32>(b + VS_PKIDX, pkidx);
}
