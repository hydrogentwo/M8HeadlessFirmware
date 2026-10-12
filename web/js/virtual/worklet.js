// M8 Virtual Teensy - AudioWorklet processor
// ==========================================
// Owns the DSP Graph, applies timestamped events from the sequencer,
// and reports scope/levels/bounce audio back to the main thread.

import { Graph, WasmVoices } from './dsp-graph.js';
import { FallbackVoices } from './dsp-fallback.js';

const BLOCK = 128;

class M8Processor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.graph = new Graph(sampleRate, new FallbackVoices());
    this.queue = [];
    this.scopeAcc = [];
    this.scopeTick = 0;
    this.levelTick = 0;
    this.bouncing = false;
    this.bounceL = [];
    this.bounceR = [];
    this.bounceLen = 0;
    this.port.onmessage = (e) => this._onMsg(e.data);
    this.port.postMessage({ t: 'ready' });
  }

  _onMsg(m) {
    if (!m || !m.t) return;
    if (m.t === 'wasm' && m.module) {
      try {
        const inst = new WebAssembly.Instance(m.module, {});
        this.graph.panic();
        this.graph.synth = new WasmVoices(inst);
        this.graph.synth.init(sampleRate);
        this.port.postMessage({ t: 'wasm-ok' });
      } catch (err) {
        this.port.postMessage({ t: 'wasm-fail', error: String(err) });
      }
      return;
    }
    if (m.t === 'mix') {
      this.graph.setMix(m.mix);
      return;
    }
    if (m.t === 'sample') {
      this.graph.bank.set(m.slot, { sr: m.sr, data: m.data });
      return;
    }
    if (m.t === 'rmsample') {
      this.graph.bank.remove(m.slot);
      return;
    }
    if (m.t === 'bounce') {
      if (m.on) this._bounceStart();
      else this._bounceStop();
      return;
    }
    // timestamped voice events -> queue
    this.queue.push(m);
    // keep queue roughly ordered (insertion is near-ordered; cheap fix)
    if (this.queue.length > 1) {
      const q = this.queue;
      for (let i = q.length - 1; i > 0 && q[i].at < q[i - 1].at; i--) {
        const tmp = q[i];
        q[i] = q[i - 1];
        q[i - 1] = tmp;
      }
    }
  }

  _apply(m) {
    const g = this.graph;
    switch (m.t) {
      case 'note':
        g.noteOn(m.v, m.s);
        break;
      case 'off':
        g.noteOff(m.v);
        break;
      case 'choke':
        g.choke(m.v);
        break;
      case 'param':
        g.liveParam(m.v, m.id, m.val);
        break;
      case 'panic':
        g.panic();
        break;
      default:
        break;
    }
  }

  _bounceStart() {
    this.bouncing = true;
    this.bounceL = [];
    this.bounceR = [];
    this.bounceLen = 0;
  }

  _bounceChunk() {
    // concatenate + post 1s-ish chunks
    const n = this.bounceLen;
    if (!n) return;
    const L = new Float32Array(n);
    const R = new Float32Array(n);
    let o = 0;
    for (const c of this.bounceL) {
      L.set(c, o);
      o += c.length;
    }
    o = 0;
    for (const c of this.bounceR) {
      R.set(c, o);
      o += c.length;
    }
    this.port.postMessage({ t: 'bounceChunk', L, R }, [L.buffer, R.buffer]);
    this.bounceL = [];
    this.bounceR = [];
    this.bounceLen = 0;
  }

  _bounceStop() {
    if (!this.bouncing) return;
    this.bouncing = false;
    this._bounceChunk();
    this.port.postMessage({ t: 'bounceEnd' });
  }

  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0];
    const R = out[1] || out[0];
    const blockEnd = currentTime + BLOCK / sampleRate;
    // apply due events (<=3ms early at most: applied at block start)
    while (this.queue.length && this.queue[0].at <= blockEnd + 0.002) {
      this._apply(this.queue.shift());
    }
    // drop Ancient events (late > 250ms: transport stopped mid-flight)
    while (this.queue.length && this.queue[0].at < currentTime - 0.25) {
      this.queue.shift();
    }
    const peaks = this.graph.render(L, R, BLOCK);
    // scope: signed decimation of master mono
    this.scopeTick++;
    if (this.scopeTick >= 10) {
      this.scopeTick = 0;
      const p = new Float32Array(120);
      for (let i = 0; i < 120; i++) {
        const s = L[Math.floor((i / 120) * BLOCK)] + R[Math.floor((i / 120) * BLOCK)];
        p[i] = s * 0.5;
      }
      this.port.postMessage({ t: 'scope', peaks: p }, [p.buffer]);
    }
    this.levelTick++;
    if (this.levelTick >= 20) {
      this.levelTick = 0;
      const lv = Float32Array.from(peaks);
      this.port.postMessage({ t: 'levels', lv }, [lv.buffer]);
    }
    if (this.bouncing) {
      this.bounceL.push(Float32Array.from(L));
      this.bounceR.push(Float32Array.from(R));
      this.bounceLen += BLOCK;
      if (this.bounceLen >= sampleRate) this._bounceChunk();
    }
    return true;
  }
}

registerProcessor('m8-engine', M8Processor);
