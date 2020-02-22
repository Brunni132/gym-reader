import {Channel} from "./channel";
import {DEBUG_LOG_UNKNOWN_WRITES, FM_OVER_144} from "./ym2612";
import {print} from "../client-main";

// 3 channels (they have symmetrical configuration)
export class ChannelSet {
  constructor(memory, channelOffset) {
    this.memoryMap = memory;
    this.name = `ChannelSet[${channelOffset+1}-${channelOffset+3}]`;
    this.channels = [
      new Channel(`CH${channelOffset + 1}`),
      new Channel(`CH${channelOffset + 2}`),
      new Channel(`CH${channelOffset + 3}`)
    ];
  }

  channelFrequency(channel) {
    const offsetInOctave = (this.memoryMap[0xa4 + channel] & 7) << 8 | this.memoryMap[0xa0 + channel];
    const octave = this.memoryMap[0xa4 + channel] >>> 3 & 7;
    // On the YM3438, the formula is given as
    // F-number(note) = (144 * Fnote * 2^20 / Fm) / 2^(B-1)
    // (With Fnote=frequency in Hz e.g. 440 Hz for A4, Fm=oscillator (8 MHz), B=octave)
    // => Inversely, Fnote = F-number * (Fm / 144) * 2^(B-21)
    return offsetInOctave * FM_OVER_144 * Math.pow(2, octave - 21);
  }

  // For 30-8F gives the operator/channel combination
  channelOperator(reg) {
    if ((reg & 3) === 3) return null;
    return this.channels[reg & 3].operators[reg >>> 2 & 3];
  }

  processFrequencyWrite(channel) {
    print(this.channels[channel], `frequency=${this.channelFrequency(channel)}`);
    this.channels[channel].operators.forEach(op => op.frequency = this.channelFrequency(channel));
  }

  processFeedbackAlgorithm(channel, data) {
    print(this.channels[channel], `algo=${data & 7} feedback=${data >>> 3 & 7}`);
    this.channels[channel].algorithm = data & 7;
  }

  processStereoLfoSensitivity(channel, data) {
    const fms_table = [0, 3.4, 6.7, 10, 14, 20, 40, 80];
    const ams_table = [0, 1.4, 5.9, 11.8];
    const output = ['disabled', 'right', 'left', 'center'];
    print(this.channels[channel], `FMS=+/-${fms_table[data & 3]}% of halftone, AMS=${ams_table[data >>> 3 & 7]}dB, pan=${output[data >>> 6]}`);
  }

  processWrite(part, reg, data) {
    switch (reg & 0xf0) {
    case 0x40: {
      const operator = this.channelOperator(reg);
      print(operator, `writing ${reg.toHex()} data=${data.toHex()}`);
      if (operator) return operator.process40Write(data & 0x7f);
      break;
    }
    case 0x50: {
      const operator = this.channelOperator(reg);
      if (operator) return operator.process50Write(data >>> 6, data & 0x1f);
      break;
    }
    case 0x60: {
      const operator = this.channelOperator(reg);
      if (operator) return operator.process60Write(data >>> 7, data & 0x1f);
      break;
    }
    case 0x70: {
      const operator = this.channelOperator(reg);
      if (operator) return operator.process70Write(data & 0x1f);
      break;
    }
    case 0x80: {
      const operator = this.channelOperator(reg);
      print(operator, `writing ${reg.toHex()} data=${data.toHex()}`);
      if (operator) return operator.process80Write((data >>> 4) * 8, (data & 0xf) * 2 + 1);
      break;
    }

    case 0xa0:
      if (reg < 0xa3) return this.processFrequencyWrite(reg & 3);
      else if (reg >= 0xa4 && reg < 0xa7) return; // MSB frequency
      break;

    case 0xb0:
      if (reg < 0xb3) return this.processFeedbackAlgorithm(reg & 3, data);
      if (reg >= 0xb4 && reg < 0xb7) return this.processStereoLfoSensitivity(reg & 3, data);
      break;
    }
    if (DEBUG_LOG_UNKNOWN_WRITES) {
      console.warn(`YM-${part} reg=${reg.toHex()} data=${data.toHex()}`);
    }
  }
}