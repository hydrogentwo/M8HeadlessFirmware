# M8 Virtual Teensy

A complete M8 tracker experience in the browser — **no Teensy 4.1 required**.
The virtual firmware reimplements the tracker engine (song/chain/phrase,
instruments, tables, mixer, grooves), a WebAssembly DSP core (synths, sampler,
delay/reverb/chorus), and a 24-PPQN lookahead sequencer, displayed through the
stock M8WebDisplay frontend.

Open `index.html` (or serve this directory) and press **Launch Tracker**.

## Quick start

```sh
cd web
python3 -m http.server 8000   # any static server works
# open http://localhost:8000/virtual.html
```

Click **Enable** (browsers require a gesture for audio). A demo song loads —
press **Play** (`Space`) to hear it.

## Controls

| Action | Keyboard | Touch pad |
|---|---|---|
| Arrows | Arrow keys | D-pad |
| Shift (view nav, combos) | Left Shift | SHIFT |
| Play / stop | Space | PLAY |
| Option | Z | OPT |
| Edit | X | EDIT |
| Notes (keyjazz) | A – ' | – |
| Octave / velocity | -/=, [/] | – |

Remap keys with the **Map** button. Shift+arrows switch views.

## Architecture

```text
virtual.html / main.js            page shell, toolbar, upload/download
  ├─ engine.js + engine-ops.js    tracker state machine, editing ops
  ├─ views.js                     320x240 display renderers (all views)
  ├─ song.js                      project model + serialize/deserialize
  ├─ fx.js                        FX command table + help
  ├─ audio-engine.js              24-PPQN lookahead sequencer, voice resolve
  ├─ audio-extras.js              tables, Web MIDI, previews, WAV bounce
  ├─ worklet.js                   AudioWorklet host (events, scope, levels)
  ├─ dsp-graph.js                 mixer graph (16 voices, sends, master)
  ├─ dsp/voices.ts → voices.wasm  AssemblyScript DSP core (8 voice models)
  ├─ dsp-fallback.js              bit-identical JS fallback (no WASM needed)
  ├─ sdcard.js                    IndexedDB persistence (memory fallback)
  ├─ connection.js                key-bitmask ↔ engine adapter
  └─ demo.js                      demo song + synthesized drum kit
```

Display and input reuse the stock M8WebDisplay modules (`js/renderer.js`,
`js/parser.js`, `js/input.js`, `js/keyboard.js`) unmodified; the engine speaks
the same SLIP protocol (rect/text/wave/system frames) as the real firmware.

## Sequencer details

- Song / chain / phrase / aux-table transport with independent track lengths;
  empty song rows are skipped (zero time) and songs loop.
- Per-track grooves (16 × 16, ticks per step, 0 = skip step).
- Held FX (CUT/RES/SHP/CHO/DLY/REV/MVO/GRV) persist until changed; row FX
  (VOL/PIT/PAN/PSL/VIB/ARP/TUN/INS/RET/ARP/KIL/DEL/HOP/NTH/TBL/TIC/TPO)
  apply per row. TPO sets live tempo (BPM = value/2).
- Aux tables: per-step transpose/velocity/FX at TIC rate with live pitch
  (WASM `setFreq`), table HOP loops, TBL chaining, KIL/RET support.
  DEL/TPO/GRV/ARP/PSL/VIB/INS/MVO/SHP/NTH have no effect inside tables.
- MIDI instruments send note/bank/program on the selected channel via Web MIDI
  (needs a MIDI output device); table pitch and RET/ARP do not apply to MIDI.
- 8 track voices + 4 preview voices (keyjazz, audition). Live mixer moves,
  mutes/solos and MVO apply within ~200 ms.

## Instruments

WAVSYNTH (saw/sqr/tri/sin/noise/FM/supersaw/Karplus-Pluck), FMSYNTH
(2-op, 16 ratios), MACROSYNTH (8 models + timbre/color), HYPERSYNTH
(supersaw stack + sub), SAMPLER (64 slots, start/length, fwd/ping-pong loop,
slicing) and MIDIOUT. Sampler pitch base is C4; samples are mono (uploads are
mixed down, capped at 30 s).

## Storage

Songs (`.vm8.json`), samples (Float32 PCM) and settings live in IndexedDB
(`m8-virtual-sd`), with an in-memory fallback. Autosave restores on boot.
FILE view: save/load/rename/delete, sample import (audio file → slot),
song export/import, master WAV bounce (auto-starts the song if stopped).

## Differences from hardware

- Emulation is workflow-level, not cycle-exact; synth/DSP models are original
  approximations, not the M8 firmware.
- No USB audio/serial, no SD-card file compatibility (`.m8s` not supported),
  no gamepad polling yet, no theme/font upload.
- Sampler is mono; chorus has 2 of the M8's modes; delay time is linear ms.

## Development

```sh
cd web
npm install            # assemblyscript toolchain (for DSP rebuilds)
npm run build:dsp      # rebuild dsp/voices.wasm from dsp/voices.ts
npm test               # wasm + engine + fallback + sequencer + demo + smoke
```

## Licenses

- `js/renderer.js`, `js/parser.js`, `js/input.js`, `js/keyboard.js`,
  `js/settings.js`, `js/util.js`, fonts, icons, and adapted CSS: MIT,
  © James Deery (M8WebDisplay) — see `THIRD_PARTY_M8WebDisplay_MIT.txt`.
- Everything under `js/virtual/`, `dsp/`, tests, shell and docs: same license
  as this repository (see root `LICENSE`).
