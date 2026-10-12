// M8 Virtual Teensy - page shell wiring
// ======================================
// VirtualTeensy engine + WebAudio + IndexedDB, displayed through the
// stock M8WebDisplay Renderer/Parser with keyboard + touch input.

import { Renderer } from '../renderer.js';
import { Parser } from '../parser.js';
import * as Input from '../input.js';
import * as Settings from '../settings.js';
import { VirtualTeensy } from './engine.js';
import { VirtualAudio } from './audio-engine.js';
import { installAudioExtras } from './audio-extras.js';
import { VirtualSD } from './sdcard.js';
import { VirtualConnection } from './connection.js';

installAudioExtras(VirtualAudio);

const $ = (id) => document.getElementById(id);

function toast(msg, ms = 2200) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => t.classList.add('hidden'), ms);
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 4000);
}

const uploadInput = $('upload');
let uploadCb = null;
uploadInput.addEventListener('change', () => {
  const f = uploadInput.files && uploadInput.files[0];
  uploadInput.value = '';
  if (f && uploadCb) {
    const cb = uploadCb;
    uploadCb = null;
    cb(f);
  }
});

function requestUpload(accept, cb) {
  uploadCb = cb;
  uploadInput.accept = accept;
  uploadInput.click();
}

// ---- engine stack ----
const engine = new VirtualTeensy({
  onDownload: download,
  onRequestUpload: requestUpload,
});
const audio = new VirtualAudio();
engine.attachAudio(audio);
engine.attachStorage(new VirtualSD());
const connection = new VirtualConnection(engine);

// ---- display ----
const renderer = new Renderer([0, 0, 0], () => {});
const parser = new Parser(renderer);
connection.onData = (bytes) => {
  try {
    parser.process(bytes);
  } catch (e) {
    console.error('display parser failed', e);
  }
};

// ---- input ----
Input.setup(connection);

// ---- toolbar ----
const pill = $('status-pill');
const recPill = $('rec-pill');
const recTime = $('rec-time');
const display = $('display');

function setPill(text, on) {
  pill.textContent = text;
  pill.classList.toggle('on', !!on);
}

async function enable() {
  if (connection.connected) return;
  setPill('STARTING...', false);
  try {
    await connection.connect();
  } catch (e) {
    console.error(e);
    setPill('AUDIO BLOCKED', false);
    toast('Could not start audio: ' + e.message);
    return;
  }
  $('btn-enable').disabled = true;
  setPill(audio.isWasm() ? 'VIRTUAL TEENSY ● WASM' : 'VIRTUAL TEENSY ● JS DSP', true);
  toast('Demo song loaded — press Play (Space)');
}

$('btn-enable').addEventListener('click', enable);
$('connect').addEventListener('click', enable);

// touch pad visibility (persisted)
function setPad(on) {
  display.classList.toggle('with-controls', on);
  Settings.save('vpad', on);
}
setPad(Settings.load('vpad', 'ontouchstart' in window));
$('btn-pad').addEventListener('click', () => setPad(!display.classList.contains('with-controls')));

// key mapping toggle
$('btn-map').addEventListener('click', () => {
  if (Input.isMapping) Input.stopMapping();
  else {
    Input.startMapping();
    toast('Click a control, then press a key or pad button');
  }
});

// fullscreen
$('btn-full').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) {
    toast('Fullscreen unavailable');
  }
});

// help overlay
const help = $('help');
$('btn-help').addEventListener('click', () => help.classList.toggle('hidden'));
$('help-ok').addEventListener('click', () => help.classList.add('hidden'));

// REC indicator poll
setInterval(() => {
  if (engine.rec && engine.rec.active) {
    recPill.classList.remove('hidden');
    recPill.classList.add('rec');
    const s = engine.rec.secs || 0;
    recTime.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  } else {
    recPill.classList.add('hidden');
    recPill.classList.remove('rec');
  }
}, 500);

// release all keys if the window loses focus (stuck-key guard)
window.addEventListener('blur', () => connection.sendKeys(0));

// auto-enable note: browsers require a user gesture for audio, so the
// engine boots on the first click anywhere (in addition to Enable).
window.addEventListener('pointerdown', function firstGesture() {
  window.removeEventListener('pointerdown', firstGesture);
  enable();
}, { once: true });

console.log('M8 Virtual Teensy shell ready');
