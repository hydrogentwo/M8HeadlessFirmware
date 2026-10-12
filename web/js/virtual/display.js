// M8 Virtual Teensy - display composer + SLIP encoding
// ======================================================
// The virtual engine draws into a 39x24 character grid (the same
// 320x240, 8x10-glyph screen the real headless firmware drives)
// and emits byte-identical M8 SLIP display frames, so the stock
// M8 display clients render virtual output pixel-for-pixel like
// hardware output.
//
// Frame types (device -> host), matching m8c / M8WebDisplay:
//   0xFE rect : x16 y16 w16 h16 r g b          (12 bytes)
//   0xFD char : c x16 y16 fg(3) bg(3)          (12 bytes)
//   0xFC wave : r g b Tiefschwarz[0..320]                 (4..324 bytes)
//   0xFF sys  : hw vmaj vmin vpatch fontmode   (6 bytes)
//   0xFB pad  : key state                      (3 bytes, unused here)

export const COLS = 39;
export const ROWS = 24;
export const GLYPH_W = 8;
export const GLYPH_H = 10;

export const THEMES = {
  M8: {
    name: 'M8',
    bg: [9, 10, 18],
    fg: [205, 205, 215],
    dim: [105, 105, 128],
    faint: [58, 58, 78],
    head: [0, 229, 255],
    accent: [255, 204, 0],
    cursorBg: [235, 238, 248],
    cursorFg: [10, 10, 14],
    selBg: [28, 66, 128],
    playBg: [52, 40, 10],
    playFg: [255, 224, 102],
    ok: [120, 255, 130],
    err: [255, 90, 90],
    wave: [0, 255, 140],
    track: [150, 220, 255],
  },
  AMBER: {
    name: 'AMBER',
    bg: [16, 9, 2],
    fg: [255, 196, 110],
    dim: [150, 105, 55],
    faint: [80, 55, 28],
    head: [255, 170, 40],
    accent: [255, 240, 200],
    cursorBg: [255, 190, 90],
    cursorFg: [20, 10, 0],
    selBg: [110, 60, 10],
    playBg: [70, 40, 5],
    playFg: [255, 230, 160],
    ok: [190, 255, 140],
    err: [255, 110, 80],
    wave: [255, 170, 40],
    track: [255, 220, 150],
  },
  GHOST: {
    name: 'GHOST',
    bg: [224, 228, 232],
    fg: [30, 34, 40],
    dim: [110, 118, 128],
    faint: [170, 176, 184],
    head: [0, 120, 180],
    accent: [180, 90, 0],
    cursorBg: [25, 28, 34],
    cursorFg: [235, 240, 244],
    selBg: [150, 200, 240],
    playBg: [255, 236, 180],
    playFg: [120, 70, 0],
    ok: [0, 150, 60],
    err: [200, 30, 30],
    wave: [0, 140, 120],
    track: [0, 110, 170],
  },
};

export const THEME_KEYS = Object.keys(THEMES);

function sameColor(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

export class Composer {
  constructor(cols = COLS, rows = ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.cells = [];
    this.rects = [];
    this.bg = [0, 0, 0];
    for (let i = 0; i < cols * rows; i++) {
      this.cells.push({ c: ' ', fg: [200, 200, 200], bg: null });
    }
  }

  cls(bg) {
    this.bg = bg.slice();
    this.rects = [{ x: 0, y: 0, w: 320, h: 240, c: bg.slice() }];
    for (const cell of this.cells) {
      cell.c = ' ';
      cell.fg = [200, 200, 200];
      cell.bg = null;
    }
  }

  cellAt(c, r) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return null;
    return this.cells[r * this.cols + c];
  }

  // Print clipped ASCII text. fg/bg are [r,g,b] (bg null = screen bg).
  print(str, c, r, fg, bg = null) {
    str = String(str);
    for (let i = 0; i < str.length; i++) {
      const cell = this.cellAt(c + i, r);
      if (!cell) break;
      let ch = str[i];
      if (ch < ' ' || ch > '~') ch = '?';
      cell.c = ch;
      if (fg) cell.fg = fg;
      if (bg) cell.bg = bg;
    }
    return c + str.length;
  }

  printRight(str, lastC, r, fg, bg = null) {
    str = String(str);
    return this.print(str, lastC - str.length + 1, r, fg, bg);
  }

  center(str, r, fg, bg = null, width = this.cols) {
    str = String(str);
    const c = Math.max(0, Math.floor((width - str.length) / 2));
    return this.print(str, c, r, fg, bg);
  }

  // Highlight a cell range (drawn as canvas rect under the text).
  rectCells(c, r, w, h, color) {
    this.rects.push({
      x: c * GLYPH_W,
      y: r * GLYPH_H,
      w: w * GLYPH_W,
      h: h * GLYPH_H,
      c: color.slice(),
    });
    // also tag cells so char frames carry the bg (for m8c-style clients)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const cell = this.cellAt(c + x, r + y);
        if (cell) cell.bg = color;
      }
    }
  }

  // Batched frames: rects first, then every character cell.
  frames() {
    const out = [];
    for (const rc of this.rects) {
      const f = new Uint8Array(12);
      f[0] = 0xfe;
      f[1] = rc.x & 0xff;
      f[2] = (rc.x >> 8) & 0xff;
      f[3] = rc.y & 0xff;
      f[4] = (rc.y >> 8) & 0xff;
      f[5] = rc.w & 0xff;
      f[6] = (rc.w >> 8) & 0xff;
      f[7] = rc.h & 0xff;
      f[8] = (rc.h >> 8) & 0xff;
      f[9] = rc.c[0];
      f[10] = rc.c[1];
      f[11] = rc.c[2];
      out.push(f);
    }
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.cells[r * this.cols + c];
        const f = new Uint8Array(12);
        const bg = cell.bg || this.bg;
        f[0] = 0xfd;
        f[1] = cell.c.charCodeAt(0) & 0xff;
        const x = c * GLYPH_W;
        const y = r * GLYPH_H;
        f[2] = x & 0xff;
        f[3] = (x >> 8) & 0xff;
        f[4] = y & 0xff;
        f[5] = (y >> 8) & 0xff;
        f[6] = cell.fg[0];
        f[7] = cell.fg[1];
        f[8] = cell.fg[2];
        f[9] = bg[0];
        f[10] = bg[1];
        f[11] = bg[2];
        out.push(f);
      }
    }
    return out;
  }

  // Plain-text snapshot for tests / debugging.
  textRows() {
    const rows = [];
    for (let r = 0; r < this.rows; r++) {
      let s = '';
      for (let c = 0; c < this.cols; c++) s += this.cells[r * this.cols + c].c;
      rows.push(s);
    }
    return rows;
  }
}

// ---- SLIP ----------------------------------------------------------------
const END = 0xc0;
const ESC = 0xdb;
const ESC_END = 0xdc;
const ESC_ESC = 0xdd;

export function slipEncode(payloads) {
  // worst case: every byte escaped + END per frame
  let total = 0;
  for (const p of payloads) total += p.length * 2 + 1;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of payloads) {
    for (let i = 0; i < p.length; i++) {
      const b = p[i];
      if (b === END) {
        out[o++] = ESC;
        out[o++] = ESC_END;
      } else if (b === ESC) {
        out[o++] = ESC;
        out[o++] = ESC_ESC;
      } else {
        out[o++] = b;
      }
    }
    out[o++] = END;
  }
  return out.subarray(0, o);
}

export function waveFrame(r, g, b, data) {
  const f = new Uint8Array(4 + data.length);
  f[0] = 0xfc;
  f[1] = r;
  f[2] = g;
  f[3] = b;
  f.set(data, 4);
  return f;
}

export function emptyWaveFrame(r, g, b) {
  return new Uint8Array([0xfc, r, g, b]);
}

export function systemFrame(hw, vmaj, vmin, vpatch, fontMode) {
  return new Uint8Array([0xff, hw, vmaj, vmin, vpatch, fontMode]);
}
