// M8 Virtual Teensy - audio engine + sequencer (main thread)
// ===========================================================
// Lookahead tick sequencer (24 PPQN) driving the AudioWorklet DSP
// graph with timestamped note/param events. Handles song/chain/phrase
// transport, tables, grooves, FX, Web MIDI, sampling and WAV bounce.

import {
  EMPTY, NOTE_OFF, TRACKS, STEPS, clamp,
  getChain, getPhrase, getInstrument, INSTRUMENT_TYPES,
} from './song.js';

const PPQ = 24; // ticks per beat
const LOOKAHEAD = 0.18;
const TICK_INTERVAL = 25;
const FM_RATIOS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 12, 16];

// param mappings (00-FF -> physical)
export const mapCut = (v) => 40 * Math.pow(450, v / 255);
export const mapAtt = (v) => 0.001 + Math.pow(v / 255, 2) * 2;
export const mapDec = (v) => 0.005 + Math.pow(v / 255, 2) * 4;
export const mapVibR = (v) => 0.1 + (v / 255) * 19.9;
export const mapVibD = (v) => (v / 255) * 2;
export const mapPluckDecay = (v) => 1 - Math.pow(10, -2 - (v / 255) * 3);

function newTrackRuntime() {
  return {
    active: false, songRow: 0, chainStep: 0, phraseStep: -1, ticksLeft: 0,
    inst: 0, loopCount: 0, phraseKey: '',
    table: null, held: { cut: -1, res: -1, shp: -1, cho: -1, dly: -1, rev: -1, mvo: -1, groove: 0 },
    pending: [], hop: null, midiNote: -1, midiCh: -1,
  };
}

export class VirtualAudio {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.prj = null;
    this.mutes = new Array(TRACKS).fill(false);
    this.solos = new Array(TRACKS).fill(false);
    this.mode = 'stop';
    this.playT = [];
    for (let i = 0; i < TRACKS; i++) {
      this.playT.push({
        active: false, songRow: 0, chain: EMPTY, chainStep: 0,
        phrase: EMPTY, phraseStep: 0, tableInst: -1, tableStep: -1, groove: 0,
      });
    }
    this.trackGrooves = new Array(TRACKS).fill(0);
    this._tracks = [];
    for (let i = 0; i < TRACKS; i++) this._tracks.push(newTrackRuntime());
    this._timer = 0;
    this._nextTick = 0;
    this._tickCount = 0;
    this._prevVoice = 8;
    this._sounding = new Set();
    this._activeInst = new Set();
    this._wasmOk = false;
    this._midi = null;
    this._midiProg = {};
    this._mixPoll = 0;
    this._bounceChunks = [];
    this._bounceRec = false;
    this._bounceSecs = 0;
    this._bounceSr = 44100;
    this.onScope = null;
    this.onLevels = null;
    this._soloChain = 0;
    this._soloPhrase = 0;
    this._soloTrack = 0;
  }

  get playing() {
    return this.mode !== 'stop';
  }

  setProject(prj) {
    this.prj = prj;
    this.pushMix();
  }

  async ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const workletUrl = new URL('./worklet.js', import.meta.url);
    await this.ctx.audioWorklet.addModule(workletUrl);
    this.node = new AudioWorkletNode(this.ctx, 'm8-engine', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    this.node.port.onmessage = (e) => this._onWorkletMsg(e.data);
    this.node.connect(this.ctx.destination);
    // load WASM DSP core
    try {
      const res = await fetch(new URL('../../dsp/voices.wasm', import.meta.url));
      const bytes = await res.arrayBuffer();
      const module = await WebAssembly.compile(bytes);
      this.node.port.postMessage({ t: 'wasm', module });
    } catch (e) {
      console.warn('WASM unavailable, using JS fallback DSP', e);
    }
    this.pushMix();
  }

  _onWorkletMsg(m) {
    if (!m || !m.t) return;
    if (m.t === 'wasm-ok') this._wasmOk = true;
    else if (m.t === 'scope' && this.onScope) this.onScope(m.peaks);
    else if (m.t === 'levels' && this.onLevels) this.onLevels(m.lv);
    else if (m.t === 'bounceChunk' && this._bounceRec) {
      this._bounceChunks.push(m);
      this._bounceSecs += m.L.length / this._bounceSr;
    } else if (m.t === 'bounceEnd' && this._bounceResolve) {
      const r = this._bounceResolve;
      this._bounceResolve = null;
      r();
    }
  }

  isWasm() {
    return this._wasmOk;
  }

  getVoiceCount() {
    return this._sounding.size;
  }

  getPlayheads() {
    return this.playT;
  }

  getTrackGrooves() {
    for (let t = 0; t < TRACKS; t++) this.trackGrooves[t] = this._tracks[t].held.groove || 0;
    return this.trackGrooves;
  }

  getActiveInst() {
    return this._activeInst;
  }

  setTrackState(t, mute, solo) {
    this.mutes[t] = mute;
    this.solos[t] = solo;
    this.pushMix();
  }

  setTrackInst(t, n) {
    this._tracks[t].inst = clamp(n, 0, 127);
  }

  pushMix() {
    if (!this.node || !this.prj) return;
    const mx = this.prj.mixer;
    const tracks = mx.tracks.map((tr, t) => ({
      vol: this._tracks[t].held.mvo >= 0 ? this._tracks[t].held.mvo : tr.vol,
      pan: tr.pan,
    }));
    this.node.port.postMessage({
      t: 'mix',
      mix: {
        tracks,
        mutes: [...this.mutes],
        solos: [...this.solos],
        master: mx.master,
        delay: { time: 5 + (mx.delay.time / 255) * 995, fb: (mx.delay.fb / 255) * 0.85, damp: mx.delay.damp / 255, mix: mx.delay.mix },
        reverb: { size: mx.reverb.size, decay: mx.reverb.decay, damp: mx.reverb.damp, mix: mx.reverb.mix },
        chorus: { type: mx.chorus.type, rate: mx.chorus.rate, depth: mx.chorus.depth, mix: mx.chorus.mix },
      },
    });
  }

  // ---- transport ------------------------------------------------------------
  _resetTracks() {
    for (let t = 0; t < TRACKS; t++) {
      const inst = this._tracks[t].inst;
      this._tracks[t] = newTrackRuntime();
      this._tracks[t].inst = inst;
      this.playT[t].active = false;
    }
    this._activeInst.clear();
  }

  playSong(fromRow = 0) {
    if (!this.ctx || !this.prj) return;
    this._resetTracks();
    this.mode = 'song';
    for (let t = 0; t < TRACKS; t++) {
      const tr = this._tracks[t];
      tr.active = true;
      tr.songRow = clamp(fromRow, 0, this.prj.song.rows.length - 1);
      tr.chainStep = 0;
      tr.phraseStep = -1;
      tr.ticksLeft = 0;
    }
    this._startClock();
    this.pushMix();
  }

  playChain(chain, track) {
    if (!this.ctx || !this.prj) return;
    this._resetTracks();
    this.mode = 'chain';
    this._soloChain = chain;
    this._soloTrack = track;
    const tr = this._tracks[track];
    tr.active = true;
    tr.chainStep = 0;
    tr.phraseStep = -1;
    tr.ticksLeft = 0;
    this._startClock();
    this.pushMix();
  }

  playPhrase(phrase, track) {
    if (!this.ctx || !this.prj) return;
    this._resetTracks();
    this.mode = 'phrase';
    this._soloPhrase = phrase;
    this._soloTrack = track;
    const tr = this._tracks[track];
    tr.active = true;
    tr.phraseStep = -1;
    tr.ticksLeft = 0;
    this._startClock();
    this.pushMix();
  }

  _startClock() {
    this._stopClock();
    this._nextTick = this.ctx.currentTime + 0.06;
    this._tickCount = 0;
    this._timer = setInterval(() => this._schedule(), TICK_INTERVAL);
  }

  _stopClock() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = 0;
    }
  }

  stop() {
    this.mode = 'stop';
    this._stopClock();
    if (this.node) this.node.port.postMessage({ t: 'panic', at: this.ctx ? this.ctx.currentTime : 0 });
    for (let t = 0; t < TRACKS; t++) {
      this.playT[t].active = false;
      this._midiOff(t);
      this._tracks[t].table = null;
      this._tracks[t].pending = [];
    }
    this._sounding.clear();
    this._activeInst.clear();
  }

  _schedule() {
    if (!this.ctx || this.mode === 'stop') return;
    if (this._nextTick < this.ctx.currentTime - 0.5) {
      this._nextTick = this.ctx.currentTime + 0.05; // recover from jank
    }
    const horizon = this.ctx.currentTime + LOOKAHEAD;
    let guard = 0;
    while (this._nextTick < horizon && guard++ < 512) {
      const tempo = clamp(this.prj.song.tempo || 120, 30, 250);
      const tickLen = 60 / tempo / PPQ;
      this._processTick(this._nextTick, tickLen);
      this._nextTick += tickLen;
      this._tickCount++;
    }
    if (++this._mixPoll >= 8) {
      this._mixPoll = 0;
      this.pushMix(); // pick up live mixer/sends edits
    }
  }

  // ---- tick ------------------------------------------------------------------
  _processTick(at, tickLen) {
    for (let t = 0; t < TRACKS; t++) this._tickTrack(t, at, tickLen);
  }

  _tickTrack(t, at, tickLen) {
    const tr = this._tracks[t];
    const ph = this.playT[t];
    if (!tr.active) {
      ph.active = false;
      return;
    }
    ph.active = true;
    // table
    if (tr.table) this._tableTick(t, tr, at);
    // delayed rows
    for (let i = tr.pending.length - 1; i >= 0; i--) {
      const p = tr.pending[i];
      p.left--;
      if (p.left <= 0) {
        tr.pending.splice(i, 1);
        this._processRow(t, tr, p.row, at, p.ts, tickLen);
      }
    }
    // scheduled sub-events
    // (retrig/arp/kill stored as {left, kind, ...})
    if (tr.sub) {
      for (let i = tr.sub.length - 1; i >= 0; i--) {
        const s = tr.sub[i];
        s.left--;
        if (s.left <= 0) {
          tr.sub.splice(i, 1);
          this._fireSub(t, tr, s, at, tickLen);
        }
      }
    }
    // step countdown
    tr.ticksLeft--;
    if (tr.ticksLeft > 0) return;
    // advance + trigger (skip empties, bounded)
    for (let i = 0; i < 64; i++) {
      const adv = this._advance(t, tr);
      if (!adv) {
        tr.active = false;
        ph.active = false;
        return;
      }
      if (adv.silent) {
        tr.ticksLeft = adv.ticks;
        this._updatePlayhead(t, tr, adv);
        return;
      }
      const ticks = this._stepTicks(t, tr, adv);
      if (ticks === 0) continue; // groove skip: advance again immediately
      tr.ticksLeft = ticks;
      this._updatePlayhead(t, tr, adv);
      this._triggerRow(t, tr, adv, at, tickLen);
      return;
    }
    tr.ticksLeft = 6; // safety
  }

  _advance(t, tr) {
    if (this.mode === 'phrase') {
      if (tr.hop) {
        tr.phraseStep = clamp(tr.hop.row, 0, 15);
        tr.hop = null;
      } else {
        tr.phraseStep = (tr.phraseStep + 1) % STEPS;
      }
      const phrase = this._soloPhrase;
      return { songRow: -1, chain: EMPTY, chainStep: 0, phrase, phraseStep: tr.phraseStep, ts: 0 };
    }
    if (this.mode === 'chain') {
      const ch = getChain(this.prj, this._soloChain);
      if (tr.hop) {
        tr.chainStep++;
        tr.phraseStep = clamp(tr.hop.row, 0, 15);
        tr.hop = null;
      } else {
        tr.phraseStep++;
        if (tr.phraseStep >= STEPS) {
          tr.phraseStep = 0;
          tr.chainStep++;
        }
      }
      if (!ch || tr.chainStep >= STEPS || ch.ph[tr.chainStep] === EMPTY) {
        tr.chainStep = 0;
        tr.phraseStep = 0;
        if (!ch || ch.ph[0] === EMPTY) return { silent: true, ticks: 6, songRow: -1, chain: this._soloChain, chainStep: 0, phrase: EMPTY, phraseStep: 0, ts: 0 };
      }
      return {
        songRow: -1, chain: this._soloChain, chainStep: tr.chainStep,
        phrase: ch.ph[tr.chainStep], phraseStep: tr.phraseStep, ts: ch.ts[tr.chainStep] || 0,
      };
    }
    // song mode
    if (tr.hop) {
      // HOP: next phrase in song order at row Y
      const nxt = this._nextPhraseInSong(t, tr);
      tr.hop = null;
      if (!nxt) return { silent: true, ticks: 6, songRow: tr.songRow, chain: EMPTY, chainStep: 0, phrase: EMPTY, phraseStep: 0, ts: 0 };
      tr.songRow = nxt.songRow;
      tr.chainStep = nxt.chainStep;
      tr.phraseStep = clamp(nxt.row, 0, 15);
      return { songRow: tr.songRow, chain: nxt.chain, chainStep: tr.chainStep, phrase: nxt.phrase, phraseStep: tr.phraseStep, ts: nxt.ts };
    }
    tr.phraseStep++;
    if (tr.phraseStep >= STEPS) {
      tr.phraseStep = 0;
      tr.chainStep++;
    }
    // resolve current chain; skip empties by moving song rows
    for (let i = 0; i < 300; i++) {
      const rows = this.prj.song.rows;
      if (tr.songRow >= rows.length) tr.songRow = 0;
      const chain = rows[tr.songRow].ch[t];
      if (chain === EMPTY) {
        tr.songRow++;
        if (tr.songRow >= rows.length) tr.songRow = 0;
        tr.chainStep = 0;
        tr.phraseStep = 0;
        continue;
      }
      const ch = getChain(this.prj, chain);
      if (!ch || tr.chainStep >= STEPS || ch.ph[tr.chainStep] === EMPTY) {
        tr.songRow++;
        if (tr.songRow >= rows.length) tr.songRow = 0;
        tr.chainStep = 0;
        tr.phraseStep = 0;
        continue;
      }
      return {
        songRow: tr.songRow, chain, chainStep: tr.chainStep,
        phrase: ch.ph[tr.chainStep], phraseStep: tr.phraseStep, ts: ch.ts[tr.chainStep] || 0,
      };
    }
    return { silent: true, ticks: 6, songRow: tr.songRow, chain: EMPTY, chainStep: 0, phrase: EMPTY, phraseStep: 0, ts: 0 };
  }

  _nextPhraseInSong(t, tr) {
    // next phrase after current (chain order, then song order)
    const rows = this.prj.song.rows;
    let songRow = tr.songRow;
    let chainStep = tr.chainStep + 1;
    for (let i = 0; i < 300; i++) {
      if (songRow >= rows.length) songRow = 0;
      const chain = rows[songRow].ch[t];
      if (chain === EMPTY) {
        songRow++;
        chainStep = 0;
        continue;
      }
      const ch = getChain(this.prj, chain);
      if (!ch || chainStep >= STEPS || ch.ph[chainStep] === EMPTY) {
        songRow++;
        chainStep = 0;
        continue;
      }
      return { songRow, chain, chainStep, phrase: ch.ph[chainStep], ts: ch.ts[chainStep] || 0, row: tr.hop ? tr.hop.row : 0 };
    }
    return null;
  }

  _stepTicks(t, tr, adv) {
    if (adv.phrase === EMPTY) return 6;
    const g = clamp(tr.held.groove || 0, 0, 15);
    const gr = this.prj.grooves[g];
    return gr ? gr.steps[adv.phraseStep] || 0 : 6;
  }

  _updatePlayhead(t, tr, adv) {
    const ph = this.playT[t];
    ph.songRow = adv.songRow;
    ph.chain = adv.chain;
    ph.chainStep = adv.chainStep;
    ph.phrase = adv.phrase;
    ph.phraseStep = adv.phraseStep;
    ph.groove = tr.held.groove || 0;
    // NTH loop counting
    const key = `${adv.chain}:${adv.chainStep}:${adv.phrase}`;
    if (key !== tr.phraseKey) {
      tr.phraseKey = key;
      tr.loopCount = 0;
    } else if (adv.phraseStep === 0) {
      tr.loopCount++;
    }
  }

  _triggerRow(t, tr, adv, at, tickLen) {
    if (adv.phrase === EMPTY) return;
    const phr = getPhrase(this.prj, adv.phrase);
    if (!phr) return;
    const row = phr.rows[adv.phraseStep];
    // NTH gate
    for (const fx of row.fx) {
      if (fx.c === 'NTH' && !this._nthPass(tr, fx.v)) return;
    }
    // DEL: defer row
    for (const fx of row.fx) {
      if (fx.c === 'DEL' && fx.v > 0) {
        tr.pending.push({ left: fx.v, row: JSON.parse(JSON.stringify(row)), ts: adv.ts });
        return;
      }
    }
    this._processRow(t, tr, row, at, adv.ts, tickLen);
  }

  _nthPass(tr, v) {
    const x = v >> 4;
    const y = v & 15;
    if (x < 2) return true;
    return tr.loopCount % x === y % x;
  }

  // ---- row processing ----------------------------------------------------------
  _processRow(t, tr, row, at, ts, tickLen) {
    const mods = {
      vol: -1, pit: 0, pan: -1, tun: 0, ins: -1, slide: 0,
      vib: null, arp: null, kil: -1, ret: null, tbl: -1, tic: -1,
    };
    for (const fx of row.fx) {
      if (!fx.c) continue;
      this._applyFx(t, tr, fx, mods, at);
    }
    if (tr.hop && tr.hop.stop) {
      // HOPFF: stop track now
      tr.hop = null;
      this._stopTrack(t, at);
      return;
    }
    if (row.n === EMPTY) return;
    if (row.n === NOTE_OFF) {
      this._noteOff(t, at);
      return;
    }
    let inst = row.i !== EMPTY ? row.i : tr.inst;
    if (mods.ins >= 0) inst = mods.ins;
    tr.inst = inst;
    const ins = getInstrument(this.prj, inst);
    if (!ins) return;
    if (ins.type === 'MID') {
      this._midiTrigger(t, tr, ins, row, at, tickLen, mods, ts);
    } else {
      const snap = this._resolveVoice(t, tr, ins, inst, row.n, row.v / 255, mods, ts, tickLen);
      this._post({ t: 'note', at, v: t, s: snap });
      this._sounding.add(t);
      this._activeInst.add(inst);
      this._launchTable(t, tr, ins, inst, mods, snap);
    }
    // RET / ARP / KIL schedules
    if (!tr.sub) tr.sub = [];
    if (mods.ret) {
      const x = Math.max(1, mods.ret.x);
      const y = mods.ret.y;
      const stepTicks = Math.max(1, tr.ticksLeft);
      const count = y === 0 ? Math.floor(stepTicks / x) : y;
      for (let i = 1; i <= count; i++) {
        tr.sub.push({ left: i * x, kind: 'ret', row: JSON.parse(JSON.stringify(row)), ts, mods: { ...mods, ret: null, arp: null } });
      }
    }
    if (mods.arp) {
      const stepTicks = Math.max(1, tr.ticksLeft);
      const seq = [0, mods.arp.x, mods.arp.y];
      for (let i = 1; i < stepTicks; i++) {
        tr.sub.push({ left: i, kind: 'arp', off: seq[i % 3], row: JSON.parse(JSON.stringify(row)), ts, mods: { ...mods, ret: null, arp: null } });
      }
    }
    if (mods.kil >= 0) {
      if (mods.kil === 0) this._noteOff(t, at);
      else tr.sub.push({ left: mods.kil, kind: 'kill' });
    }
  }

  _fireSub(t, tr, s, at, tickLen) {
    if (s.kind === 'kill') {
      this._noteOff(t, at);
      return;
    }
    const row = s.row;
    if (row.n === EMPTY || row.n === NOTE_OFF) return;
    let inst = row.i !== EMPTY ? row.i : tr.inst;
    if (s.mods.ins >= 0) inst = s.mods.ins;
    const ins = getInstrument(this.prj, inst);
    if (!ins || ins.type === 'MID') return;
    const mods = { ...s.mods };
    if (s.kind === 'arp') mods.pit += s.off;
    const snap = this._resolveVoice(t, tr, ins, inst, row.n, row.v / 255, mods, s.ts, tickLen);
    this._post({ t: 'note', at, v: t, s: snap });
  }

  _applyFx(t, tr, fx, mods, at) {
    const v = fx.v;
    switch (fx.c) {
      case 'TPO': this.prj.song.tempo = clamp(Math.round(v / 2), 30, 250); break;
      case 'GRV': tr.held.groove = clamp(v, 0, 15); break;
      case 'HOP':
        if (v === 0xff) tr.hop = { stop: true };
        else tr.hop = { row: v & 0x0f };
        break;
      case 'KIL': mods.kil = v; break;
      case 'RET': mods.ret = { x: v >> 4, y: v & 15 }; break;
      case 'TBL': mods.tbl = clamp(v, 0, 127); break;
      case 'TIC': mods.tic = clamp(v, 1, 32); break;
      case 'VOL': mods.vol = v; break;
      case 'PIT': mods.pit = v - 128; break;
      case 'PAN': mods.pan = v / 255; break;
      case 'PSL': mods.slide = v; break;
      case 'VIB': mods.vib = { r: v >> 4, d: v & 15 }; break;
      case 'ARP': mods.arp = { x: v >> 4, y: v & 15 }; break;
      case 'TUN': mods.tun = v - 128; break;
      case 'INS': mods.ins = clamp(v, 0, 127); break;
      case 'CUT': tr.held.cut = v; break;
      case 'RES': tr.held.res = v; break;
      case 'SHP': tr.held.shp = v; break;
      case 'CHO': tr.held.cho = v; break;
      case 'DLY': tr.held.dly = v; break;
      case 'REV': tr.held.rev = v; break;
      case 'MVO': tr.held.mvo = v; this.pushMix(); break;
      default: break;
    }
  }

  _noteOff(t, at) {
    this._post({ t: 'off', at, v: t });
    this._sounding.delete(t);
    this._tracks[t].table = null;
    this._midiOff(t, at);
  }

  _stopTrack(t, at) {
    this._post({ t: 'choke', at: at || (this.ctx ? this.ctx.currentTime : 0), v: t });
    this._sounding.delete(t);
    this._tracks[t].active = false;
    this._tracks[t].table = null;
    this.playT[t].active = false;
    this._midiOff(t);
  }

  _post(m) {
    if (this.node) this.node.port.postMessage(m);
  }

  // ---- voice resolution ----------------------------------------------------------
  _resolveVoice(t, tr, ins, instNum, note, vel01, mods, ts, tickLen) {
    const P = ins.p;
    const songTs = this.prj.song.transpose || 0;
    const semi = note - 69 + songTs + (ts || 0) + (P.PIT || 0) + mods.pit;
    const freq = 440 * Math.pow(2, semi / 12) * Math.pow(2, mods.tun / 1200);
    const held = tr.held;
    const mx = this.prj.mixer.tracks[t];
    const cutV = held.cut >= 0 ? held.cut : P.CUT !== undefined ? P.CUT : 255;
    const resV = held.res >= 0 ? held.res : P.RES !== undefined ? P.RES : 0;
    const choV = held.cho >= 0 ? held.cho : clamp((P.CHO || 0) + (mx.cho || 0), 0, 255);
    const dlyV = held.dly >= 0 ? held.dly : clamp((P.DEL || 0) + (mx.del || 0), 0, 255);
    const revV = held.rev >= 0 ? held.rev : clamp((P.REV || 0) + (mx.rev || 0), 0, 255);
    const gain = vel01 * (mods.vol >= 0 ? mods.vol / 255 : 1) * ((P.VOL !== undefined ? P.VOL : 200) / 255);
    const pan = clamp01((P.PAN !== undefined ? P.PAN / 255 : 0.5) + ((mx.pan || 128) - 128) / 255 + (mods.pan >= 0 ? mods.pan - 0.5 : 0));
    const vib = mods.vib
      ? { r: 1 + (mods.vib.r / 15) * 19, d: (mods.vib.d / 15) * 2 }
      : { r: mapVibR(P.VIB || 0), d: mapVibD(P.VBD || 0) };
    const common = {
      cut: mapCut(cutV), res: resV / 255,
      att: mapAtt(P.ATT || 0), dec: mapDec(P.DEC || 0), sus: (P.SUS !== undefined ? P.SUS : 255) / 255, rel: mapDec(P.REL || 0),
      vel: clamp01(vel01), gain: clamp01(gain * 1.2), pan,
      sends: { cho: choV / 255, dly: dlyV / 255, rev: revV / 255 },
      vibr: vib.r, vibd: vib.d, slide: (mods.slide || 0) * (tickLen || 0.02),
    };
    if (ins.type === 'SMP') {
      return {
        kind: 'sample', slot: P.SMP || 0,
        rate: Math.pow(2, (note - 60 + songTs + (ts || 0) + (P.PIT || 0) + mods.pit) / 12) * Math.pow(2, mods.tun / 1200),
        start: sliceStart(P, note), len: sliceLen(P, note),
        loopMode: P.LOP || 0, loopStart: (P.LPS || 0) / 255, loopLen: (P.LPL || 255) / 255,
        ...common,
      };
    }
    let wtype = 1;
    let fmidx = 0;
    let fmrat = 1;
    let fmfb = 0;
    let det = 0;
    let sub = 0;
    let pwm = 0.5;
    let cut = common.cut;
    let res = common.res;
    const shpV = held.shp >= 0 ? held.shp & 7 : null;
    if (ins.type === 'WAV') {
      const s = shpV !== null ? shpV : P.SHP || 0;
      wtype = s + 1;
      pwm = (P.PWM || 50) / 100;
      if (s === 5) {
        fmidx = (resV / 255) * 6;
        fmrat = 0.5 + ((P.PWM || 50) / 100) * 3.5;
      }
      if (s === 7) {
        cut = (cutV / 255) * 0.9;
        res = mapPluckDecay(resV);
      }
    } else if (ins.type === 'FM') {
      wtype = 6;
      fmrat = FM_RATIOS[P.RAT || 0];
      fmidx = ((P.IDX || 0) / 255) * 8;
      fmfb = ((P.FB || 0) / 255) * 0.9;
    } else if (ins.type === 'MAC') {
      const s = shpV !== null ? shpV : P.MOD || 0;
      wtype = s + 1;
      cut = mapCut(P.TMB !== undefined ? P.TMB : 160);
      res = (P.COL || 0) / 255;
      if (s === 5) {
        fmidx = ((P.COL || 0) / 255) * 8;
        fmrat = 1;
      }
      if (s === 7) {
        cut = ((P.TMB || 0) / 255) * 0.9;
        res = mapPluckDecay(P.COL || 0);
      }
    } else if (ins.type === 'HYP') {
      const s = shpV !== null ? shpV & 3 : P.SHP || 0;
      wtype = [1, 2, 7, 4][s];
      det = P.DET || 0;
      sub = (P.SUB || 0) / 255;
    }
    return { kind: 'synth', wtype, freq, fmidx, fmrat, fmfb, det, sub, pwm, cut, res, ...common };
  }
}

function sliceStart(P, note) {
  if (P.SLI > 0) return (note % P.SLI) / P.SLI;
  return (P.STA || 0) / 255;
}

function sliceLen(P, note) {
  if (P.SLI > 0) return 1 / P.SLI;
  return (P.LEN || 255) / 255;
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
