import {Channel} from "./channel";
import {DEBUG_LOG_UNKNOWN_WRITES, FM_OVER_144} from "./ym2612";
import {print} from "../client-main";

// 3 channels (they have symmetrical configuration)
export class ChannelSet {
  constructor(memory, channelOffset) {
    this.memoryMap = memory;
    this.name = `ChannelSet[${channelOffset+1}-${channelOffset+3}]`;
    this.channels = [
      new Channel(`CH${channelOffset + 1}`, this, 0),
      new Channel(`CH${channelOffset + 2}`, this, 1),
      new Channel(`CH${channelOffset + 3}`, this, 2)
    ];
  }

  // For 30-8F gives the operator/channel combination
  channelOperator(reg) {
    if ((reg & 3) === 3) return null;
    return this.channels[reg & 3].operators[reg >>> 2 & 3];
  }

  // Called when any register having an effect with the frequency changes
  processFrequencyWrite(channel) {
    print(this.channels[channel], `frequency=${this.channels[channel].frequencyHz}`);
    this.channels[channel].operators.forEach(op => op.updateFrequency());
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
    case 0x30: {
      const operator = this.channelOperator(reg);
      if (operator) {
        operator.process30Write(data);
        return this.processFrequencyWrite(reg & 3);
      }
      break;
    }
    case 0x40: {
      const operator = this.channelOperator(reg);
      if (operator) return operator.process40Write(data);
      break;
    }
    case 0x50: {
      const operator = this.channelOperator(reg);
      if (operator) return operator.process50Write(data);
      break;
    }
    case 0x60: {
      const operator = this.channelOperator(reg);
      if (operator) return operator.process60Write(data);
      break;
    }
    case 0x70: {
      const operator = this.channelOperator(reg);
      if (operator) return operator.process70Write(data);
      break;
    }
    case 0x80: {
      const operator = this.channelOperator(reg);
      if (operator) return operator.process80Write(data);
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