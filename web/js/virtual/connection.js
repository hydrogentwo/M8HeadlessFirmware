// M8 Virtual Teensy - connection bridge
// =======================================
// Adapts the VirtualTeensy engine to the connection interface the
// M8WebDisplay frontend expects: sendKeys(bitmask) in, SLIP display
// packets out. The engine self-pumps (15fps refresh + on-demand
// redraws) and pushes display data through its onData callback.
//
// Bitmask layout matches the stock frontend exactly:
//   bit7 left, bit6 up, bit5 down, bit4 select(shift),
//   bit3 start(play), bit2 right, bit1 option, bit0 edit.

import { KEY } from './engine.js';

export class VirtualConnection {
  constructor(engine) {
    this.engine = engine;
    this.onData = null; // (Uint8Array SLIP chunk) => void
    this.connected = false;
    const prev = engine.onData;
    engine.onData = (bytes) => {
      if (prev) prev(bytes);
      if (this.onData && this.connected) this.onData(bytes);
    };
  }

  async connect() {
    if (this.connected) return;
    this.connected = true;
    await this.engine.enable();
  }

  disconnect() {
    this.connected = false;
    try {
      this.engine.sendKeys(0);
    } catch (e) { /* ignore */ }
    this.engine.disconnect();
  }

  reset() {
    this.engine.reset();
  }

  // Stock frontend passes an int bitmask; also accepts a state object.
  sendKeys(state) {
    if (!this.connected) return;
    if (typeof state === 'number') {
      this.engine.sendKeys(state & 0xff);
      return;
    }
    let mask = 0;
    if (state.up) mask |= KEY.UP;
    if (state.down) mask |= KEY.DOWN;
    if (state.left) mask |= KEY.LEFT;
    if (state.right) mask |= KEY.RIGHT;
    if (state.shift || state.select) mask |= KEY.SEL;
    if (state.play || state.start) mask |= KEY.STA;
    if (state.option) mask |= KEY.OPT;
    if (state.edit) mask |= KEY.EDIT;
    this.engine.sendKeys(mask);
  }

  sendNoteOn(note, vel = 100) {
    if (this.connected) this.engine.noteOn(note, vel);
  }

  sendNoteOff() {
    if (this.connected) this.engine.noteOff();
  }

  // aliases
  noteOn(note, vel) {
    this.sendNoteOn(note, vel);
  }

  noteOff() {
    this.sendNoteOff();
  }
}
