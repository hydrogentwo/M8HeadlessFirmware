// M8 Virtual Teensy - connection bridge
// =======================================
// Adapts the VirtualTeensy engine to the connection interface the page
// shell expects: key state in, SLIP display packets out. The engine
// self-pumps (15fps refresh + on-demand redraws) and pushes display
// data through its onData callback, so this is a thin adapter.
//
// Engine key bits: SEL = Shift, STA = Play(Start), OPT = Option.

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
    this.engine.disconnect();
  }

  reset() {
    this.engine.reset();
  }

  // state: {up,down,left,right,shift,play,option,select,edit}
  sendKeys(state) {
    if (!this.connected) return;
    let mask = 0;
    if (state.up) mask |= KEY.UP;
    if (state.down) mask |= KEY.DOWN;
    if (state.left) mask |= KEY.LEFT;
    if (state.right) mask |= KEY.RIGHT;
    if (state.shift || state.select) mask |= KEY.SEL;
    if (state.play) mask |= KEY.STA;
    if (state.option) mask |= KEY.OPT;
    if (state.edit) mask |= KEY.EDIT;
    this.engine.sendKeys(mask);
  }

  noteOn(note, vel = 100) {
    if (this.connected) this.engine.noteOn(note, vel);
  }

  noteOff() {
    if (this.connected) this.engine.noteOff();
  }
}
