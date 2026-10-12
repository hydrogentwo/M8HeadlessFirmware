// M8 Virtual Teensy - DSP graph (mixer + sends + sample voices)
// ==============================================================
// Runs inside the AudioWorklet. Node-testable: no worklet APIs here.
// Synth voices come from WASM (dsp/voices.wasm) with a JS fallback.

// WASM voice wrapper: same renderTo() shape as FallbackVoices.
export class WasmVoices {
  constructor(instance) {
    this.w = instance.exports;
    this._mem = null;
  }

  _view() {
    if (!this._mem || this._mem.buffer !== this.w.memory.buffer) {
      this._mem = new Float32Array(this.w.memory.buffer);
    }
    return this._mem;
  }

  init(sr) { this.w.init(sr); }
  setType(v, t) { this.w.setType(v, t); }
  setParam(v, id, val) { this.w.setParam(v, id, val); }
  setFreq(v, f) { this.w.setFreq(v, f); }
  noteOn(v, f, vel) { this.w.noteOn(v, f, vel); }
  noteOff(v) { this.w.noteOff(v); }
  choke(v) { this.w.choke(v); }
  isActive(v) { return this.w.isActive(v); }

  renderTo(v, out, frames) {
    this.w.clearBus(0, frames);
    this.w.renderAdd(v, 0, frames);
    const p = this.w.busPtr(0) / 4;
    out.set(this._view().subarray(p, p + frames));
  }
}

// ---- sample voice (JS) -------------------------------------------------------
function makeSmp() {
  return {
    active: false, buf: null, sr: 44100, pos: 0, dir: 1, rate: 1,
    start: 0, end: 0, loopMode: 0, loopStart: 0, loopEnd: 0,
    envst: 0, env: 0, att: 0.005, dec: 0.05, sus: 1, rel: 0.08, relstart: 0, vel: 1,
    lp: 0, bp: 0, f: 0.99, q: 2,
  };
}

export class SampleBank {
  constructor() {
    this.slots = new Array(64).fill(null);
  }

  set(slot, { sr, data }) {
    this.slots[slot] = { sr, data };
  }

  remove(slot) {
    this.slots[slot] = null;
  }

  get(slot) {
    return this.slots[slot] || null;
  }
}

function renderSample(o, out, frames, outSr) {
  if (!o.active || !o.buf) return;
  const buf = o.buf;
  const conv = o.sr / outSr;
  const attInc = o.att <= 0.0005 ? 10 : 1 / (o.att * outSr);
  const decInc = o.dec <= 0.0005 ? 10 : ((1 - o.sus) / (o.dec * outSr));
  const relInc = o.rel <= 0.0005 ? 10 : 1 / (o.rel * outSr);
  for (let i = 0; i < frames; i++) {
    // advance
    let p = o.pos + o.rate * conv * o.dir;
    if (o.loopMode === 0) {
      if (p >= o.end || p < o.start) {
        o.active = false;
        o.envst = 0;
        break;
      }
    } else if (o.loopMode === 1) {
      while (p >= o.loopEnd) p -= o.loopEnd - o.loopStart;
      while (p < o.loopStart) p += o.loopEnd - o.loopStart;
    } else {
      if (p >= o.loopEnd) {
        p = o.loopEnd - (p - o.loopEnd);
        o.dir = -1;
      } else if (p < o.loopStart) {
        p = o.loopStart + (o.loopStart - p);
        o.dir = 1;
      }
    }
    o.pos = p;
    const i0 = Math.floor(p);
    const fr2 = p - i0;
    const a = buf[i0] || 0;
    const b = buf[i0 + 1] || 0;
    const s = a + (b - a) * fr2;
    // filter
    const hp = s - o.lp - o.q * o.bp;
    o.bp += o.f * hp;
    o.lp += o.f * o.bp;
    // env
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
        o.active = false;
        break;
      }
    }
    out[i] += o.lp * o.env * o.vel;
  }
}

// ---- delay send (stereo) --------------------------------------------------------
export class DelaySend {
  constructor(sr) {
    this.sr = sr;
    const len = Math.floor(sr * 1.2);
    this.l = new Float32Array(len);
    this.r = new Float32Array(len);
    this.i = 0;
    this.time = 0.3;
    this.fb = 0.4;
    this.damp = 0.5;
    this.mix = 1;
    this.fl = 0;
    this.fr = 0;
  }

  set(timeMs, fb, damp, mix) {
    this.time = Math.min(1100, Math.max(1, timeMs)) / 1000;
    this.fb = fb;
    this.damp = damp;
    this.mix = mix;
  }

  process(inp, outL, outR, frames) {
    const dl = Math.floor(this.time * this.sr);
    const dr = Math.floor(this.time * this.sr * 1.0);
    const n = this.l.length;
    for (let i = 0; i < frames; i++) {
      const riL = (this.i - dl + n * 2) % n;
      const riR = (this.i - dr + n * 2) % n;
      const dL = this.l[riL];
      const dR = this.r[riR];
      this.fl += (1 - this.damp) * (dL - this.fl) + 0.0001 * (dL - this.fl);
      this.fr += (1 - this.damp) * (dR - this.fr) + 0.0001 * (dR - this.fr);
      const fL = this.fl * this.fb + inp[i] * 0.5;
      const fR = this.fr * this.fb + inp[i] * 0.5;
      // slight cross-feedback for width
      this.l[this.i] = fL + fR * 0.15;
      this.r[this.i] = fR + fL * 0.15;
      outL[i] += dL * this.mix;
      outR[i] += dR * this.mix;
      this.i = (this.i + 1) % n;
    }
  }
}

// ---- Freeverb-style reverb send ---------------------------------------------------
const COMB_T = [1116, 1188, 1277, 1356, 1422, 1491, 1617, 1688];
const AP_T = [225, 556, 441, 341];

export class ReverbSend {
  constructor(sr) {
    this.sr = sr;
    const scale = sr / 44100;
    this.combs = COMB_T.map((t) => ({
      buf: new Float32Array(Math.floor(t * scale) + 8),
      i: 0, filt: 0,
    }));
    this.aps = AP_T.slice(0, 2).map((t) => ({
      buf: new Float32Array(Math.floor(t * scale) + 8),
      i: 0,
    }));
    this.room = 0.8;
    this.damp = 0.5;
    this.inDamp = 0.3;
    this.mix = 0.5;
    this.inFilt = 0;
  }

  set(size, decay, damp, mix) {
    this.room = 0.7 + size * 0.28;
    this.damp = decay;
    this.inDamp = damp;
    this.mix = mix * 0.55;
  }

  process(inp, outL, outR, frames) {
    for (let i = 0; i < frames; i++) {
      this.inFilt += (1 - this.inDamp * 0.9) * (inp[i] - this.inFilt);
      const x = this.inFilt;
      let l = 0;
      let r = 0;
      for (let c = 0; c < 8; c++) {
        const cb = this.combs[c];
        const n = cb.buf.length;
        const y = cb.buf[cb.i];
        cb.filt += (1 - this.damp) * (y - cb.filt);
        cb.buf[cb.i] = x + cb.filt * this.room;
        cb.i = (cb.i + 1) % n;
        if (c % 2 === 0) l += y;
        else r += y;
      }
      l *= 0.25;
      r *= 0.25;
      // series allpasses per channel
      for (let a = 0; a < 2; a++) {
        const ap = this.aps[a];
        const n = ap.buf.length;
        const g = 0.5;
        const target = a === 0 ? l : r;
        const dy = ap.buf[ap.i];
        const o = -target * g + dy;
        ap.buf[ap.i] = target + dy * g;
        ap.i = (ap.i + 1) % n;
        if (a === 0) l = o;
        else r = o;
      }
      outL[i] += l * this.mix;
      outR[i] += r * this.mix;
    }
  }
}

// ---- chorus / phaser / flanger send -----------------------------------------------
export class ChorusSend {
  constructor(sr) {
    this.sr = sr;
    this.buf = new Float32Array(Math.floor(sr * 0.05));
    this.i = 0;
    this.type = 0;
    this.rate = 1;
    this.depth = 0.5;
    this.mix = 1;
    this.ph = 0;
    // phaser state: 4 one-sample allpass stages
    this.px = [0, 0, 0, 0];
    this.py = [0, 0, 0, 0];
    this.fb = 0;
  }

  set(type, rateHz, depth, mix) {
    this.type = type | 0;
    this.rate = rateHz;
    this.depth = depth;
    this.mix = mix;
  }

  process(inp, outL, outR, frames) {
    const n = this.buf.length;
    for (let i = 0; i < frames; i++) {
      this.ph += (this.rate / this.sr) * Math.PI * 2;
      if (this.ph > Math.PI * 2) this.ph -= Math.PI * 2;
      const lfo = Math.sin(this.ph);
      const x = inp[i];
      if (this.type === 1) {
        // phaser
        const a = 0.35 + 0.55 * (0.5 + 0.5 * lfo) * this.depth + 0.05;
        let s = x + this.fb * 0.55;
        for (let s2 = 0; s2 < 4; s2++) {
          const y = -a * s + this.px[s2] + a * this.py[s2];
          this.px[s2] = s;
          this.py[s2] = y;
          s = y;
        }
        this.fb = s;
        outL[i] += (x * (1 - 0.5 * this.mix) + s * 0.5 * this.mix) * 0.7;
        outR[i] += (x * (1 - 0.5 * this.mix) + s * 0.5 * this.mix) * 0.7;
      } else {
        // chorus / flanger: modulated delay
        const base = this.type === 2 ? 0.0012 : 0.007;
        const span = this.type === 2 ? 0.0018 * this.depth : 0.004 * this.depth;
        const dt = base + span * (0.5 + 0.5 * lfo);
        const di = Math.floor(dt * this.sr);
        const ri = (this.i - di + n * 2) % n;
        const d = this.buf[ri];
        const fbAmt = this.type === 2 ? 0.55 : 0.15;
        this.buf[this.i] = x + d * fbAmt;
        this.i = (this.i + 1) % n;
        const wet = this.type === 2 ? 0.8 * this.mix : 0.5 * this.mix;
        outL[i] += (x * (1 - wet) * 0.5 + d * wet) * 0.8;
        outR[i] += (x * (1 - wet) * 0.5 + d * wet * (0.5 + 0.5 * -lfo)) * 0.8;
      }
    }
  }
}

// ---- graph ---------------------------------------------------------------------------
export class Graph {
  constructor(sr, synth) {
    this.sr = sr;
    this.synth = synth; // WasmVoices or FallbackVoices
    this.synth.init(sr);
    this.bank = new SampleBank();
    this.voices = [];
    for (let i = 0; i < 16; i++) {
      this.voices.push({
        kind: 'off', gain: 1, pan: 0.5,
        sends: { cho: 0, dly: 0, rev: 0 }, smp: makeSmp(), track: i < 8 ? i : -1,
      });
    }
    this.trackGain = new Array(8).fill(1);
    this.trackMute = new Array(8).fill(false);
    this.master = 0.86;
    this.delay = new DelaySend(sr);
    this.reverb = new ReverbSend(sr);
    this.chorus = new ChorusSend(sr);
    this._tmp = new Float32Array(2048);
    this._dly = new Float32Array(2048);
    this._rev = new Float32Array(2048);
    this._cho = new Float32Array(2048);
    this._peaks = new Float32Array(9);
  }

  // snapshot: resolved note params (see audio-engine resolveVoice)
  noteOn(v, s) {
    const V = this.voices[v];
    this.choke(v);
    V.gain = s.gain;
    V.pan = s.pan;
    V.sends = { ...s.sends };
    if (s.kind === 'sample') {
      const slot = this.bank.get(s.slot);
      if (!slot) return;
      V.kind = 'sample';
      const o = V.smp;
      o.buf = slot.data;
      o.sr = slot.sr;
      const len = slot.data.length;
      o.start = Math.floor(s.start * (len - 1));
      o.end = Math.min(len - 1, o.start + Math.max(64, Math.floor(s.len * len)));
      o.pos = o.start;
      o.dir = 1;
      o.rate = s.rate;
      o.loopMode = s.loopMode;
      o.loopStart = o.start + Math.floor(s.loopStart * (o.end - o.start));
      o.loopEnd = Math.min(o.end, o.loopStart + Math.max(64, Math.floor(s.loopLen * (o.end - o.start))));
      o.att = s.att;
      o.dec = s.dec;
      o.sus = s.sus;
      o.rel = s.rel;
      o.vel = s.vel;
      const fc = Math.min(this.sr * 0.45, Math.max(20, s.cut));
      o.f = Math.min(0.99, (2 * fc) / this.sr);
      o.q = 2 * (1 - s.res * 0.96);
      o.lp = 0;
      o.bp = 0;
      o.env = 0;
      o.envst = 1;
      o.active = true;
    } else {
      V.kind = 'synth';
      const w = this.synth;
      w.setType(v, s.wtype);
      w.setParam(v, 0, s.cut);
      w.setParam(v, 1, s.res);
      w.setParam(v, 2, s.att);
      w.setParam(v, 3, s.dec);
      w.setParam(v, 4, s.sus);
      w.setParam(v, 5, s.rel);
      w.setParam(v, 6, s.vibr);
      w.setParam(v, 7, s.vibd);
      w.setParam(v, 8, s.fmidx || 0);
      w.setParam(v, 9, s.fmrat || 1);
      w.setParam(v, 10, s.det || 0);
      w.setParam(v, 11, s.sub || 0);
      w.setParam(v, 12, s.slide || 0);
      w.setParam(v, 13, s.pwm || 0.5);
      w.setParam(v, 14, s.fmfb || 0);
      w.noteOn(v, s.freq, s.vel);
    }
  }

  noteOff(v) {
    const V = this.voices[v];
    if (V.kind === 'synth') this.synth.noteOff(v);
    else if (V.kind === 'sample' && V.smp.active) {
      const o = V.smp;
      if (o.envst === 1 || o.envst === 2 || o.envst === 3) {
        o.relstart = o.env;
        o.envst = 4;
      }
    }
  }

  choke(v) {
    const V = this.voices[v];
    if (V.kind === 'synth') this.synth.choke(v);
    V.smp.active = false;
    V.smp.envst = 0;
    V.smp.env = 0;
    V.smp.lp = 0;
    V.smp.bp = 0;
    V.kind = 'off';
  }

  panic() {
    for (let v = 0; v < 16; v++) this.choke(v);
  }

  // live param on a sounding voice (id: 'freq','cut','res','gain','pan','cho','dly','rev','slide')
  liveParam(v, id, val) {
    const V = this.voices[v];
    if (V.kind === 'off') return;
    if (id === 'freq') {
      if (V.kind === 'synth') this.synth.setFreq(v, val);
      else V.smp.rate = val; // sample: val is rate multiplier here
    } else if (id === 'cut') {
      if (V.kind === 'synth') this.synth.setParam(v, 0, val);
      else {
        const fc = Math.min(this.sr * 0.45, Math.max(20, val));
        V.smp.f = Math.min(0.99, (2 * fc) / this.sr);
      }
    } else if (id === 'res') {
      if (V.kind === 'synth') this.synth.setParam(v, 1, val);
      else V.smp.q = 2 * (1 - val * 0.96);
    } else if (id === 'gain') V.gain = val;
    else if (id === 'pan') V.pan = Math.min(1, Math.max(0, val));
    else if (id === 'cho') V.sends.cho = val;
    else if (id === 'dly') V.sends.dly = val;
    else if (id === 'rev') V.sends.rev = val;
  }

  setMix(m) {
    // m: {tracks:[{vol,pan} x8], mutes[8], solos[8], master, delay{...}, reverb{...}, chorus{...}}
    const anySolo = m.solos.some(Boolean);
    for (let t = 0; t < 8; t++) {
      this.trackGain[t] = (m.tracks[t].vol / 255) * 1.0;
      this.trackMute[t] = m.mutes[t] || (anySolo && !m.solos[t]);
    }
    this.master = (m.master / 255) * 1.1;
    this.delay.set(m.delay.time, m.delay.fb, m.delay.damp, m.delay.mix / 255);
    this.reverb.set(m.reverb.size / 255, m.reverb.decay / 255, m.reverb.damp / 255, m.reverb.mix / 255);
    this.chorus.set(m.chorus.type, 0.05 + (m.chorus.rate / 255) * 9.95, m.chorus.depth / 255, m.chorus.mix / 255);
  }

  voiceCount() {
    let n = 0;
    for (let v = 0; v < 16; v++) {
      const V = this.voices[v];
      if (V.kind === 'synth' && this.synth.isActive(v)) n++;
      else if (V.kind === 'sample' && V.smp.active) n++;
    }
    return n;
  }

  render(outL, outR, frames) {
    const { _tmp, _dly, _rev, _cho } = this;
    outL.fill(0, 0, frames);
    outR.fill(0, 0, frames);
    _dly.fill(0, 0, frames);
    _rev.fill(0, 0, frames);
    _cho.fill(0, 0, frames);
    this._peaks.fill(0);
    for (let v = 0; v < 16; v++) {
      const V = this.voices[v];
      if (V.kind === 'off') continue;
      _tmp.fill(0, 0, frames);
      if (V.kind === 'synth') {
        if (!this.synth.isActive(v)) {
          V.kind = 'off';
          continue;
        }
        this.synth.renderTo(v, _tmp, frames);
        if (!this.synth.isActive(v) && v < 12) {
          // let tail finish: keep kind until silent (checked next block)
        }
      } else {
        renderSample(V.smp, _tmp, frames, this.sr);
        if (!V.smp.active) {
          V.kind = 'off';
          continue;
        }
      }
      let g = V.gain;
      let peakSlot = 8;
      if (V.track >= 0) {
        if (this.trackMute[V.track]) continue;
        g *= this.trackGain[V.track];
        peakSlot = V.track;
      }
      const pan = Math.min(1, Math.max(0, V.pan));
      const gl = Math.cos(pan * Math.PI * 0.5);
      const gr = Math.sin(pan * Math.PI * 0.5);
      let pk = 0;
      for (let i = 0; i < frames; i++) {
        const s = _tmp[i] * g;
        outL[i] += s * gl;
        outR[i] += s * gr;
        const a = Math.abs(s);
        if (a > pk) pk = a;
        if (V.sends.dly > 0.001) _dly[i] += s * V.sends.dly;
        if (V.sends.rev > 0.001) _rev[i] += s * V.sends.rev;
        if (V.sends.cho > 0.001) _cho[i] += s * V.sends.cho;
      }
      if (pk > this._peaks[peakSlot]) this._peaks[peakSlot] = pk;
    }
    this.delay.process(_dly, outL, outR, frames);
    this.reverb.process(_rev, outL, outR, frames);
    this.chorus.process(_cho, outL, outR, frames);
    // master + soft clip
    let mpk = 0;
    for (let i = 0; i < frames; i++) {
      let l = outL[i] * this.master;
      let r = outR[i] * this.master;
      l = l / (1 + 0.35 * Math.abs(l));
      r = r / (1 + 0.35 * Math.abs(r));
      outL[i] = l;
      outR[i] = r;
      const a = Math.abs(l) > Math.abs(r) ? Math.abs(l) : Math.abs(r);
      if (a > mpk) mpk = a;
    }
    this._peaks[8] = mpk;
    return this._peaks;
  }
}
