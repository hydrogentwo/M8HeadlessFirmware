// M8 Virtual Teensy - virtual firmware engine
// ============================================
// Emulates a Teensy 4.1 running M8 headless firmware at the *protocol*
// level: it speaks the exact same host protocol bytes ('E','R','D','X',
// 'C'+state,'K'+note...) and emits byte-identical SLIP display frames,
// so stock M8 clients render it indistinguishably from hardware.
//
// This is a clean-room reimplementation of the tracker workflow. It does
// not contain, load, or derive from Dirtywave firmware.

import { Composer, slipEncode, waveFrame, emptyWaveFrame, systemFrame, THEMES, THEME_KEYS } from './display.js';
import { renderView, VIEW_MAP, mapPos, snapshotText } from './views.js';
import {
  EMPTY, NOTE_OFF, TRACKS, STEPS, MAX_GROOVES, hex2, clamp, noteName,
  newPhrase, newPhraseRow, newChain, newInstrument, newProject,
  getChain, getPhrase, getInstrument, nextFree, deepClone,
  phraseUseCount, chainUseCount, serialize, deserialize, SCALES,
  INSTRUMENT_TYPES, TYPE_KEYS,
} from './song.js';
import { FX, FX_ORDER, fxHelp } from './fx.js';
import { installOps } from './engine-ops.js';

// M8 input bitmask (host -> device 'C' byte), same as hardware.
export const KEY = {
  LEFT: 0x80, UP: 0x40, DOWN: 0x20, SEL: 0x10,
  STA: 0x08, RIGHT: 0x04, OPT: 0x02, EDIT: 0x01,
};
const ARROWS = KEY.LEFT | KEY.UP | KEY.DOWN | KEY.RIGHT;

const FW_VER = [1, 0, 0]; // virtual firmware version (ours, not Dirtywave's)

export class VirtualTeensy {
  constructor(opts = {}) {
    this.onData = opts.onData || (() => {});
    this.onDownload = opts.onDownload || (() => {});
    this.onRequestUpload = opts.onRequestUpload || (() => {});
    this.audio = null;
    this.storage = null;

    this.prj = newProject('NEW SONG');
    this.view = 'SONG';
    this.viewReturn = 'SONG';
    this.themeKey = 'M8';
    this.theme = THEMES.M8;

    this.track = 0;
    this.chain = 0;
    this.phrase = 0;
    this.inst = 0;
    this.groove = 0;

    this.cur = {
      song: { t: 0, row: 0, top: 0 },
      chain: { col: 0, row: 0 },
      phrase: { col: 0, row: 0 },
      inst: { row: 0, top: 0 },
      table: { col: 0, row: 0 },
      groove: { row: 0 },
      pool: { idx: 0 },
      file: { tab: 0, idx: 0, top: 0 },
      mixer: { col: 0, row: 0 },
      sends: { row: 0 },
      project: { row: 0, nameChar: 0 },
      system: { row: 0 },
      help: { idx: 0, top: 0 },
    };
    this.sel = null;
    this.clip = null;
    this.muted = new Array(TRACKS).fill(false);
    this.soloed = new Array(TRACKS).fill(false);
    this.transport = { playing: false, mode: 'song' };
    this.playT = [];
    for (let i = 0; i < TRACKS; i++) {
      this.playT.push({ active: false, songRow: 0, chain: EMPTY, chainStep: 0, phrase: EMPTY, phraseStep: 0, tableInst: -1, tableStep: -1, groove: 0 });
    }
    this.trackGrooves = new Array(TRACKS).fill(0);
    this.levels = new Array(9).fill(0);
    this.activeInst = new Set();
    this.rec = { active: false, secs: 0 };

    this.lastEdit = { note: 48, vel: 64, inst: 0, chain: 0, phrase: 0, fx: 'KIL', fxv: 0 };
    this.keyOct = 3;
    this.keyVel = 103;
    this.scopeOn = true;

    this.keyState = 0;
    this._rxBuf = [];
    this._rep = null;
    this._editDown = null;
    this._optDown = null;
    this._keySeq = 0;
    this._selSeq = 0;
    this._optSeq = 0;
    this._pairFired = false;
    this._tap = { key: '', t: 0 };
    this._confirm = { id: '', until: 0 };
    this._status = { msg: '', until: 0 };
    this._enabled = false;
    this._splashUntil = 0;
    this._helpContext = null;
    this._bootTime = Date.now();
    this._persistTimer = 0;
    this._dirty = false;
    this._waveClearSent = false;

    this.samplesMeta = [];
    this.songFiles = [];
    this.sdUsage = 'SD: ...';
    this.sdUsageShort = '...';
    this.engineInfo = { wasm: false, voices: 0, backend: 'VIRTUAL', uptime: '0:00' };

    this._composer = new Composer();
    this._pumpTimer = setInterval(() => this._pump(), 66);
    this._repTimer = setInterval(() => this._repeatTick(), 40);
  }

  attachAudio(audio) {
    this.audio = audio;
    audio.setProject(this.prj);
    audio.onScope = (peaks) => this._sendWave(peaks);
    audio.onLevels = (lv) => { this.levels = lv; };
    this.engineInfo.wasm = audio.isWasm();
  }

  attachStorage(storage) {
    this.storage = storage;
  }

  // ---- host protocol input ------------------------------------------------
  // Byte stream: E R D X C+state K+note[+vel]
  receive(bytes) {
    for (const b of bytes) this._rxBuf.push(b);
    while (this._rxBuf.length) {
      const b = this._rxBuf[0];
      if (b === 0x43) { // C
        if (this._rxBuf.length < 2) break;
        this._rxBuf.splice(0, 2);
        this.sendKeys(this._rxBuf0 ?? 0); // placeholder (fixed below)
      } else break;
    }
  }

  // NOTE: receive() above is replaced by the correct implementation below.
  // (Kept simple: connections call sendKeys/noteOn directly; receive() is
  // provided for protocol-level tests and alternative transports.)
  _rxReset() { this._rxBuf = []; }
}

VirtualTeensy.prototype.receive = function (bytes) {
  for (const b of bytes) this._rxBuf.push(b);
  let guard = 0;
  while (this._rxBuf.length && guard++ < 4096) {
    const b = this._rxBuf[0];
    if (b === 0x45) { this._rxBuf.shift(); this.enable(); } // E
    else if (b === 0x52) { this._rxBuf.shift(); this.reset(); } // R
    else if (b === 0x44) { this._rxBuf.shift(); this.disconnect(); } // D
    else if (b === 0x58) { this._rxBuf.shift(); this._ping(); } // X
    else if (b === 0x43) { // C + state
      if (this._rxBuf.length < 2) break;
      this._rxBuf.shift();
      this.sendKeys(this._rxBuf.shift());
    } else if (b === 0x4b) { // K + note [+vel]
      if (this._rxBuf.length < 2) break;
      if (this._rxBuf[1] === 0xff) {
        this._rxBuf.splice(0, 2);
        this.noteOff();
      } else {
        if (this._rxBuf.length < 3) break;
        this._rxBuf.shift();
        const n = this._rxBuf.shift();
        const v = this._rxBuf.shift();
        this.noteOn(n, v);
      }
    } else {
      this._rxBuf.shift(); // ignore unknown
    }
  }
};

// ---- lifecycle ---------------------------------------------------------------
VirtualTeensy.prototype.enable = async function () {
  if (this._enabled) {
    this.redraw();
    return;
  }
  this._enabled = true;
  this._emit([systemFrame(0, FW_VER[0], FW_VER[1], FW_VER[2], 0)]);
  // splash
  this._splashUntil = Date.now() + 700;
  this._drawSplash('VIRTUAL TEENSY 4.1', 'BOOTING VIRTUAL FIRMWARE...');
  if (this.audio) {
    try { await this.audio.ensure(); } catch (e) { console.warn('audio unavailable', e); }
    this.engineInfo.wasm = this.audio.isWasm();
  }
  // settings + autosave
  if (this.storage) {
    try {
      const s = await this.storage.getSettings();
      if (s) {
        if (s.themeKey && THEMES[s.themeKey]) { this.themeKey = s.themeKey; this.theme = THEMES[s.themeKey]; }
        if (typeof s.keyOct === 'number') this.keyOct = s.keyOct;
        if (typeof s.keyVel === 'number') this.keyVel = s.keyVel;
        if (typeof s.scopeOn === 'boolean') this.scopeOn = s.scopeOn;
        if (Array.isArray(s.muted)) this.muted = s.muted.slice(0, TRACKS).map(Boolean);
        if (Array.isArray(s.soloed)) this.soloed = s.soloed.slice(0, TRACKS).map(Boolean);
      }
      const auto = await this.storage.getSong('__autosave');
      if (auto) {
        this.prj = deserialize(auto.data);
        if (this.audio) this.audio.setProject(this.prj);
        this._syncNavToProject();
        this.status('AUTOSAVE RESTORED', 2500);
      } else {
        const { buildDemoSong } = await import('./demo.js');
        this.prj = buildDemoSong();
        if (this.audio) this.audio.setProject(this.prj);
        this._syncNavToProject();
        this.status('DEMO SONG LOADED - PRESS PLAY', 3500);
        // seed demo samples
        try {
          const { buildDemoKit } = await import('./demo.js');
          const kit = buildDemoKit();
          for (const [slot, smp] of kit) {
            await this.storage.saveSample(slot, smp.name, smp.sr, smp.ch0, smp.ch1);
            if (this.audio) this.audio.setSample(slot, smp);
          }
        } catch (e) { console.warn('demo kit failed', e); }
      }
      await this.refreshFiles();
    } catch (e) { console.warn('storage unavailable', e); }
  }
  this._pushTrackStates();
  const wait = Math.max(0, this._splashUntil - Date.now());
  setTimeout(() => { this._splashUntil = 0; this.redraw(); }, wait);
};

VirtualTeensy.prototype._syncNavToProject = function () {
  this.cur.song.row = 0; this.cur.song.top = 0;
  const firstChain = this.prj.song.rows[0] ? this.prj.song.rows[0].ch[0] : EMPTY;
  this.chain = firstChain !== EMPTY ? firstChain : 0;
  const ch = getChain(this.prj, this.chain);
  this.phrase = ch && ch.ph[0] !== EMPTY ? ch.ph[0] : 0;
  const ph = getPhrase(this.prj, this.phrase);
  this.inst = ph ? (ph.rows.find((r) => r.i !== EMPTY) || {}).i ?? 0 : 0;
  if (this.inst === EMPTY || this.inst === undefined) this.inst = 0;
};

VirtualTeensy.prototype.reset = function () {
  this._emit([systemFrame(0, FW_VER[0], FW_VER[1], FW_VER[2], 0)]);
  this.redraw();
};

VirtualTeensy.prototype.disconnect = function () {
  this._enabled = false;
  if (this.audio) this.audio.stop();
  this.transport.playing = false;
};

VirtualTeensy.prototype._ping = function () {
  if (!this._enabled) return;
  this._emit([systemFrame(0, FW_VER[0], FW_VER[1], FW_VER[2], 0)]);
};

VirtualTeensy.prototype._drawSplash = function (l1, l2) {
  const T = this.theme;
  const g = new Composer();
  g.cls(T.bg);
  g.center('DIRTYWAVE-STYLE TRACKER', 6, T.faint);
  g.center(l1, 10, T.head);
  g.center('M8 VIRTUAL FIRMWARE V1.0', 12, T.fg);
  g.center(l2, 15, T.dim);
  g.center('CLEAN-ROOM ENGINE - NO TEENSY NEEDED', 19, T.faint);
  g.center('SUPPORT THE REAL THING: DIRTYWAVE.COM', 20, T.faint);
  this._emit(g.frames());
};

// ---- output -------------------------------------------------------------------
VirtualTeensy.prototype._emit = function (frames) {
  if (!this._enabled && !this._splashForced) return;
  try {
    this.onData(slipEncode(frames));
  } catch (e) { console.error(e); }
};

VirtualTeensy.prototype.redraw = function () {
  if (!this._enabled) return;
  if (Date.now() < this._splashUntil) return;
  // live engine info
  if (this.audio) {
    this.engineInfo.voices = this.audio.getVoiceCount();
    const s = Math.floor((Date.now() - this._bootTime) / 1000);
    this.engineInfo.uptime = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  const g = this._composer;
  renderView(g, this);
  this._emit(g.frames());
  this._waveClearSent = false;
};

VirtualTeensy.prototype.snapshotText = function () {
  return snapshotText(this);
};

VirtualTeensy.prototype._sendWave = function (peaks) {
  if (!this._enabled || Date.now() < this._splashUntil) return;
  const T = this.theme;
  if (!this.scopeOn || !peaks) {
    if (!this._waveClearSent) {
      this._emit([emptyWaveFrame(T.wave[0], T.wave[1], T.wave[2])]);
      this._waveClearSent = true;
    }
    return;
  }
  const data = new Uint8Array(320);
  data.fill(255, 0, 200); // transparent left part (header text stays clean)
  for (let i = 0; i < 120; i++) {
    const v = peaks[Math.floor((i / 120) * peaks.length)] || 0;
    data[200 + i] = clamp(Math.round(10 - v * 9), 0, 20);
  }
  this._emit([waveFrame(T.wave[0], T.wave[1], T.wave[2], data)]);
  this._waveClearSent = false;
};

VirtualTeensy.prototype._pump = function () {
  if (!this._enabled || Date.now() < this._splashUntil) return;
  if (this.audio) {
    this.playT = this.audio.getPlayheads();
    this.trackGrooves = this.audio.getTrackGrooves();
    this.activeInst = this.audio.getActiveInst();
    if (this.rec.active) this.rec.secs = this.audio.getRecSecs();
  }
  if (this.transport.playing) this.redraw();
  else if (this._status.msg && Date.now() > this._status.until) {
    this._status.msg = '';
    this.redraw();
  }
  if (this._dirty) {
    this._dirty = false;
    this.redraw();
    this.persistSoon();
  }
};

VirtualTeensy.prototype.markDirty = function () {
  this._dirty = true;
};

VirtualTeensy.prototype.status = function (msg, ms = 2000) {
  this._status = { msg, until: Date.now() + ms };
  this.markDirty();
};

VirtualTeensy.prototype.statusText = function () {
  if (this._status.msg && Date.now() < this._status.until) return this._status.msg;
  return '';
};

VirtualTeensy.prototype.persistSoon = function () {
  if (!this.storage) return;
  if (this._persistTimer) return;
  this._persistTimer = setTimeout(() => {
    this._persistTimer = 0;
    this._persist().catch(() => {});
  }, 1500);
};

VirtualTeensy.prototype._persist = async function () {
  if (!this.storage) return;
  await this.storage.saveSong('__autosave', serialize(this.prj));
  await this.storage.saveSettings({
    themeKey: this.themeKey, keyOct: this.keyOct, keyVel: this.keyVel,
    scopeOn: this.scopeOn, muted: this.muted, soloed: this.soloed,
  });
};

VirtualTeensy.prototype.refreshFiles = async function () {
  if (!this.storage) return;
  try {
    this.samplesMeta = await this.storage.listSamples();
    // load sample buffers into audio
    if (this.audio) {
      for (const m of this.samplesMeta) {
        const s = await this.storage.getSample(m.slot);
        if (s) this.audio.setSample(m.slot, s);
      }
    }
    this.songFiles = (await this.storage.listSongs()).filter((s) => s.name !== '__autosave');
    const st = await this.storage.stats();
    this.sdUsage = `SD: ${st.songs} SONGS ${st.samples} SAMPLES ${st.mb}MB`;
    this.sdUsageShort = `${st.songs}SG ${st.samples}SM ${st.mb}MB`;
  } catch (e) { /* ignore */ }
};

// ---- key input ------------------------------------------------------------------
VirtualTeensy.prototype.sendKeys = function (state) {
  state &= 0xff;
  const prev = this.keyState;
  if (state === prev) return;
  if (!this._enabled || Date.now() < this._splashUntil) {
    this.keyState = state;
    // allow splash skip
    if (state !== 0) this._splashUntil = 0;
    return;
  }
  const pressed = state & ~prev;
  const released = prev & ~state;
  this.keyState = state;
  const now = Date.now();

  this._keySeq++;
  if (pressed & KEY.SEL) this._selSeq = this._keySeq;
  if (pressed & KEY.OPT) this._optSeq = this._keySeq;

  // SELECT+OPT pair (order disambiguates: SEL first = selection, OPT first = mute)
  const pair = KEY.SEL | KEY.OPT;
  if ((state & pair) === pair && !this._pairFired) {
    this._pairFired = true;
    if (this._selSeq < this._optSeq) this._toggleSel();
    else this._muteTrack();
  }
  if ((state & pair) !== pair) this._pairFired = false;

  // PLAY edge combos
  if (pressed & KEY.STA) {
    const h = state;
    if ((h & KEY.EDIT)) this._preview();
    else if ((h & pair) === pair) this._clearMS();
    else if (h & KEY.SEL) this._playSong();
    else if (h & KEY.OPT) this._soloTrack();
    else this._playToggle();
  }

  // EDIT edge combos
  if (pressed & KEY.EDIT) {
    this._editDown = { t: now, arrows: false, combo: false };
    const h = state;
    if ((h & pair) === pair) { this._clone(); this._editDown.combo = true; }
    else if (h & KEY.OPT) { this._deleteOrDefault(); this._editDown.combo = true; }
    else if (h & KEY.SEL) { this._paste(); this._editDown.combo = true; }
  }
  if (released & KEY.EDIT && this._editDown) {
    const d = this._editDown;
    this._editDown = null;
    if (!d.combo && !d.arrows && now - d.t < 400) this._tapEdit();
  }

  // OPT tap in selection = copy
  if (pressed & KEY.OPT) this._optDown = { t: now, arrows: false };
  if (released & KEY.OPT && this._optDown) {
    const d = this._optDown;
    this._optDown = null;
    if (!d.arrows && this.sel && (state & KEY.SEL) === 0) this._copy();
  }

  // Arrow edges
  const arrowPressed = pressed & ARROWS;
  if (arrowPressed) {
    if (this._editDown) this._editDown.arrows = true;
    if (this._optDown) this._optDown.arrows = true;
    const dx = (state & KEY.LEFT) ? -1 : (state & KEY.RIGHT) ? 1 : 0;
    const dy = (state & KEY.UP) ? -1 : (state & KEY.DOWN) ? 1 : 0;
    this._arrowAction(dx, dy);
    this._rep = { dx, dy, sel: !!(state & KEY.SEL), opt: !!(state & KEY.OPT), edit: !!(state & KEY.EDIT), t0: now, last: now };
  }
  if ((state & ARROWS) === 0) this._rep = null;
  else if (this._rep) {
    // modifier changed mid-hold: re-arm
    const modsChanged =
      this._rep.sel !== !!(state & KEY.SEL) || this._rep.opt !== !!(state & KEY.OPT) || this._rep.edit !== !!(state & KEY.EDIT);
    if (modsChanged) this._rep = null;
  }
};

VirtualTeensy.prototype._repeatTick = function () {
  if (!this._rep || !this._enabled) return;
  const now = Date.now();
  if (now - this._rep.t0 < 350 || now - this._rep.last < 80) return;
  this._rep.last = now;
  const r = this._rep;
  const st = this.keyState;
  if (r.sel !== !!(st & KEY.SEL) || r.opt !== !!(st & KEY.OPT) || r.edit !== !!(st & KEY.EDIT)) {
    this._rep = null;
    return;
  }
  if (r.edit) this._editBy(r.dx, r.dy);
  else if (r.sel) this._viewNav(r.dx, r.dy);
  else if (r.opt) this._optNav(r.dx, r.dy);
  else this._moveBy(r.dx, r.dy);
};

VirtualTeensy.prototype._arrowAction = function (dx, dy) {
  const st = this.keyState;
  if (st & KEY.EDIT) this._editBy(dx, dy);
  else if (st & KEY.SEL) this._viewNav(dx, dy);
  else if (st & KEY.OPT) this._optNav(dx, dy);
  else this._moveBy(dx, dy);
};

// ---- keyjazz ----------------------------------------------------------------------
VirtualTeensy.prototype.noteOn = function (note, vel = 100) {
  if (!this._enabled) return;
  note = clamp(note | 0, 0, 127);
  vel = clamp(vel | 0, 1, 127);
  // note entry when cursor sits on a phrase note column
  if (this.view === 'PHRASE' && this.cur.phrase.col === 0 && !this.sel) {
    const ph = getPhrase(this.prj, this.phrase, true);
    const row = ph.rows[this.cur.phrase.row];
    row.n = note;
    row.v = vel;
    if (row.i === EMPTY) row.i = this.inst;
    this.lastEdit.note = note;
    this.lastEdit.vel = vel;
    if (this.audio) this.audio.previewNote(row.i === EMPTY ? this.inst : row.i, note, vel);
    this.cur.phrase.row = (this.cur.phrase.row + 1) % STEPS;
    this.markDirty();
    return;
  }
  if (this.audio) {
    const inst = this.view === 'POOL' ? this.cur.pool.idx : this.inst;
    this.audio.previewNote(inst, note, vel);
  }
};

VirtualTeensy.prototype.noteOff = function () {
  if (this.audio) this.audio.previewOff();
};

// ---- transport -----------------------------------------------------------------------
VirtualTeensy.prototype._playToggle = function () {
  if (!this.audio) return;
  if (this.transport.playing) {
    this.audio.stop();
    this.transport.playing = false;
    this.markDirty();
    return;
  }
  const v = this.view;
  if (v === 'SONG' || v === 'MIXER' || v === 'SENDS' || v === 'PROJECT' || v === 'SYSTEM' || v === 'FILE' || v === 'HELP') {
    this._playSong();
  } else if (v === 'CHAIN') {
    this.audio.playChain(this.chain, this.track);
    this.transport.playing = true;
    this.transport.mode = 'chain';
    this.markDirty();
  } else {
    this.audio.playPhrase(this.phrase, this.track);
    this.transport.playing = true;
    this.transport.mode = 'phrase';
    this.markDirty();
  }
};

VirtualTeensy.prototype._playSong = function () {
  if (!this.audio) return;
  if (this.transport.playing) {
    this.audio.stop();
    this.transport.playing = false;
  } else {
    this.audio.playSong(this.cur.song.row);
    this.transport.playing = true;
    this.transport.mode = 'song';
  }
  this.markDirty();
};

VirtualTeensy.prototype._preview = function () {
  if (!this.audio) return;
  const v = this.view;
  if (v === 'FILE' && this.cur.file.tab === 0) {
    this.audio.previewSample(this.cur.file.idx);
    this.status(`PREVIEW SAMPLE ${hex2(this.cur.file.idx)}`, 1200);
    return;
  }
  let inst = this.inst;
  if (v === 'POOL') inst = this.cur.pool.idx;
  if (!getInstrument(this.prj, inst)) {
    this.status('EMPTY INSTRUMENT', 1200);
    return;
  }
  this.audio.previewNote(inst, this.lastEdit.note, this.keyVel);
  this.status(`PREVIEW ${hex2(inst)}`, 1200);
};

VirtualTeensy.prototype._muteTrack = function () {
  const t = this._currentTrack();
  this.muted[t] = !this.muted[t];
  this._pushTrackStates();
  this.status(this.muted[t] ? `MUTED TRACK ${t + 1}` : `UNMUTED TRACK ${t + 1}`, 1200);
  this.markDirty();
};

VirtualTeensy.prototype._soloTrack = function () {
  const t = this._currentTrack();
  this.soloed[t] = !this.soloed[t];
  this._pushTrackStates();
  this.status(this.soloed[t] ? `SOLO TRACK ${t + 1}` : `UNSOLO TRACK ${t + 1}`, 1200);
  this.markDirty();
};

VirtualTeensy.prototype._clearMS = function () {
  this.muted.fill(false);
  this.soloed.fill(false);
  this._pushTrackStates();
  this.status('MUTES+SOLOS CLEARED', 1200);
  this.markDirty();
};

VirtualTeensy.prototype._pushTrackStates = function () {
  if (!this.audio) return;
  for (let t = 0; t < TRACKS; t++) this.audio.setTrackState(t, this.muted[t], this.soloed[t]);
};

VirtualTeensy.prototype._currentTrack = function () {
  if (this.view === 'SONG') return this.cur.song.t;
  return this.track;
};

// ---- view navigation --------------------------------------------------------------------
VirtualTeensy.prototype._viewNav = function (dx, dy) {
  if (this.view === 'HELP') return;
  const pos = mapPos(this.view);
  const nx = clamp(pos.x + dx, 0, 4);
  const ny = clamp(pos.y + dy, 0, 2);
  const v = VIEW_MAP[ny][nx];
  if (!v || v === this.view) {
    // SHIFT+LEFT/RIGHT from INST/TABLE has special FX-default behavior
    if (dy === 0 && (this.view === 'INST' || this.view === 'TABLE')) return this._instFxJump(dx);
    return;
  }
  this._goto(v);
  // entering FILE from INST: remember sample context
  if (v === 'FILE' && this.viewReturn === 'INST') this.cur.file.tab = 0;
};

VirtualTeensy.prototype._goto = function (v) {
  if (this.view !== 'HELP') this.viewReturn = this.view;
  this.view = v;
  this.sel = null;
  if (v === 'FILE') this.refreshFiles().then(() => this.markDirty());
  this.markDirty();
};

VirtualTeensy.prototype._instFxJump = function (dx) {
  // SHIFT+LEFT/RIGHT on instrument param: jump to phrase/table with FX default
  const ins = getInstrument(this.prj, this.inst);
  const map = { CUT: 'CUT', RES: 'RES', VOL: 'VOL', PAN: 'PAN', CHO: 'CHO', DEL: 'DLY', REV: 'REV' };
  if (this.view === 'INST' && ins) {
    const defs = INSTRUMENT_TYPES[ins.type].params;
    const d = defs[this.cur.inst.row - 1];
    if (d && map[d.id]) {
      this.lastEdit.fx = map[d.id];
      this.lastEdit.fxv = ins.p[d.id];
      this.status(`FX DEFAULT: ${map[d.id]}`, 1200);
    }
  }
  this._goto(dx < 0 ? 'PHRASE' : 'TABLE');
};

// ---- selection / clipboard ---------------------------------------------------------------
VirtualTeensy.prototype._toggleSel = function () {
  const sels = ['SONG', 'CHAIN', 'PHRASE', 'TABLE', 'GROOVE', 'MIXER', 'POOL'];
  if (!sels.includes(this.view)) {
    this.status('NO SELECTION HERE', 1000);
    return;
  }
  if (this.sel) {
    this.sel = null;
    this.status('SELECTION OFF', 800);
  } else {
    const { c, r } = this._cursorCR();
    this.sel = { view: this.view, c0: c, r0: r, c1: c, r1: r };
    this.status('SELECTION: ARROWS+OPT=COPY', 1500);
  }
  this.markDirty();
};

VirtualTeensy.prototype._cursorCR = function () {
  switch (this.view) {
    case 'SONG': return { c: this.cur.song.t, r: this.cur.song.row };
    case 'CHAIN': return { c: this.cur.chain.col, r: this.cur.chain.row };
    case 'PHRASE': return { c: this.cur.phrase.col, r: this.cur.phrase.row };
    case 'TABLE': return { c: this.cur.table.col, r: this.cur.table.row };
    case 'GROOVE': return { c: 0, r: this.cur.groove.row };
    case 'MIXER': return { c: this.cur.mixer.col, r: this.cur.mixer.row };
    case 'POOL': return { c: this.cur.pool.idx % 8, r: Math.floor(this.cur.pool.idx / 8) };
    default: return { c: 0, r: 0 };
  }
};

VirtualTeensy.prototype._selRead = function (c, r) {
  const P = this.prj;
  switch (this.view) {
    case 'SONG': return P.song.rows[r] ? P.song.rows[r].ch[c] : EMPTY;
    case 'CHAIN': {
      const ch = getChain(P, this.chain);
      if (!ch) return c === 0 ? EMPTY : 0;
      return c === 0 ? ch.ph[r] : ch.ts[r];
    }
    case 'PHRASE': {
      const ph = getPhrase(P, this.phrase);
      const row = ph ? ph.rows[r] : null;
      if (!row) return c === 0 ? EMPTY : 0;
      if (c === 0) return row.n;
      if (c === 1) return row.v;
      if (c === 2) return row.i;
      const fi = Math.floor((c - 3) / 2);
      return (c - 3) % 2 === 0 ? row.fx[fi].c : row.fx[fi].v;
    }
    case 'TABLE': {
      const ins = getInstrument(P, this.inst);
      const row = ins ? ins.table.rows[r] : null;
      if (!row) return c === 0 ? EMPTY : 0;
      if (c === 0) return row.n;
      if (c === 1) return row.v;
      const fi = Math.floor((c - 2) / 2);
      return (c - 2) % 2 === 0 ? row.fx[fi].c : row.fx[fi].v;
    }
    case 'GROOVE': return P.grooves[this.groove].steps[r];
    case 'MIXER': {
      if (r > 7) return 0;
      const ids = ['vol', 'pan', 'cho', 'del', 'rev'];
      return P.mixer.tracks[r][ids[c]];
    }
    case 'POOL': {
      const idx = r * 8 + c;
      return P.instruments[idx] ? deepClone(P.instruments[idx]) : null;
    }
    default: return 0;
  }
};

VirtualTeensy.prototype._selWrite = function (c, r, val) {
  const P = this.prj;
  switch (this.view) {
    case 'SONG': {
      while (P.song.rows.length <= r) P.song.rows.push({ ch: new Array(TRACKS).fill(EMPTY) });
      P.song.rows[r].ch[c] = val;
      break;
    }
    case 'CHAIN': {
      const ch = getChain(P, this.chain, true);
      if (c === 0) ch.ph[r] = val; else ch.ts[r] = clamp(val | 0, -48, 48);
      break;
    }
    case 'PHRASE': {
      const ph = getPhrase(P, this.phrase, true);
      const row = ph.rows[r];
      if (c === 0) row.n = val;
      else if (c === 1) row.v = clamp(val | 0, 0, 255);
      else if (c === 2) row.i = val;
      else {
        const fi = Math.floor((c - 3) / 2);
        if ((c - 3) % 2 === 0) row.fx[fi].c = val || '';
        else row.fx[fi].v = clamp(val | 0, 0, 255);
      }
      break;
    }
    case 'TABLE': {
      const ins = getInstrument(P, this.inst, true);
      const row = ins.table.rows[r];
      if (c === 0) row.n = val;
      else if (c === 1) row.v = val;
      else {
        const fi = Math.floor((c - 2) / 2);
        if ((c - 2) % 2 === 0) row.fx[fi].c = val || '';
        else row.fx[fi].v = clamp(val | 0, 0, 255);
      }
      break;
    }
    case 'GROOVE': P.grooves[this.groove].steps[r] = clamp(val | 0, 0, 24); break;
    case 'MIXER': {
      if (r > 7) break;
      const ids = ['vol', 'pan', 'cho', 'del', 'rev'];
      P.mixer.tracks[r][ids[c]] = clamp(val | 0, 0, 255);
      break;
    }
    case 'POOL': {
      const idx = r * 8 + c;
      if (val) P.instruments[idx] = deepClone(val);
      else delete P.instruments[idx];
      break;
    }
    default: break;
  }
};

VirtualTeensy.prototype._selClear = function (c, r) {
  const P = this.prj;
  switch (this.view) {
    case 'SONG': if (P.song.rows[r]) P.song.rows[r].ch[c] = EMPTY; break;
    case 'CHAIN': {
      const ch = getChain(P, this.chain);
      if (!ch) break;
      if (c === 0) ch.ph[r] = EMPTY; else ch.ts[r] = 0;
      break;
    }
    case 'PHRASE': {
      const ph = getPhrase(P, this.phrase);
      if (!ph) break;
      const row = ph.rows[r];
      if (c === 0) { row.n = EMPTY; } else if (c === 1) row.v = 64;
      else if (c === 2) row.i = EMPTY;
      else {
        const fi = Math.floor((c - 3) / 2);
        if ((c - 3) % 2 === 0) row.fx[fi].c = ''; else row.fx[fi].v = 0;
      }
      break;
    }
    case 'TABLE': {
      const ins = getInstrument(P, this.inst);
      if (!ins) break;
      const row = ins.table.rows[r];
      if (c === 0) row.n = EMPTY; else if (c === 1) row.v = EMPTY;
      else {
        const fi = Math.floor((c - 2) / 2);
        if ((c - 2) % 2 === 0) row.fx[fi].c = ''; else row.fx[fi].v = 0;
      }
      break;
    }
    case 'GROOVE': P.grooves[this.groove].steps[r] = 0; break;
    case 'MIXER': {
      if (r > 7) break;
      const ids = ['vol', 'pan', 'cho', 'del', 'rev'];
      const defs = { vol: 200, pan: 128, cho: 0, del: 0, rev: 0 };
      P.mixer.tracks[r][ids[c]] = defs[ids[c]];
      break;
    }
    case 'POOL': delete P.instruments[r * 8 + c]; break;
    default: break;
  }
};

VirtualTeensy.prototype._selRect = function () {
  const s = this.sel;
  return {
    c0: Math.min(s.c0, s.c1), r0: Math.min(s.r0, s.r1),
    c1: Math.max(s.c0, s.c1), r1: Math.max(s.r0, s.r1),
  };
};

VirtualTeensy.prototype._copy = function () {
  if (!this.sel || this.sel.view !== this.view) return;
  const { c0, r0, c1, r1 } = this._selRect();
  const data = [];
  for (let r = r0; r <= r1; r++) {
    const row = [];
    for (let c = c0; c <= c1; c++) row.push(deepClone(this._selRead(c, r)));
    data.push(row);
  }
  this.clip = { view: this.view, w: c1 - c0 + 1, h: r1 - r0 + 1, data };
  this.status(`COPIED ${this.clip.w}X${this.clip.h}`, 1200);
  this.markDirty();
};

VirtualTeensy.prototype._paste = function () {
  if (!this.clip) {
    this.status('BUFFER EMPTY', 1000);
    return;
  }
  if (this.clip.view !== this.view) {
    // allow phrase<->table fx-area exchange when shapes align
    const both = ['PHRASE', 'TABLE'].includes(this.clip.view) && ['PHRASE', 'TABLE'].includes(this.view);
    if (!both) {
      this.status('BUFFER IS FOR ' + this.clip.view, 1400);
      return;
    }
  }
  const { c, r } = this._cursorCR();
  // interpolate: single-column numeric clip pasted into an active selection
  if (this.sel && this.sel.view === this.view && this.clip.w === 1 && this.clip.h > 1) {
    const { r0, r1 } = this._selRect();
    const vals = this.clip.data.map((row) => row[0]);
    if (vals.every((v) => typeof v === 'number')) {
      const n = r1 - r0;
      for (let i = 0; i <= n; i++) {
        const t = n === 0 ? 0 : i / n;
        const v = Math.round(vals[0] + (vals[vals.length - 1] - vals[0]) * t);
        this._selWrite(c, r0 + i, v);
      }
      this.status('INTERPOLATED', 1200);
      this.markDirty();
      return;
    }
  }
  for (let y = 0; y < this.clip.h; y++) {
    for (let x = 0; x < this.clip.w; x++) {
      try { this._selWrite(c + x, r + y, deepClone(this.clip.data[y][x])); } catch (e) { /* clip */ }
    }
  }
  this.status(`PASTED ${this.clip.w}X${this.clip.h}`, 1200);
  this.markDirty();
};

VirtualTeensy.prototype._deleteOrDefault = function () {
  // OPT+EDIT: cut selection, else delete row / reset param default
  if (this.sel && this.sel.view === this.view) {
    this._copy();
    const { c0, r0, c1, r1 } = this._selRect();
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this._selClear(c, r);
    this.sel = null;
    this.status('CUT', 1000);
    this.markDirty();
    return;
  }
  const v = this.view;
  if (v === 'SONG') {
    const row = this.prj.song.rows[this.cur.song.row];
    if (row) row.ch.fill(EMPTY);
    this.status('ROW CLEARED', 1000);
  } else if (v === 'CHAIN') {
    const ch = getChain(this.prj, this.chain);
    if (ch) { ch.ph[this.cur.chain.row] = EMPTY; ch.ts[this.cur.chain.row] = 0; }
    this.status('ROW CLEARED', 1000);
  } else if (v === 'PHRASE') {
    const ph = getPhrase(this.prj, this.phrase);
    if (ph) ph.rows[this.cur.phrase.row] = newPhraseRow();
    this.status('ROW CLEARED', 1000);
  } else if (v === 'TABLE') {
    const ins = getInstrument(this.prj, this.inst);
    if (ins) {
      ins.table.rows[this.cur.table.row] = { n: EMPTY, v: EMPTY, fx: [{ c: '', v: 0 }, { c: '', v: 0 }, { c: '', v: 0 }] };
    }
    this.status('ROW CLEARED', 1000);
  } else if (v === 'GROOVE') {
    this.prj.grooves[this.groove].steps[this.cur.groove.row] = 0;
    this.status('STEP=SKIP', 1000);
  } else if (v === 'MIXER') {
    const r = this.cur.mixer.row;
    if (r < 8) this.prj.mixer.tracks[r] = { vol: 200, pan: 128, cho: 0, del: 0, rev: 0 };
    else this.prj.mixer.master = 220;
    this.status('RESET', 1000);
  } else if (v === 'INST') {
    const ins = getInstrument(this.prj, this.inst);
    if (ins && this.cur.inst.row > 0) {
      const d = INSTRUMENT_TYPES[ins.type].params[this.cur.inst.row - 1];
      if (d) ins.p[d.id] = d.def;
      this.status('DEFAULT', 1000);
    }
  } else if (v === 'SENDS') {
    this._sendsWriteDefault();
    this.status('DEFAULT', 1000);
  } else if (v === 'POOL') {
    this._deletePool(this.cur.pool.idx);
    return;
  } else if (v === 'FILE') {
    this._deleteFileEntry();
    return;
  } else {
    return;
  }
  this.markDirty();
};

VirtualTeensy.prototype._clone = function () {
  const P = this.prj;
  const v = this.view;
  if (v === 'SONG') {
    const n = P.song.rows[this.cur.song.row].ch[this.cur.song.t];
    if (n === EMPTY) { this.status('NOTHING TO CLONE', 1200); return; }
    const free = nextFree(P.chains, 256);
    if (free < 0) { this.status('NO FREE CHAINS', 1200); return; }
    P.chains[free] = deepClone(P.chains[n] || newChain());
    this.status(`CLONED CH ${hex2(n)}->${hex2(free)}`, 1600);
  } else if (v === 'CHAIN' && this.cur.chain.col === 0) {
    const ch = getChain(P, this.chain);
    const n = ch ? ch.ph[this.cur.chain.row] : EMPTY;
    if (n === EMPTY) { this.status('NOTHING TO CLONE', 1200); return; }
    const free = nextFree(P.phrases, 256);
    if (free < 0) { this.status('NO FREE PHRASES', 1200); return; }
    P.phrases[free] = deepClone(P.phrases[n] || newPhrase());
    this.status(`CLONED PH ${hex2(n)}->${hex2(free)}`, 1600);
  } else if ((v === 'PHRASE' && this.cur.phrase.col === 2) || v === 'INST' || v === 'POOL' || v === 'TABLE') {
    const n = v === 'PHRASE' ? (getPhrase(P, this.phrase) || {}).rows?.[this.cur.phrase.row]?.i : v === 'POOL' ? this.cur.pool.idx : this.inst;
    if (n === EMPTY || n === undefined || !P.instruments[n]) { this.status('NOTHING TO CLONE', 1200); return; }
    const free = nextFree(P.instruments, 128);
    if (free < 0) { this.status('NO FREE INSTRUMENTS', 1200); return; }
    P.instruments[free] = deepClone(P.instruments[n]);
    this.status(`CLONED IN ${hex2(n)}->${hex2(free)}`, 1600);
  } else {
    this.status('NOTHING TO CLONE', 1200);
    return;
  }
  this.markDirty();
};

// ---- cursor movement ------------------------------------------------------------------
VirtualTeensy.prototype._moveBy = function (dx, dy) {
  if (this.view === 'HELP') { this._helpMove(dy); return; }
  const v = this.view;
  if (v === 'SONG') {
    const c = this.cur.song;
    c.t = clamp(c.t + dx, 0, 7);
    c.row = clamp(c.row + dy, 0, this.prj.song.rows.length - 1);
    if (c.row < c.top) c.top = c.row;
    if (c.row > c.top + 15) c.top = c.row - 15;
    this.track = c.t;
  } else if (v === 'CHAIN') {
    const c = this.cur.chain;
    c.col = clamp(c.col + dx, 0, 1);
    c.row = (c.row + dy + STEPS) % STEPS;
  } else if (v === 'PHRASE') {
    const c = this.cur.phrase;
    c.col = clamp(c.col + dx, 0, 8);
    c.row = (c.row + dy + STEPS) % STEPS;
  } else if (v === 'INST') {
    const ins = getInstrument(this.prj, this.inst);
    const n = 1 + (ins ? INSTRUMENT_TYPES[ins.type].params.length : 0);
    const c = this.cur.inst;
    c.row = clamp(c.row + dy, 0, n - 1);
  } else if (v === 'TABLE') {
    const c = this.cur.table;
    c.col = clamp(c.col + dx, 0, 7);
    c.row = (c.row + dy + STEPS) % STEPS;
  } else if (v === 'GROOVE') {
    const c = this.cur.groove;
    c.row = (c.row + dy + STEPS) % STEPS;
  } else if (v === 'POOL') {
    const c = this.cur.pool;
    c.idx = clamp(c.idx + dx + dy * 8, 0, 127);
  } else if (v === 'FILE') {
    const c = this.cur.file;
    if (c.tab === 0) {
      c.idx = clamp(c.idx + dy, 0, 63);
      if (c.idx < c.top) c.top = c.idx;
      if (c.idx > c.top + 15) c.top = c.idx - 15;
    } else {
      const n = 1 + this.songFiles.length + 1; // save + files + import
      c.idx = clamp(c.idx + dy, 0, n - 1);
      if (c.idx < c.top) c.top = c.idx;
      if (c.idx > c.top + 15) c.top = c.idx - 15;
    }
  } else if (v === 'MIXER') {
    const c = this.cur.mixer;
    c.row = clamp(c.row + dy, 0, 8);
    c.col = c.row === 8 ? 0 : clamp(c.col + dx, 0, 4);
    if (dx && c.row < 8) c.col = clamp(c.col, 0, 4);
  } else if (v === 'SENDS') {
    this.cur.sends.row = clamp(this.cur.sends.row + dy, 0, 11);
  } else if (v === 'PROJECT') {
    const c = this.cur.project;
    if (c.row === 0 && dx) c.nameChar = clamp(c.nameChar + dx, 0, 15);
    else c.row = clamp(c.row + dy, 0, 10);
  } else if (v === 'SYSTEM') {
    const c = this.cur.system;
    c.row = clamp(c.row + dy, 0, 7);
  }
  if (this.sel && this.sel.view === v) {
    const { c, r } = this._cursorCR();
    this.sel.c1 = c;
    this.sel.r1 = r;
  }
  this.markDirty();
};

VirtualTeensy.prototype._helpMove = function (dy) {
  const c = this.cur.help;
  c.idx = clamp(c.idx + dy, 0, FX_ORDER.length - 1);
  if (c.idx < c.top) c.top = c.idx;
  if (c.idx > c.top + 16) c.top = c.idx - 16;
  this.markDirty();
};

// ---- OPT+arrows --------------------------------------------------------------------------
VirtualTeensy.prototype._optNav = function (dx, dy) {
  const v = this.view;
  if (v === 'HELP') return;
  if (v === 'SONG') {
    const c = this.cur.song;
    if (dy) {
      c.row = clamp(c.row + dy * 16, 0, this.prj.song.rows.length - 1);
      if (c.row < c.top) c.top = c.row;
      if (c.row > c.top + 15) c.top = c.row - 15;
    }
    if (dx) {
      // solo tracks left/right of cursor
      for (let t = 0; t < TRACKS; t++) {
        this.soloed[t] = dx < 0 ? t <= c.t : t >= c.t;
      }
      this._pushTrackStates();
      this.status(dx < 0 ? 'SOLO LEFT' : 'SOLO RIGHT', 1000);
    }
  } else if (v === 'CHAIN') {
    if (dy) this._stepChain(dy);
    if (dx) this._stepTrack(dx, true);
  } else if (v === 'PHRASE') {
    if (dy) this._stepPhrase(dy);
    if (dx) this._stepTrack(dx, true);
  } else if (v === 'INST') {
    if (dx) this._setInst(this.inst + dx);
    if (dy) this._setInst(this.inst + dy * 16);
  } else if (v === 'TABLE') {
    if (dx) this._setInst(this.inst + dx);
    if (dy) {
      const ins = getInstrument(this.prj, this.inst, true);
      ins.table.tic = clamp(ins.table.tic + dy, 1, 32);
      this.status(`TABLE TIC ${ins.table.tic}`, 800);
    }
  } else if (v === 'GROOVE') {
    if (dx) this.groove = (this.groove + dx + MAX_GROOVES) % MAX_GROOVES;
    if (dy) this.groove = (this.groove + dy * 4 + MAX_GROOVES * 4) % MAX_GROOVES;
  } else if (v === 'FILE') {
    if (dx) {
      const c = this.cur.file;
      c.tab = (c.tab + dx + 2) % 2;
      c.idx = 0;
      c.top = 0;
    }
  } else if (v === 'POOL') {
    if (dx) this.cur.pool.idx = clamp(this.cur.pool.idx + dx, 0, 127);
    if (dy) this.cur.pool.idx = clamp(this.cur.pool.idx + dy * 16, 0, 127);
  }
  this.markDirty();
};

VirtualTeensy.prototype._stepChain = function (d) {
  // prev/next chain number used in song (fallback: numeric step)
  const used = new Set();
  for (const row of this.prj.song.rows) for (const c of row.ch) if (c !== EMPTY) used.add(c);
  const sorted = [...used].sort((a, b) => a - b);
  if (!sorted.length) {
    this.chain = clamp(this.chain + d, 0, 255);
  } else {
    let i = sorted.indexOf(this.chain);
    if (i < 0) i = d > 0 ? -1 : 0;
    i = (i + d + sorted.length) % sorted.length;
    this.chain = sorted[i];
  }
  // follow: first phrase of chain
  const ch = getChain(this.prj, this.chain);
  if (ch && ch.ph[0] !== EMPTY) this.phrase = ch.ph[0];
  this.markDirty();
};

VirtualTeensy.prototype._stepPhrase = function (d) {
  const ch = getChain(this.prj, this.chain);
  const used = [];
  if (ch) for (const p of ch.ph) if (p !== EMPTY && !used.includes(p)) used.push(p);
  if (!used.length) {
    this.phrase = clamp(this.phrase + d, 0, 255);
  } else {
    let i = used.indexOf(this.phrase);
    if (i < 0) i = d > 0 ? -1 : 0;
    i = (i + d + used.length) % used.length;
    this.phrase = used[i];
  }
  this.markDirty();
};

VirtualTeensy.prototype._stepTrack = function (d, follow) {
  this.track = clamp(this.track + d, 0, 7);
  if (follow) {
    // jump chain/phrase views to this track's material at song cursor
    const row = this.prj.song.rows[this.cur.song.row];
    if (row) {
      const cn = row.ch[this.track];
      if (cn !== EMPTY) {
        this.chain = cn;
        const ch = getChain(this.prj, cn);
        if (ch && ch.ph[0] !== EMPTY) this.phrase = ch.ph[0];
      }
    }
  }
  this.status(`TRACK ${this.track + 1}`, 800);
  this.markDirty();
};

VirtualTeensy.prototype._setInst = function (n) {
  this.inst = clamp(n, 0, 127);
  this.markDirty();
};

installOps(VirtualTeensy);
