// M8 Virtual Teensy - audio extras: tables, MIDI, previews, bounce
// =================================================================
// Prototype extensions for VirtualAudio (see audio-engine.js).

import {
  EMPTY, TRACKS, clamp,
  getInstrument,
} from './song.js';
import { mapCut, mapAtt, mapDec, mapVibR, mapVibD, mapPluckDecay } from './audio-engine.js';

const FM_RATIOS = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 12, 16];

export function installAudioExtras(VirtualAudio) {
  const P = VirtualAudio.prototype;

  // ---- tables -------------------------------------------------------------------
  P._launchTable = function (t, tr, ins, instNum, mods, snap) {
    const tblInst = mods.tbl >= 0 ? mods.tbl : instNum;
    const tbIns = getInstrument(this.prj, tblInst);
    if (!tbIns) return;
    const tb = tbIns.table;
    let used = false;
    for (const r of tb.rows) {
      if (r.n !== EMPTY || r.v !== EMPTY || r.fx.some((f) => f.c)) {
        used = true;
        break;
      }
    }
    if (!used) return;
    tr.table = {
      inst: tblInst, step: 0,
      tic: mods.tic >= 0 ? mods.tic : tb.tic || 1,
      ticLeft: mods.tic >= 0 ? mods.tic : tb.tic || 1,
      hopLeft: 0,
      baseFreq: snap.freq || 440, baseRate: snap.rate || 1, baseGain: snap.gain,
      isSample: snap.kind === 'sample', snap,
    };
    this.playT[t].tableInst = tblInst;
    this.playT[t].tableStep = 0;
  };

  P._tableTick = function (t, tr, at) {
    const tb = tr.table;
    tb.ticLeft--;
    if (tb.ticLeft > 0) return;
    tb.ticLeft = tb.tic;
    const ins = getInstrument(this.prj, tb.inst);
    if (!ins) {
      tr.table = null;
      return;
    }
    const row = ins.table.rows[tb.step];
    let semi = row.n !== EMPTY ? row.n : 0;
    let cents = 0;
    let gainMul = row.v !== EMPTY ? row.v / 255 : 1;
    let jumped = false;
    for (const fx of row.fx) {
      if (!fx.c) continue;
      const v = fx.v;
      switch (fx.c) {
        case 'PIT': semi += v - 128; break;
        case 'TUN': cents += v - 128; break;
        case 'VOL': gainMul *= v / 255; break;
        case 'PAN': this._post({ t: 'param', at, v: t, id: 'pan', val: v / 255 }); break;
        case 'CUT': this._post({ t: 'param', at, v: t, id: 'cut', val: mapCut(v) }); break;
        case 'RES': this._post({ t: 'param', at, v: t, id: 'res', val: v / 255 }); break;
        case 'CHO': this._post({ t: 'param', at, v: t, id: 'cho', val: v / 255 }); break;
        case 'DLY': this._post({ t: 'param', at, v: t, id: 'dly', val: v / 255 }); break;
        case 'REV': this._post({ t: 'param', at, v: t, id: 'rev', val: v / 255 }); break;
        case 'KIL':
          if (!tr.sub) tr.sub = [];
          if (v === 0) this._noteOff(t, at);
          else tr.sub.push({ left: v, kind: 'kill' });
          break;
        case 'TIC': tb.tic = clamp(v, 1, 32); break;
        case 'TBL': {
          const ni = getInstrument(this.prj, clamp(v, 0, 127));
          if (ni) {
            tb.inst = clamp(v, 0, 127);
            tb.step = 0;
            jumped = true;
            this.playT[t].tableInst = tb.inst;
          }
          break;
        }
        case 'HOP': {
          const x = v >> 4;
          const y = v & 15;
          if (x > 0) {
            if (tb.hopLeft === 0) tb.hopLeft = x;
            tb.hopLeft--;
            if (tb.hopLeft > 0) {
              tb.step = clamp(y, 0, 15);
              jumped = true;
            }
          }
          break;
        }
        case 'RET': {
          // retrigger current note
          this._post({ t: 'note', at, v: t, s: tb.snap });
          break;
        }
        default: break; // DEL/TPO/GRV/ARP/PSL/VIB/INS/MVO/SHP/NTH: no table effect
      }
    }
    if (!jumped) {
      const f = tb.baseFreq * Math.pow(2, semi / 12) * Math.pow(2, cents / 1200);
      if (tb.isSample) {
        this._post({ t: 'param', at, v: t, id: 'freq', val: tb.baseRate * Math.pow(2, semi / 12) * Math.pow(2, cents / 1200) });
      } else {
        this._post({ t: 'param', at, v: t, id: 'freq', val: f });
      }
      this._post({ t: 'param', at, v: t, id: 'gain', val: Math.min(1, tb.baseGain * gainMul) });
      tb.step = (tb.step + 1) % 16;
    }
    this.playT[t].tableStep = tb.step;
  };

  // ---- MIDI -----------------------------------------------------------------------
  P._midiOut = async function () {
    if (this._midi !== null) return this._midi;
    try {
      if (!navigator.requestMIDIAccess) {
        this._midi = undefined;
        return undefined;
      }
      const acc = await navigator.requestMIDIAccess();
      const outs = [...acc.outputs.values()];
      this._midi = outs.length ? outs[0] : undefined;
      if (this._midi) this._midiProg = {};
    } catch (e) {
      this._midi = undefined;
    }
    return this._midi;
  };

  P._midiSend = function (bytes, at) {
    const delay = this.ctx && at ? Math.max(0, (at - this.ctx.currentTime) * 1000) : 0;
    this._midiOut().then((out) => {
      if (!out) return;
      setTimeout(() => {
        try {
          out.send(bytes);
        } catch (e) { /* ignore */ }
      }, delay);
    });
  };

  P._midiTrigger = function (t, tr, ins, row, at, tickLen, mods, ts) {
    const P2 = ins.p;
    const ch = clamp((P2.CHN || 1) - 1, 0, 15);
    const key = 'ch' + ch;
    if (!this._midiProg[key] || this._midiProg[key].bank !== P2.BNK || this._midiProg[key].prog !== P2.PRG) {
      this._midiProg[key] = { bank: P2.BNK, prog: P2.PRG };
      this._midiSend([0xb0 | ch, 0, (P2.BNK || 0) >> 7], at);
      this._midiSend([0xb0 | ch, 32, (P2.BNK || 0) & 0x7f], at);
      this._midiSend([0xc0 | ch, (P2.PRG || 0) & 0x7f], at);
    }
    this._midiOff(t, at);
    const songTs = this.prj.song.transpose || 0;
    const note = clamp(row.n + songTs + (ts || 0) + mods.pit, 0, 127);
    const vel = clamp(Math.round(((mods.vol >= 0 ? mods.vol : row.v) / 255) * ((P2.VOL || 200) / 255) * 127), 1, 127);
    this._midiSend([0x90 | ch, note, vel], at);
    tr.midiNote = note;
    tr.midiCh = ch;
    this._activeInst.add(tr.inst);
    if (mods.kil === 0) this._midiOff(t, at);
    else if (mods.kil > 0) {
      if (!tr.sub) tr.sub = [];
      tr.sub.push({ left: mods.kil, kind: 'kill' });
    }
  };

  P._midiOff = function (t, at) {
    const tr = this._tracks[t];
    if (!tr || tr.midiNote < 0) return;
    this._midiSend([0x80 | (tr.midiCh || 0), tr.midiNote, 0], at);
    tr.midiNote = -1;
  };

  // ---- previews ---------------------------------------------------------------------
  P._resolvePreview = function (ins, note, vel01) {
    const P2 = ins.p;
    const gain = vel01 * ((P2.VOL !== undefined ? P2.VOL : 200) / 255);
    const pan = P2.PAN !== undefined ? P2.PAN / 255 : 0.5;
    const common = {
      cut: mapCut(P2.CUT !== undefined ? P2.CUT : 255),
      res: (P2.RES || 0) / 255,
      att: mapAtt(P2.ATT || 0), dec: mapDec(P2.DEC || 0),
      sus: (P2.SUS !== undefined ? P2.SUS : 255) / 255, rel: mapDec(P2.REL || 0),
      vel: vel01, gain: Math.min(1, gain * 1.2), pan,
      sends: { cho: (P2.CHO || 0) / 255, dly: (P2.DEL || 0) / 255, rev: (P2.REV || 0) / 255 },
      vibr: mapVibR(P2.VIB || 0), vibd: mapVibD(P2.VBD || 0), slide: 0,
    };
    if (ins.type === 'SMP') {
      return {
        kind: 'sample', slot: P2.SMP || 0,
        rate: Math.pow(2, (note - 60 + (P2.PIT || 0)) / 12),
        start: (P2.STA || 0) / 255, len: (P2.LEN || 255) / 255,
        loopMode: P2.LOP || 0, loopStart: (P2.LPS || 0) / 255, loopLen: (P2.LPL || 255) / 255,
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
    if (ins.type === 'WAV') {
      const s = P2.SHP || 0;
      wtype = s + 1;
      pwm = (P2.PWM || 50) / 100;
      if (s === 5) {
        fmidx = ((P2.RES || 0) / 255) * 6;
        fmrat = 0.5 + ((P2.PWM || 50) / 100) * 3.5;
      }
      if (s === 7) {
        cut = ((P2.CUT || 0) / 255) * 0.9;
        res = mapPluckDecay(P2.RES || 0);
      }
    } else if (ins.type === 'FM') {
      wtype = 6;
      fmrat = FM_RATIOS[P2.RAT || 0];
      fmidx = ((P2.IDX || 0) / 255) * 8;
      fmfb = ((P2.FB || 0) / 255) * 0.9;
    } else if (ins.type === 'MAC') {
      const s = P2.MOD || 0;
      wtype = s + 1;
      cut = mapCut(P2.TMB !== undefined ? P2.TMB : 160);
      res = (P2.COL || 0) / 255;
      if (s === 5) {
        fmidx = ((P2.COL || 0) / 255) * 8;
        fmrat = 1;
      }
      if (s === 7) {
        cut = ((P2.TMB || 0) / 255) * 0.9;
        res = mapPluckDecay(P2.COL || 0);
      }
    } else if (ins.type === 'HYP') {
      const s = P2.SHP || 0;
      wtype = [1, 2, 7, 4][s];
      det = P2.DET || 0;
      sub = (P2.SUB || 0) / 255;
    }
    const freq = 440 * Math.pow(2, (note - 69 + (P2.PIT || 0)) / 12);
    return { kind: 'synth', wtype, freq, fmidx, fmrat, fmfb, det, sub, pwm, cut, res, ...common };
  };

  P.previewNote = function (instNum, note, vel = 100) {
    if (!this.ctx || !this.node || !this.prj) return;
    const ins = getInstrument(this.prj, instNum);
    if (!ins) return;
    if (ins.type === 'MID') {
      const ch = clamp((ins.p.CHN || 1) - 1, 0, 15);
      this._midiOffPreview();
      this._midiSend([0x90 | ch, clamp(note, 0, 127), clamp(vel, 1, 127)]);
      this._prevMidi = { ch, note };
      return;
    }
    const v = this._prevVoice;
    this._prevVoice = this._prevVoice >= 11 ? 8 : this._prevVoice + 1;
    const at = this.ctx.currentTime + 0.005;
    const s = this._resolvePreview(ins, note, vel / 127);
    this._post({ t: 'note', at, v, s });
    this._sounding.add(v);
  };

  P.previewOff = function () {
    if (!this.node || !this.ctx) return;
    const at = this.ctx.currentTime;
    for (let v = 8; v <= 11; v++) {
      this._post({ t: 'off', at, v });
      this._sounding.delete(v);
    }
    this._midiOffPreview();
  };

  P._midiOffPreview = function () {
    if (this._prevMidi) {
      this._midiSend([0x80 | this._prevMidi.ch, this._prevMidi.note, 0]);
      this._prevMidi = null;
    }
  };

  P.previewSample = function (slot) {
    if (!this.ctx || !this.node) return;
    const v = this._prevVoice;
    this._prevVoice = this._prevVoice >= 11 ? 8 : this._prevVoice + 1;
    const at = this.ctx.currentTime + 0.005;
    this._post({
      t: 'note', at, v,
      s: {
        kind: 'sample', slot, rate: 1, start: 0, len: 1,
        loopMode: 0, loopStart: 0, loopLen: 1,
        cut: 18000, res: 0, att: 0.002, dec: 0.05, sus: 1, rel: 0.08,
        vel: 0.9, gain: 0.9, pan: 0.5, sends: { cho: 0, dly: 0, rev: 0 },
      },
    });
    this._sounding.add(v);
  };

  // ---- samples ------------------------------------------------------------------------
  P.setSample = function (slot, smp) {
    if (!this.node) return;
    const data = smp.ch0 || smp.data;
    if (!data) return;
    this.node.port.postMessage({ t: 'sample', slot, sr: smp.sr || 44100, data });
  };

  P.removeSample = function (slot) {
    if (this.node) this.node.port.postMessage({ t: 'rmsample', slot });
  };

  P.decodeUpload = async function (file) {
    if (!this.ctx) throw new Error('no audio context');
    const ab = await file.arrayBuffer();
    const buf = await this.ctx.decodeAudioData(ab);
    const sr = buf.sampleRate;
    const maxLen = Math.min(buf.length, sr * 30);
    const ch0 = new Float32Array(maxLen);
    const nCh = buf.numberOfChannels;
    for (let c = 0; c < nCh; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < maxLen; i++) ch0[i] += d[i] / nCh;
    }
    let name = (file.name || 'SAMPLE').replace(/\.[^.]+$/, '').toUpperCase().replace(/[^\w\- ]+/g, '').slice(0, 20) || 'SAMPLE';
    return { name, sr, ch0 };
  };

  // ---- bounce (WAV record) ---------------------------------------------------------------
  P.startBounce = function () {
    if (!this.ctx || !this.node) return;
    this._bounceChunks = [];
    this._bounceRec = true;
    this._bounceSecs = 0;
    this._bounceSr = this.ctx.sampleRate;
    this.node.port.postMessage({ t: 'bounce', on: true });
  };

  P.stopBounce = function () {
    if (!this.node) return Promise.resolve(null);
    this.node.port.postMessage({ t: 'bounce', on: false });
    return new Promise((resolve) => {
      this._bounceResolve = () => {
        this._bounceRec = false;
        const chunks = this._bounceChunks;
        this._bounceChunks = [];
        if (!chunks.length) {
          resolve(null);
          return;
        }
        resolve(this._encodeWav(chunks, this._bounceSr));
      };
      // safety timeout in case bounceEnd is lost
      setTimeout(() => {
        if (this._bounceResolve) {
          const r = this._bounceResolve;
          this._bounceResolve = null;
          this._bounceRec = false;
          r();
        }
      }, 1500);
    });
  };

  P.getRecSecs = function () {
    return Math.floor(this._bounceSecs);
  };

  P._encodeWav = function (chunks, sr) {
    let total = 0;
    for (const c of chunks) total += c.L.length;
    const data = new Float32Array(total * 2);
    let o = 0;
    for (const c of chunks) {
      for (let i = 0; i < c.L.length; i++) {
        data[o++] = Math.max(-1, Math.min(1, c.L[i]));
        data[o++] = Math.max(-1, Math.min(1, c.R[i]));
      }
    }
    const buf = new ArrayBuffer(44 + total * 4);
    const v = new DataView(buf);
    const wstr = (off, s) => {
      for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
    };
    wstr(0, 'RIFF');
    v.setUint32(4, 36 + total * 4, true);
    wstr(8, 'WAVE');
    wstr(12, 'fmt ');
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 2, true);
    v.setUint32(24, sr, true);
    v.setUint32(28, sr * 4, true);
    v.setUint16(32, 4, true);
    v.setUint16(34, 16, true);
    wstr(36, 'data');
    v.setUint32(40, total * 4, true);
    for (let i = 0; i < data.length; i++) {
      v.setInt16(44 + i * 2, Math.round(data[i] * 32767), true);
    }
    return new Blob([buf], { type: 'audio/wav' });
  };
}
