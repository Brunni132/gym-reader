import {Channel} from "./channel.js";
import {DEBUG_LOG_UNKNOWN_WRITES, FM_OVER_144} from "./ym2612.js";
import {print} from "../client-main.js";

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
    return this.channels[reg & 3].operators[[0, 2, 1, 3][reg >>> 2 & 3]];
  }

  processWrite(part, reg, data) {
    switch (reg & 0xf0) {
    case 0x30: {
      const operator = this.channelOperator(reg);
      if (operator) {
        operator.process30Write(data);
        return operator.updateFrequency();
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
      if (reg < 0xa3) return this.channels[reg & 3].processFrequencyWrite(data);
      else if (reg >= 0xa4 && reg < 0xa7) return; // MSB frequency (do not trigger anything as LSB must be written last)
      break;

    case 0xb0:
      if (reg < 0xb3) return this.channels[reg & 3].processAlgoFeedbackWrite(data);
      if (reg >= 0xb4 && reg < 0xb7) return this.channels[reg & 3].processStereoLfoSensitivity(data);
      break;
    }
    if (DEBUG_LOG_UNKNOWN_WRITES) {
      console.warn(`YM-${part} reg=${reg.toHex()} data=${data.toHex()}`);
    }
  }
}