// M8 Virtual Teensy - JS fallback DSP (WASM mirror)
// =================================================
// Pure-JS port of dsp/voices.ts with an identical voice model and API
// shape. Used automatically if WebAssembly is unavailable, and as the
// executable reference for DSP tests.

const MAXV = 16;
const PLUCK_LEN = 4096;

function fsin(c) {
  let x = (c - Math.floor(c)) * 6.283185307179586;
  let sign = 1;
  if (x > Math.PI) {
    x -= Math.PI;
    sign = -1;
  }
  if (x > Math.PI / 2) x = Math.PI - x;
  const x2 = x * x;
  let y = x;
  y -= x * x2 * 0.16666666666666666;
  y += x * x2 * x2 * 0.008333333333333333;
  y -= x * x2 * x2 * x2 * 0.0001984126984126984;
  y += x * x2 * x2 * x2 * x2 * 0.0000027557319223985893;
  return sign * y;
}

function blep(t, dt) {
  if (t < dt) {
    const u = t / dt;
    return u + u - u * u - 1;
  }
  if (t > 1 - dt) {
    const u = (t - 1) / dt;
    return u * u + u + u + 1;
  }
  return 0;
}

function newVoice() {
  return {
    type: 0, freq: 440, tfreq: 440, phase: 0, modph: 0, prevmod: 0,
    cut: 18000, res: 0, lp: 0, bp: 0,
    envst: 0, env: 0, att: 0.005, dec: 0.05, sus: 1, rel: 0.08, relstart: 0, vel: 1,
    vibr: 0, vibd: 0, vibph: 0,
    fmidx: 0, fmrat: 1, fmfb: 0, det: 0, sub: 0, pwm: 0.5,
    slideLeft: 0, slideStep: 0, noise: 22222,
    pkidx: 0, pklen: 100,
  };
}

export class FallbackVoices {
  constructor() {
    this.sr = 44100;
    this.isr = 1 / 44100;
    this.slideArmed = 0;
    this.v = [];
    this.pluck = [];
    for (let i = 0; i < MAXV; i++) {
      this.v.push(newVoice());
      this.v[i].noise = 22222 + i * 7777;
      this.pluck.push(new Float32Array(PLUCK_LEN));
    }
  }

  init(sr) {
    this.sr = sr;
    this.isr = 1 / sr;
  }

  setType(v, t) {
    if (v >= 0 && v < MAXV) this.v[v].type = t;
  }

  setParam(v, id, val) {
    if (v < 0 || v >= MAXV) return;
    const o = this.v[v];
    switch (id) {
      case 0: o.cut = val; break;
      case 1: o.res = val; break;
      case 2: o.att = val; break;
      case 3: o.dec = val; break;
      case 4: o.sus = val; break;
      case 5: o.rel = val; break;
      case 6: o.vibr = val; break;
      case 7: o.vibd = val; break;
      case 8: o.fmidx = val; break;
      case 9: o.fmrat = val; break;
      case 10: o.det = val; break;
      case 11: o.sub = val; break;
      case 12: this.slideArmed = val; break;
      case 13: o.pwm = Math.min(0.95, Math.max(0.05, val)); break;
      case 14: o.fmfb = Math.min(0.95, Math.max(0, val)); break;
      default: break;
    }
  }

  _rand(o) {
    let x = o.noise | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    if (x === 0) x = 0x9e3779b9;
    o.noise = x | 0;
    return (x >>> 0) / 4294967296;
  }

  setFreq(v, f) {
    if (v < 0 || v >= MAXV) return;
    const o = this.v[v];
    o.freq = f;
    o.tfreq = f;
    o.slideLeft = 0;
  }

  noteOn(v, freq, vel) {
    if (v < 0 || v >= MAXV) return;
    const o = this.v[v];
    if (this.slideArmed > 0.0005 && o.freq > 1) {
      const n = Math.floor(this.slideArmed * this.sr);
      o.slideLeft = Math.max(0, n);
      o.slideStep = n > 0 ? (freq - o.freq) / n : 0;
    } else {
      o.freq = freq;
      o.slideLeft = 0;
    }
    o.tfreq = freq;
    o.vel = Math.min(1, Math.max(0, vel));
    o.envst = 1;
    o.env = 0;
    if (o.type === 8) {
      let len = Math.round(this.sr / Math.max(10, freq));
      len = Math.min(PLUCK_LEN, Math.max(2, len));
      o.pklen = len;
      o.pkidx = 0;
      const lb = this.pluck[v];
      for (let i = 0; i < len; i++) lb[i] = this._rand(o) * 2 - 1;
    }
  }

  noteOff(v) {
    if (v < 0 || v >= MAXV) return;
    const o = this.v[v];
    if (o.envst === 1 || o.envst === 2 || o.envst === 3) {
      o.relstart = o.env;
      o.envst = 4;
    }
  }

  choke(v) {
    if (v < 0 || v >= MAXV) return;
    const o = this.v[v];
    o.envst = 0;
    o.env = 0;
    o.lp = 0;
    o.bp = 0;
  }

  isActive(v) {
    if (v < 0 || v >= MAXV) return 0;
    return this.v[v].envst === 0 ? 0 : 1;
  }

  // Render voice v, ADDING `frames` mono samples into out[0..frames).
  renderTo(v, out, frames) {
    if (v < 0 || v >= MAXV) return;
    const o = this.v[v];
    if (o.envst === 0 || o.type <= 0) return;
    const sr = this.sr;
    const isr = this.isr;
    const fc = Math.min(sr * 0.45, Math.max(20, o.cut));
    const f = Math.min(0.99, (2 * fc) / sr);
    const q = 2 * (1 - Math.min(1, Math.max(0, o.res)) * 0.96);
    const attInc = o.att <= 0.0005 ? 10 : isr / o.att;
    const decInc = o.dec <= 0.0005 ? 10 : ((1 - o.sus) * isr) / o.dec;
    const relInc = o.rel <= 0.0005 ? 10 : isr / o.rel;
    const nyq = sr * 0.5;
    const lb = this.pluck[v];
    const damp = Math.min(0.95, Math.max(0, o.cut));
    const pdecay = Math.min(0.999999, Math.max(0.8, o.res));

    for (let i = 0; i < frames; i++) {
      if (o.slideLeft > 0) {
        o.freq += o.slideStep;
        o.slideLeft--;
        if (o.slideLeft === 0) o.freq = o.tfreq;
      }
      let mult = 1;
      if (o.vibd > 0.0001 && o.vibr > 0.01) {
        o.vibph += o.vibr * isr;
        if (o.vibph >= 1) o.vibph -= 1;
        mult = 1 + o.vibd * fsin(o.vibph) * 0.0578;
      }
      const fr = Math.min(nyq * 0.92, Math.max(1, o.freq * mult));
      let s = 0;
      const t = o.type;
      if (t === 1) {
        const dt = fr * isr;
        o.phase += dt;
        if (o.phase >= 1) o.phase -= 1;
        s = 2 * o.phase - 1 - blep(o.phase, dt);
      } else if (t === 2) {
        const dt = fr * isr;
        o.phase += dt;
        if (o.phase >= 1) o.phase -= 1;
        s = o.phase < o.pwm ? 1 : -1;
        s += blep(o.phase, dt);
        let p2 = o.phase + 1 - o.pwm;
        if (p2 >= 1) p2 -= 1;
        s -= blep(p2, dt);
        s *= 0.7;
      } else if (t === 3) {
        o.phase += fr * isr;
        if (o.phase >= 1) o.phase -= 1;
        s = (o.phase < 0.5 ? 4 * o.phase - 1 : 3 - 4 * o.phase) * 0.9;
      } else if (t === 4) {
        o.phase += fr * isr;
        if (o.phase >= 1) o.phase -= 1;
        s = fsin(o.phase);
      } else if (t === 5) {
        s = this._rand(o) * 2 - 1;
      } else if (t === 6) {
        o.modph += fr * o.fmrat * isr;
        if (o.modph >= 1) o.modph -= 1;
        const m = fsin(o.modph + o.fmfb * o.prevmod * 0.15915494);
        o.prevmod = m;
        o.phase += fr * isr;
        if (o.phase >= 1) o.phase -= 1;
        s = fsin(o.phase + o.fmidx * m * 0.15915494);
      } else if (t === 7) {
        const dt = fr * isr;
        const dc = o.det * 0.000594;
        o.phase += dt;
        if (o.phase >= 1) o.phase -= 1;
        let pA = o.phase - dc;
        let pB = o.phase + dc;
        if (pA < 0) pA += 1;
        if (pB >= 1) pB -= 1;
        s =
          (2 * o.phase - 1 - blep(o.phase, dt)) * 0.5 +
          (2 * pA - 1 - blep(pA, dt)) * 0.25 +
          (2 * pB - 1 - blep(pB, dt)) * 0.25;
        if (o.sub > 0.001) s += fsin(o.phase * 0.5) * o.sub * 0.8;
        s *= 0.6;
      } else if (t === 8) {
        const a = lb[o.pkidx];
        let ni = o.pkidx + 1;
        if (ni >= o.pklen) ni = 0;
        const c = lb[ni];
        const k = 0.5 * damp;
        const v2 = pdecay * (a * (1 - k) + c * k);
        lb[o.pkidx] = v2;
        o.pkidx = ni;
        s = v2 * 1.5;
      }
      let y = s;
      if (t !== 8) {
        const hp = s - o.lp - q * o.bp;
        o.bp += f * hp;
        o.lp += f * o.bp;
        y = o.lp * (1 + Math.min(1, Math.max(0, o.res)) * 0.4);
      }
      if (o.envst === 1) {
        o.env += attInc;
        if (o.env >= 1) {
          o.env = 1;
          o.envst = 2;
        }
      } else if (o.envst === 2) {
        o.env -= decInc;
        if (o.env <= o.sus) {
          o.env = o.sus;
          o.envst = 3;
        }
      } else if (o.envst === 4) {
        o.env -= o.relstart * relInc;
        if (o.env <= 0) {
          o.env = 0;
          o.envst = 0;
        }
      }
      out[i] += y * o.env * o.vel;
      if (o.envst === 0) break;
    }
  }
}
