import {Operator} from "./operator";
import {FM_OVER_144} from "./ym2612";
import {DEBUG_frameNo, print} from "../client-main";

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

  processSamples(numSamples) {
    const output = Array(numSamples);
    let buffer2;

    print(this, `Algorithm ${this.algorithm}`);

    switch (this.algorithm) {
    case 0:
      this.operators[0].processSamples(null, output, false);
      this.operators[1].processSamples(output, output, false);
      this.operators[2].processSamples(output, output, false);
      this.operators[3].processSamples(output, output, false);
      break;
    case 1:
      buffer2 = output.slice();
      this.operators[0].processSamples(null, output, false);
      this.operators[1].processSamples(null, output, true);
      this.operators[2].processSamples(output, output, false);
      this.operators[3].processSamples(output, output, false);
      break;
    case 2:
      buffer2 = output.slice();
      this.operators[0].processSamples(null, output, false);
      this.operators[1].processSamples(null, buffer2, false);
      this.operators[2].processSamples(buffer2, output, true);
      this.operators[3].processSamples(output, output, false);
      break;
    case 3:
      this.operators[0].processSamples(null, output, false);
      this.operators[1].processSamples(output, output, false);
      this.operators[2].processSamples(null, output, true);
      this.operators[3].processSamples(output, output, false);
      break;
    case 4:
      buffer2 = output.slice();
      this.operators[0].processSamples(null, output, false);
      this.operators[1].processSamples(output, output, false);
      this.operators[2].processSamples(null, buffer2, false);
      this.operators[3].processSamples(buffer2, output, true);
      break;
    case 5:
      buffer2 = output.slice();
      this.operators[0].processSamples(null, buffer2, false);
      this.operators[1].processSamples(buffer2, output, false);
      this.operators[2].processSamples(buffer2, output, true);
      this.operators[3].processSamples(buffer2, output, true);
      break;
    case 6:
      this.operators[0].processSamples(null, output, false);
      this.operators[1].processSamples(output, output, false);
      this.operators[2].processSamples(null, output, true);
      this.operators[3].processSamples(null, output, true);
      break;
    case 7:
      this.operators[0].processSamples(null, output, false);
      this.operators[1].processSamples(null, output, true);
      this.operators[2].processSamples(null, output, true);
      this.operators[3].processSamples(null, output, true);
      break;
    }
    return output;

    //const outputSamples = Array(numSamples).fill(0);
    //const slotPerAlgo = [
    //  8,
    //  8,
    //  8,
    //  8,
    //  8 + 2,
    //  2 + 4 + 8,
    //  2 + 4 + 8,
    //  1 + 2 + 4 + 8,
    //];
    //
    //for (let i = 0; i < 4; i++) {
    //  if ((slotPerAlgo[this.algorithm] & (1 << i))) {
    //    this.operators[i].processSamples(null, outputSamples, false);
    //  }
    //}
    //return outputSamples;
  }
}