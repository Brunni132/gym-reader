import {Operator} from "./operator";
import {FM_OVER_144} from "./ym2612";

export class Channel {
  constructor(name, channelSet, channelNo) {
    this.name = `[${name}]`;
    this.channelSet = channelSet;
    this.channelNo = channelNo; // inside the ChannelSet
    this.operators = [
      new Operator(`${name} OP1`, this),
      new Operator(`${name} OP2`, this),
      new Operator(`${name} OP3`, this),
      new Operator(`${name} OP4`, this)
    ];
    this.algorithm = 0;
  }

  // Offset in octave (also called F-number)
  get fnumber() {
    return (this.channelSet.memoryMap[0xa4 + this.channelNo] & 7) << 8 | this.channelSet.memoryMap[0xa0 + this.channelNo];
  }

  // Octave (also called block)
  get block() {
    return this.channelSet.memoryMap[0xa4 + this.channelNo] >>> 3 & 7;
  }

  // Reads from the registers (previous write) and returns a frequency in Hz
  get frequencyHz() {
    // On the YM3438, the formula is given as
    // F-number(note) = (144 * Fnote * 2^20 / Fm) / 2^(B-1)
    // (With Fnote=frequency in Hz e.g. 440 Hz for A4, Fm=oscillator (8 MHz), B=octave)
    // => Inversely, Fnote = F-number * (Fm / 144) * 2^(B-21)
    return this.fnumber * FM_OVER_144 * Math.pow(2, this.block - 21);
  }

  processSamples(outputSamples) {
    const slotPerAlgo = [
      8,
      8,
      8,
      8,
      8 + 2,
      2 + 4 + 8,
      2 + 4 + 8,
      1 + 2 + 4 + 8,
    ];

    for (let i = 0; i < 4; i++) {
      if ((slotPerAlgo[this.algorithm] & (1 << i))) {
        this.operators[i].processSamples(outputSamples);
      }
    }
    return outputSamples;
  }
}