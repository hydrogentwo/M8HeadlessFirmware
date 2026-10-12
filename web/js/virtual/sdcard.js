// M8 Virtual Teensy - SD card storage (IndexedDB with memory fallback)
// ====================================================================
// Persists songs (.m8s JSON), samples (Float32 PCM) and settings.
// Falls back to in-memory maps when IndexedDB is unavailable.

const DB_NAME = 'm8-virtual-sd';
const DB_VER = 1;

export class VirtualSD {
  constructor() {
    this._db = null;
    this._mem = null;
    this._opening = null;
  }

  async _open() {
    if (this._db || this._mem) return;
    if (this._opening) {
      await this._opening;
      return;
    }
    this._opening = (async () => {
      try {
        if (!('indexedDB' in window)) throw new Error('no indexedDB');
        this._db = await new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME, DB_VER);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('songs')) db.createObjectStore('songs', { keyPath: 'name' });
            if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'slot' });
            if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'k' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      } catch (e) {
        console.warn('IndexedDB unavailable, using memory storage', e);
        this._mem = { songs: new Map(), samples: new Map(), kv: new Map() };
      }
    })();
    await this._opening;
    this._opening = null;
  }

  _tx(store, mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(store, mode);
      const st = tx.objectStore(store);
      const req = fn(st);
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
    });
  }

  // ---- songs ----
  async saveSong(name, data) {
    await this._open();
    const rec = { name, data, updated: Date.now() };
    if (this._mem) {
      this._mem.songs.set(name, rec);
      return;
    }
    await this._tx('songs', 'readwrite', (st) => st.put(rec));
  }

  async getSong(name) {
    await this._open();
    if (this._mem) return this._mem.songs.get(name) || null;
    const r = await this._tx('songs', 'readonly', (st) => st.get(name));
    return r || null;
  }

  async listSongs() {
    await this._open();
    if (this._mem) return [...this._mem.songs.values()].map((r) => ({ name: r.name, updated: r.updated }));
    const all = await this._tx('songs', 'readonly', (st) => st.getAll());
    return (all || []).map((r) => ({ name: r.name, updated: r.updated }));
  }

  async deleteSong(name) {
    await this._open();
    if (this._mem) {
      this._mem.songs.delete(name);
      return;
    }
    await this._tx('songs', 'readwrite', (st) => st.delete(name));
  }

  // ---- samples ----
  async saveSample(slot, name, sr, ch0, ch1) {
    await this._open();
    const rec = { slot, name, sr, ch0: Float32Array.from(ch0), ch1: ch1 ? Float32Array.from(ch1) : null };
    if (this._mem) {
      this._mem.samples.set(slot, rec);
      return;
    }
    await this._tx('samples', 'readwrite', (st) => st.put(rec));
  }

  async getSample(slot) {
    await this._open();
    if (this._mem) return this._mem.samples.get(slot) || null;
    const r = await this._tx('samples', 'readonly', (st) => st.get(slot));
    return r || null;
  }

  async listSamples() {
    await this._open();
    const all = this._mem ? [...this._mem.samples.values()] : await this._tx('samples', 'readonly', (st) => st.getAll());
    return (all || [])
      .map((r) => ({ slot: r.slot, name: r.name, sr: r.sr, len: r.ch0 ? r.ch0.length : 0 }))
      .sort((a, b) => a.slot - b.slot);
  }

  async deleteSample(slot) {
    await this._open();
    if (this._mem) {
      this._mem.samples.delete(slot);
      return;
    }
    await this._tx('samples', 'readwrite', (st) => st.delete(slot));
  }

  // ---- settings ----
  async saveSettings(obj) {
    await this._open();
    if (this._mem) {
      this._mem.kv.set('settings', obj);
      return;
    }
    await this._tx('kv', 'readwrite', (st) => st.put({ k: 'settings', v: obj }));
  }

  async getSettings() {
    await this._open();
    if (this._mem) return this._mem.kv.get('settings') || null;
    const r = await this._tx('kv', 'readonly', (st) => st.get('settings'));
    return r ? r.v : null;
  }

  async stats() {
    await this._open();
    let songs = 0;
    let samples = 0;
    let bytes = 0;
    if (this._mem) {
      songs = this._mem.songs.size;
      samples = this._mem.samples.size;
      for (const r of this._mem.songs.values()) bytes += (r.data || '').length;
      for (const r of this._mem.samples.values()) bytes += (r.ch0 ? r.ch0.length : 0) * 4;
    } else {
      const sg = await this._tx('songs', 'readonly', (st) => st.getAll());
      const sm = await this._tx('samples', 'readonly', (st) => st.getAll());
      songs = (sg || []).length;
      samples = (sm || []).length;
      for (const r of sg || []) bytes += (r.data || '').length;
      for (const r of sm || []) bytes += (r.ch0 ? r.ch0.length : 0) * 4;
    }
    return { songs, samples, mb: (bytes / 1048576).toFixed(1) };
  }
}
