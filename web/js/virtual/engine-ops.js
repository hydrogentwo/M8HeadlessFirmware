// M8 Virtual Teensy - editing operations (prototype extensions)
// =============================================================
// Per-view value editing, tap/double-tap actions, file + project
// operations. Mixed into VirtualTeensy by installOps().

import {
  EMPTY, TRACKS, STEPS, hex2, clamp,
  newChain, newPhrase, newInstrument,
  getChain, getPhrase, getInstrument, nextFree, deepClone,
  INSTRUMENT_TYPES, TYPE_KEYS, SCALES,
} from './song.js';
import { THEMES, THEME_KEYS } from './display.js';
import { FX, FX_ORDER } from './fx.js';

export function installOps(VirtualTeensy) {
  const P = VirtualTeensy.prototype;

  P._needsConfirm = function (id, label) {
    const now = Date.now();
    if (this._confirm.id === id && now < this._confirm.until) {
      this._confirm = { id: '', until: 0 };
      return false;
    }
    this._confirm = { id, until: now + 2500 };
    this.status(label + ' - EDT AGAIN:CONFIRM', 2500);
    this.markDirty();
    return true;
  };

  // ---- EDIT+arrows ------------------------------------------------------------------
  P._editBy = function (dx, dy) {
    const v = this.view;
    if (v === 'HELP' || v === 'FILE') return;
    const big = -dy; // UP=+big DOWN=-big
    const small = dx; // RIGHT=+1 LEFT=-1
    if (v === 'SONG') {
      const c = this.cur.song;
      const row = this.prj.song.rows[c.row];
      if (!row) return;
      let val = row.ch[c.t];
      if (val === EMPTY) val = this.lastEdit.chain;
      val = clamp(val + big * 16 + small, 0, 255);
      row.ch[c.t] = val;
      this.lastEdit.chain = val;
    } else if (v === 'CHAIN') {
      const c = this.cur.chain;
      const ch = getChain(this.prj, this.chain, true);
      if (c.col === 0) {
        let val = ch.ph[c.row];
        if (val === EMPTY) val = this.lastEdit.phrase;
        val = clamp(val + big * 16 + small, 0, 255);
        ch.ph[c.row] = val;
        this.lastEdit.phrase = val;
      } else {
        ch.ts[c.row] = clamp(ch.ts[c.row] + big * 12 + small, -48, 48);
      }
    } else if (v === 'PHRASE') {
      this._editPhraseCell(this.cur.phrase.col, this.cur.phrase.row, big, small, false);
    } else if (v === 'TABLE') {
      this._editPhraseCell(this.cur.table.col, this.cur.table.row, big, small, true);
    } else if (v === 'GROOVE') {
      const g = this.prj.grooves[this.groove];
      g.steps[this.cur.groove.row] = clamp(g.steps[this.cur.groove.row] + big * 6 + small, 0, 24);
    } else if (v === 'POOL') {
      const ins = getInstrument(this.prj, this.cur.pool.idx);
      if (ins && (dx || dy)) {
        const i = TYPE_KEYS.indexOf(ins.type);
        const n = (i + (dx || dy) + TYPE_KEYS.length) % TYPE_KEYS.length;
        this._retargetInstrument(this.cur.pool.idx, TYPE_KEYS[n]);
      }
    } else if (v === 'MIXER') {
      const c = this.cur.mixer;
      const ids = ['vol', 'pan', 'cho', 'del', 'rev'];
      if (c.row < 8) {
        const tr = this.prj.mixer.tracks[c.row];
        tr[ids[c.col]] = clamp(tr[ids[c.col]] + big * 16 + small, 0, 255);
      } else {
        this.prj.mixer.master = clamp(this.prj.mixer.master + big * 16 + small, 0, 255);
      }
    } else if (v === 'SENDS') {
      this._sendsAdjust(this.cur.sends.row, big, small);
    } else if (v === 'PROJECT') {
      this._projectEdit(big, small);
    } else if (v === 'SYSTEM') {
      this._systemAdjust(big, small);
    } else if (v === 'INST') {
      this._instAdjust(big, small);
    }
    this.markDirty();
  };

  P._editPhraseCell = function (col, row, big, small, isTable) {
    const L = this.lastEdit;
    if (isTable) {
      const ins = getInstrument(this.prj, this.inst, true);
      const r = ins.table.rows[row];
      if (col === 0) {
        if (r.n === EMPTY) r.n = 0;
        r.n = clamp(r.n + big * 12 + small, -48, 48);
      } else if (col === 1) {
        if (r.v === EMPTY) r.v = 255;
        r.v = clamp(r.v + big * 16 + small, 0, 255);
      } else this._editFxCell(r, Math.floor((col - 2) / 2), (col - 2) % 2, big, small, true, row);
      return;
    }
    const ph = getPhrase(this.prj, this.phrase, true);
    const r = ph.rows[row];
    if (col === 0) {
      if (r.n === EMPTY || r.n === 128) r.n = L.note;
      // big: octave jumps; small: semitone cycle 0..127 -> OFF -> EMPTY
      if (big) r.n = clamp(r.n + big * 12, 0, 127);
      else if (small > 0) r.n = r.n >= 127 ? 128 : r.n + 1 === 128 ? 128 : r.n + 1;
      else if (small < 0) r.n = r.n === 128 ? 127 : r.n <= 0 ? 128 : r.n - 1;
      if (r.n >= 0 && r.n <= 127) L.note = r.n;
    } else if (col === 1) {
      r.v = clamp(r.v + big * 16 + small, 0, 255);
      L.vel = r.v;
    } else if (col === 2) {
      if (r.i === EMPTY) r.i = this.inst;
      r.i = clamp(r.i + big * 16 + small, 0, 127);
    } else {
      this._editFxCell(r, Math.floor((col - 3) / 2), (col - 3) % 2, big, small, false, row);
    }
  };

  P._editFxCell = function (r, fi, isVal, big, small, isTable, rowNum) {
    const fx = r.fx[fi];
    if (!isVal) {
      if (big) {
        // EDIT+UP/DOWN on command: open help browser
        this._openHelp(isTable ? 'TABLE' : 'PHRASE', rowNum, fi, fx.c);
        return;
      }
      if (!small) return;
      let i = fx.c ? FX_ORDER.indexOf(fx.c) : (small > 0 ? -1 : 0);
      i = i + small;
      if (i < -1) i = FX_ORDER.length - 1;
      if (i >= FX_ORDER.length) i = -1;
      fx.c = i < 0 ? '' : FX_ORDER[i];
      if (fx.c) {
        this.lastEdit.fx = fx.c;
        if (!fx.v) fx.v = this.lastEdit.fxv;
      }
    } else {
      if (!fx.c) fx.c = this.lastEdit.fx;
      fx.v = clamp(fx.v + big * 16 + small, 0, 255);
      this.lastEdit.fxv = fx.v;
    }
  };

  P._instAdjust = function (big, small) {
    const ins = getInstrument(this.prj, this.inst, true);
    const r = this.cur.inst.row;
    if (r === 0) {
      if (small || big) {
        const i = TYPE_KEYS.indexOf(ins.type);
        const n = (i + (small || big) + TYPE_KEYS.length * 2) % TYPE_KEYS.length;
        this._retargetInstrument(this.inst, TYPE_KEYS[n]);
      }
      return;
    }
    const d = INSTRUMENT_TYPES[ins.type].params[r - 1];
    if (!d) return;
    const step = d.names ? (small || big || 0) : big * 16 + small;
    if (d.names) {
      ins.p[d.id] = (ins.p[d.id] + step + (d.max + 1) * 4) % (d.max + 1);
    } else {
      ins.p[d.id] = clamp(ins.p[d.id] + step, d.min, d.max);
    }
  };

  P._retargetInstrument = function (n, type) {
    const old = getInstrument(this.prj, n, true);
    const keep = { name: old.name, table: old.table };
    this.prj.instruments[n] = { type, name: keep.name, p: {}, table: keep.table };
    const fresh = newInstrument(type);
    this.prj.instruments[n].p = fresh.p;
    this.status(`${hex2(n)}:${INSTRUMENT_TYPES[type].name}`, 1200);
  };

  const SENDS_MAP = [
    ['delay', 'time'], ['delay', 'fb'], ['delay', 'damp'], ['delay', 'mix'],
    ['reverb', 'size'], ['reverb', 'decay'], ['reverb', 'damp'], ['reverb', 'mix'],
    ['chorus', 'type'], ['chorus', 'rate'], ['chorus', 'depth'], ['chorus', 'mix'],
  ];
  const SENDS_DEF = {
    delay: { time: 96, fb: 90, damp: 140, mix: 255 },
    reverb: { size: 170, decay: 150, damp: 160, mix: 255 },
    chorus: { type: 0, rate: 40, depth: 90, mix: 255 },
  };

  P._sendsAdjust = function (row, big, small) {
    const [sec, id] = SENDS_MAP[row];
    const o = this.prj.mixer[sec];
    if (id === 'type') o[id] = (o[id] + (small || big) + 9) % 3;
    else o[id] = clamp(o[id] + big * 16 + small, 0, 255);
  };

  P._sendsWriteDefault = function () {
    const [sec, id] = SENDS_MAP[this.cur.sends.row];
    this.prj.mixer[sec][id] = SENDS_DEF[sec][id];
  };

  const NAME_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_';

  P._projectEdit = function (big, small) {
    const song = this.prj.song;
    const c = this.cur.project;
    const step = big * 10 + small || small || big;
    if (c.row === 0) {
      if (small && !big) {
        c.nameChar = clamp(c.nameChar + small, 0, 15);
        return;
      }
      const d = big || small || 1;
      while (song.name.length < 16) song.name += ' ';
      const i = NAME_CHARS.indexOf(song.name[c.nameChar] || ' ');
      const n = (i + d + NAME_CHARS.length * 2) % NAME_CHARS.length;
      song.name = (song.name.slice(0, c.nameChar) + NAME_CHARS[n] + song.name.slice(c.nameChar + 1)).slice(0, 16);
      song.name = song.name.trimEnd() || 'UNTITLED';
    } else if (c.row === 1) song.tempo = clamp(song.tempo + (big * 10 + small || 0), 30, 250);
    else if (c.row === 2) song.transpose = clamp(song.transpose + (big * 12 + small || 0), -48, 48);
    else if (c.row === 3) {
      const { SCALES } = require('./song.js');
      song.scale = (song.scale + (small || big || 0) + SCALES.length * 2) % SCALES.length;
    } else if (c.row === 4) {
      const d = small || big || 0;
      if (d > 0 && song.rows.length < 256) {
        song.rows.push({ ch: new Array(TRACKS).fill(EMPTY) });
      } else if (d < 0 && song.rows.length > 1) {
        song.rows.pop();
        this.cur.song.row = clamp(this.cur.song.row, 0, song.rows.length - 1);
      }
    }
  };

  P._systemAdjust = function (big, small) {
    const r = this.cur.system.row;
    const d = small || big || 0;
    if (r === 0) {
      const i = THEME_KEYS.indexOf(this.themeKey);
      this.themeKey = THEME_KEYS[(i + (d || 1) + THEME_KEYS.length) % THEME_KEYS.length];
      this.theme = THEMES[this.themeKey];
      this.persistSoon();
    } else if (r === 1) this.keyOct = clamp(this.keyOct + d, 0, 8);
    else if (r === 2) this.keyVel = clamp(this.keyVel + (big * 16 + small || 0), 1, 127);
    else if (r === 3) {
      if (!this._rep) {
        this.scopeOn = !this.scopeOn;
        if (!this.scopeOn) this._sendWave(null);
      }
    }
    // rows 4-7 are read-only info
  };

  // ---- EDIT tap -------------------------------------------------------------------
  P._tapEdit = function () {
    const v = this.view;
    if (v === 'HELP') {
      this._closeHelp(true);
      return;
    }
    const { c, r } = this._cursorCR();
    const key = `${v}:${c}:${r}`;
    const now = Date.now();
    const isDouble = this._tap.key === key && now - this._tap.t < 350;
    this._tap = { key, t: now };

    if (v === 'SONG') {
      const row = this.prj.song.rows[this.cur.song.row];
      const t = this.cur.song.t;
      if (row.ch[t] === EMPTY) {
        row.ch[t] = isDouble ? nextFree(this.prj.chains, 256) : this.lastEdit.chain;
        if (row.ch[t] < 0) row.ch[t] = EMPTY;
        else this.lastEdit.chain = row.ch[t];
      } else {
        this.chain = row.ch[t];
        this.track = t;
        const ch = getChain(this.prj, this.chain);
        if (ch && ch.ph[0] !== EMPTY) this.phrase = ch.ph[0];
        this._goto('CHAIN');
        return;
      }
    } else if (v === 'CHAIN') {
      const cc = this.cur.chain;
      if (cc.col === 1) return;
      const ch = getChain(this.prj, this.chain, false);
      const val = ch ? ch.ph[cc.row] : EMPTY;
      if (val === EMPTY) {
        const c2 = getChain(this.prj, this.chain, true);
        const n = isDouble ? nextFree(this.prj.phrases, 256) : this.lastEdit.phrase;
        c2.ph[cc.row] = n < 0 ? EMPTY : n;
        if (n >= 0) this.lastEdit.phrase = n;
      } else {
        this.phrase = val;
        this._goto('PHRASE');
        return;
      }
    } else if (v === 'PHRASE') {
      const cc = this.cur.phrase;
      const ph = getPhrase(this.prj, this.phrase, true);
      const row = ph.rows[cc.row];
      if (cc.col === 0) {
        if (row.n === EMPTY) {
          if (isDouble) {
            row.n = 128; // OFF
          } else {
            row.n = this.lastEdit.note;
            row.v = this.lastEdit.vel;
            if (row.i === EMPTY) row.i = this.inst;
          }
        } else if (row.n === 128) {
          row.n = EMPTY;
        } else if (this.audio) {
          this.audio.previewNote(row.i === EMPTY ? this.inst : row.i, row.n, row.v);
        }
      } else if (cc.col === 1) row.v = this.lastEdit.vel;
      else if (cc.col === 2) {
        if (row.i === EMPTY) row.i = this.inst;
        else {
          this.inst = row.i;
          this._goto('INST');
          return;
        }
      } else {
        const fi = Math.floor((cc.col - 3) / 2);
        const isVal = (cc.col - 3) % 2 === 1;
        if (!isVal && !row.fx[fi].c) {
          row.fx[fi].c = this.lastEdit.fx;
          row.fx[fi].v = this.lastEdit.fxv;
        }
      }
    } else if (v === 'TABLE') {
      const cc = this.cur.table;
      const ins = getInstrument(this.prj, this.inst, true);
      const row = ins.table.rows[cc.row];
      if (cc.col === 0 && row.n === EMPTY) row.n = 0;
      else if (cc.col === 1 && row.v === EMPTY) row.v = 255;
      else if (cc.col >= 2) {
        const fi = Math.floor((cc.col - 2) / 2);
        const isVal = (cc.col - 2) % 2 === 1;
        if (!isVal && !row.fx[fi].c) {
          row.fx[fi].c = this.lastEdit.fx;
          row.fx[fi].v = this.lastEdit.fxv;
        }
      }
    } else if (v === 'INST') {
      this._preview();
      return;
    } else if (v === 'POOL') {
      const idx = this.cur.pool.idx;
      if (!getInstrument(this.prj, idx)) {
        this.prj.instruments[idx] = newInstrument('WAV', '');
      }
      this.inst = idx;
      this._goto('INST');
      return;
    } else if (v === 'FILE') {
      this._fileActivate();
      return;
    } else if (v === 'PROJECT') {
      this._projectActivate();
      return;
    } else if (v === 'SYSTEM') {
      if (this.cur.system.row === 3) {
        this.scopeOn = !this.scopeOn;
        if (!this.scopeOn) this._sendWave(null);
      }
      return;
    } else {
      return;
    }
    this.markDirty();
  };

  // ---- HELP modal ---------------------------------------------------------------------
  P._openHelp = function (fromView, row, fi, currentCmd) {
    this._helpContext = { view: fromView, row, fi };
    const i = currentCmd ? FX_ORDER.indexOf(currentCmd) : 0;
    this.cur.help.idx = Math.max(0, i);
    this.cur.help.top = clamp(this.cur.help.idx - 4, 0, Math.max(0, FX_ORDER.length - 17));
    this._goto('HELP');
  };

  P._closeHelp = function (insert) {
    const ctx = this._helpContext;
    const cmd = FX_ORDER[this.cur.help.idx];
    const back = this.viewReturn && this.viewReturn !== 'HELP' ? this.viewReturn : 'PHRASE';
    this._goto(back);
    if (insert && ctx && cmd) {
      if (ctx.view === 'PHRASE') {
        const ph = getPhrase(this.prj, this.phrase, true);
        ph.rows[ctx.row].fx[ctx.fi].c = cmd;
      } else if (ctx.view === 'TABLE') {
        const ins = getInstrument(this.prj, this.inst, true);
        ins.table.rows[ctx.row].fx[ctx.fi].c = cmd;
      }
      this.lastEdit.fx = cmd;
      this.status(`INSERTED ${cmd}`, 1000);
    }
    this._helpContext = null;
    this.markDirty();
  };

  // ---- POOL / FILE ops -------------------------------------------------------------------
  P._deletePool = function (idx) {
    if (!this.prj.instruments[idx]) return;
    if (this._needsConfirm('delpool' + idx, `DELETE INST ${hex2(idx)}`)) return;
    delete this.prj.instruments[idx];
    this.status(`DELETED ${hex2(idx)}`, 1200);
    this.markDirty();
  };

  P._fileActivate = function () {
    const c = this.cur.file;
    if (c.tab === 0) {
      const meta = this.samplesMeta.find((m) => m.slot === c.idx);
      if (!meta) {
        this._uploadSample(c.idx);
      } else {
        // assign to selected sampler instrument if applicable
        const ins = getInstrument(this.prj, this.inst);
        if (ins && ins.type === 'SMP') {
          ins.p.SMP = c.idx;
          this.status(`SLOT ${hex2(c.idx)} -> INST ${hex2(this.inst)}`, 1400);
        } else if (this.audio) {
          this.audio.previewSample(c.idx);
          this.status(`PREVIEW ${meta.name}`, 1200);
        }
      }
    } else {
      if (c.idx === 0) {
        this._saveSongAs(this.prj.song.name.trim() || 'UNTITLED');
      } else {
        const files = this.songFiles;
        const f = files[c.idx - 1];
        if (!f) {
          // last row: import
          this._importPicker();
        } else {
          this._loadSong(f.name);
        }
      }
    }
    this.markDirty();
  };

  P._deleteFileEntry = function () {
    const c = this.cur.file;
    if (c.tab === 0) {
      const meta = this.samplesMeta.find((m) => m.slot === c.idx);
      if (!meta) return;
      if (this._needsConfirm('delsmp' + c.idx, `DELETE ${meta.name}`)) return;
      (async () => {
        if (this.storage) await this.storage.deleteSample(c.idx);
        if (this.audio) this.audio.removeSample(c.idx);
        await this.refreshFiles();
        this.status('SAMPLE DELETED', 1200);
        this.markDirty();
      })().catch(() => this.status('DELETE FAILED', 1500));
    } else {
      const f = this.songFiles[c.idx - 1];
      if (!f) return;
      if (this._needsConfirm('delsong' + f.name, `DELETE ${f.name}`)) return;
      (async () => {
        if (this.storage) await this.storage.deleteSong(f.name);
        await this.refreshFiles();
        this.status('SONG DELETED', 1200);
        this.markDirty();
      })().catch(() => this.status('DELETE FAILED', 1500));
    }
  };

  P._uploadSample = function (slot) {
    this.onRequestUpload('audio/*', async (file) => {
      try {
        this.status('DECODING...', 3000);
        const smp = await this.audio.decodeUpload(file);
        if (this.storage) await this.storage.saveSample(slot, smp.name, smp.sr, smp.ch0, smp.ch1);
        if (this.audio) this.audio.setSample(slot, smp);
        await this.refreshFiles();
        this.status(`LOADED ${smp.name}`, 1600);
      } catch (e) {
        console.warn(e);
        this.status('LOAD FAILED', 1600);
      }
      this.markDirty();
    });
  };

  P._saveSongAs = function (name) {
    if (!this.storage) {
      this.status('NO STORAGE', 1400);
      return;
    }
    const exists = this.songFiles.some((f) => f.name === name);
    if (exists && this._needsConfirm('save' + name, `OVERWRITE ${name}`)) return;
    (async () => {
      const { serialize } = await import('./song.js');
      await this.storage.saveSong(name, serialize(this.prj));
      await this.refreshFiles();
      this.status(`SAVED ${name}`, 1600);
      this.markDirty();
    })().catch(() => this.status('SAVE FAILED', 1600));
  };

  P._loadSong = function (name) {
    if (this._needsConfirm('load' + name, `LOAD ${name}`)) return;
    (async () => {
      const rec = await this.storage.getSong(name);
      if (!rec) throw new Error('missing');
      const { deserialize } = await import('./song.js');
      if (this.audio) this.audio.stop();
      this.transport.playing = false;
      this.prj = deserialize(rec.data);
      if (this.audio) this.audio.setProject(this.prj);
      this._syncNavToProject();
      this._goto('SONG');
      this.status(`LOADED ${name}`, 1600);
      this.markDirty();
    })().catch(() => this.status('LOAD FAILED', 1600));
  };

  P._importPicker = function () {
    this.onRequestUpload('.json,application/json', async (file) => {
      try {
        const text = await file.text();
        const { deserialize } = await import('./song.js');
        if (this.audio) this.audio.stop();
        this.transport.playing = false;
        this.prj = deserialize(text);
        if (this.audio) this.audio.setProject(this.prj);
        this._syncNavToProject();
        this._goto('SONG');
        this.status(`IMPORTED ${file.name}`, 1600);
      } catch (e) {
        this.status('IMPORT FAILED', 1600);
      }
      this.markDirty();
    });
  };

  // ---- PROJECT commands --------------------------------------------------------------------
  P._projectActivate = function () {
    const r = this.cur.project.row;
    if (r < 5) return;
    if (r === 5) this._saveSongAs(this.prj.song.name.trim() || 'UNTITLED');
    else if (r === 6) {
      this.cur.file.tab = 1;
      this.cur.file.idx = 0;
      this.cur.file.top = 0;
      this._goto('FILE');
    } else if (r === 7) {
      if (this._needsConfirm('new', 'NEW SONG')) return;
      (async () => {
        const { newProject } = await import('./song.js');
        if (this.audio) this.audio.stop();
        this.transport.playing = false;
        // stash current into autosave first
        if (this.storage) {
          const { serialize } = await import('./song.js');
          await this.storage.saveSong('__autosave', serialize(this.prj));
        }
        this.prj = newProject('NEW SONG');
        if (this.audio) this.audio.setProject(this.prj);
        this._syncNavToProject();
        this._goto('SONG');
        this.status('NEW SONG', 1400);
        this.markDirty();
      })().catch(() => this.status('FAILED', 1400));
    } else if (r === 8) {
      (async () => {
        const { serialize } = await import('./song.js');
        const blob = new Blob([serialize(this.prj)], { type: 'application/json' });
        const name = (this.prj.song.name.trim() || 'song').replace(/[^\w\- ]+/g, '') + '.vm8.json';
        this.onDownload(name, blob);
        this.status('EXPORTED', 1400);
      })();
    } else if (r === 9) {
      this._importPicker();
    } else if (r === 10) {
      this._toggleBounce();
    }
    this.markDirty();
  };

  P._toggleBounce = function () {
    if (!this.audio) return;
    if (!this.rec.active) {
      this.audio.startBounce();
      this.rec.active = true;
      this.rec.secs = 0;
      if (!this.transport.playing) {
        this.audio.playSong(0);
        this.transport.playing = true;
        this.transport.mode = 'song';
      }
      this.status('RECORDING MASTER...', 2000);
    } else {
      (async () => {
        const blob = await this.audio.stopBounce();
        this.rec.active = false;
        if (blob) {
          const name = (this.prj.song.name.trim() || 'song').replace(/[^\w\- ]+/g, '') + '.wav';
          this.onDownload(name, blob);
          this.status('BOUNCE SAVED', 2000);
        } else {
          this.status('BOUNCE EMPTY', 1600);
        }
        this.markDirty();
      })();
    }
    this.markDirty();
  };
}
