import {GLOBAL_ATTENUATION, SAMPLE_RATE, SOURCE_FUNCTION} from "./ym2612";
import {DEBUG_frameNo, print} from "../client-main";

const PHASE_ATTACK = 0, PHASE_DECAY = 1, PHASE_SUSTAIN = 2, PHASE_RELEASE = 3;
// From the 10-bit attenuation value over time (averaged and multiplied by 8)
const ATTENUATION_INCREMENT_TABLE = [
  0, 0, 4, 4, // 0-15
  4, 4, 6, 6,
  4, 5, 6, 7,
  4, 5, 6, 7,

  4, 5, 6, 7, // 16-31
  4, 5, 6, 7,
  4, 5, 6, 7,
  4, 5, 6, 7,

  4, 5, 6, 7, // 32-47
  4, 5, 6, 7,
  4, 5, 6, 7,
  4, 5, 6, 7,

  8, 10, 12, 14, // 48-63
  16, 20, 24, 28,
  32, 40, 48, 56,
  64, 64, 64, 64
];

export class Operator {
  constructor(name, channel) {
    this.name = `[${name}]`;
    this.channel = channel;
    this.angle = 0;
    this.frequency = 0;
    this.freqDetune = 0;
    this.freqMultiple = 0;
    this.keyScalingNote = 0;
    this.keyScalingFactor = 0;
    this.sampleNumber = 0;
    this.envelope = {
      counter: 0,
      totalAttenuation: 0, // Total level
      phase: PHASE_RELEASE,
      get currentPhaseParams() { return this.phaseParams[this.phase]; },
      // for each phase, slope and final point
      phaseParams: [
        {rate: 0, endAttenuation: 0x000}, // PHASE_ATTACK
        {rate: 0, endAttenuation: 0x3ff}, // PHASE_DECAY
        {rate: 0, endAttenuation: 0x3ff}, // PHASE_SUSTAIN
        {rate: 0, endAttenuation: 0x3ff}, // PHASE_RELEASE
      ],
      attenuation: 0x3ff,
    };
  }

  // Done every 3 samples
  calcEnvelope() {
    let rate = this.envelope.currentPhaseParams.rate;
    if (rate > 0) {
      rate *= 2;
      // key scaling (page 29 YM2608J translated)
      rate += this.keyScalingNote >>> (3 - this.keyScalingFactor);
      if (rate > 63) rate = 63;
    }

    // Determines every how many iterations we get the attenuation-increment-value in the table
    let counterShiftValue = 11 - (rate >>> 2);
    if (counterShiftValue < 0) counterShiftValue = 0;

    if (++this.envelope.counter % (1 << counterShiftValue) === 0) {
      const attenuationIncrement = ATTENUATION_INCREMENT_TABLE[rate] / 8;
      //this.envelope.counter = 0;
      if (this.envelope.phase === PHASE_ATTACK) {
        // Simulation discrète d'exponentielle
        this.envelope.attenuation += (~this.envelope.attenuation * attenuationIncrement) >> 4;
        print(this, `atn[ATK]=${this.envelope.attenuation} to ${this.envelope.currentPhaseParams.endAttenuation}`);

        if (this.envelope.attenuation <= this.envelope.currentPhaseParams.endAttenuation) {
          this.envelope.attenuation = this.envelope.currentPhaseParams.endAttenuation;
          this.envelope.phase++;
        }
      } else {
        this.envelope.attenuation += attenuationIncrement;
        print(this, `atn[${this.envelope.phase}]=${this.envelope.attenuation} to ${this.envelope.currentPhaseParams.endAttenuation}`);

        if (this.envelope.attenuation >= this.envelope.currentPhaseParams.endAttenuation) {
          this.envelope.attenuation = this.envelope.currentPhaseParams.endAttenuation;
          if (this.envelope.phase === PHASE_DECAY) {
            this.envelope.phase++;
            print(this, `next from decay`);
          }
        }
      }
    }
  }

  processKeyOn(on) {
    this.envelope.phase = on ? PHASE_ATTACK : PHASE_RELEASE;
  }

  process30Write(data) {
    const detune = data >>> 4 & 0x7, multiple = data & 0xf;
    print(this, `detune=${detune} multiple=${multiple}`);
    this.freqDetune = detune;
    this.freqMultiple = multiple;
  }

  process40Write(data) {
    const totalLevel = data & 0x7f;
    print(this, `total_level=${totalLevel}`);
    this.envelope.totalAttenuation = totalLevel;
  }

  process50Write(data) {
    const rateScaling = data >>> 6, attackRate = data & 0x1f;
    print(this, `rate_scaling=${rateScaling}, attack_rate=${attackRate}`);
    this.keyScalingFactor = rateScaling;
    this.envelope.phaseParams[PHASE_ATTACK].rate = attackRate;
  }

  process60Write(data) {
    const amplitudeModulation = data >>> 7, decayRate = data & 0x1f;
    print(this, `amplitude_mod=${amplitudeModulation}, decay_rate=${decayRate}`);
    // TODO Florian -- Amplitude modulation
    this.envelope.phaseParams[PHASE_DECAY].rate = decayRate;
  }

  process70Write(data) {
    const sustainRate = data & 0x1f;
    print(this, `sustain_rate=${sustainRate}`);
    this.envelope.phaseParams[PHASE_SUSTAIN].rate = sustainRate;
  }

  process80Write(data) {
    const decayLevel = (data >>> 4) * 8, releaseRate = (data & 0xf) * 2 + 1;
    print(this, `decay_level=${decayLevel}, release_rate=${releaseRate}`);
    this.envelope.phaseParams[PHASE_DECAY].endAttenuation = decayLevel;
    this.envelope.phaseParams[PHASE_RELEASE].rate = releaseRate;
  }

  // Uses the parent channel and current operator data to update the frequency in Hz
  updateFrequency() {
    const freq = this.channel.frequencyHz;
    const block = this.channel.block;
    const fnum = this.channel.fnumber;
    // key scaling (page 29 YM2608J translated)
    const f11 = fnum.bit(10), f10 = fnum.bit(9), f9 = fnum.bit(8), f8 = fnum.bit(7);
    const n4 = f11;
    const n3 = f11 & (f10 | f9 | f8) | !f11 & f10 & f9 & f8;
    const division = n4 << 1 | n3;

    this.frequency = freq;
    this.keyScalingNote = block << 2 | division;
  }

  processSamples(samples) {
    if (this.frequency === 0) return;

    for (let i = 0; i < samples.length; i++) {
      const atnDb = (this.envelope.attenuation * 48 / 1023) + (this.envelope.totalAttenuation * 96 / 127);
      const volume = Math.pow(10, -atnDb / 20);

      if (++this.sampleNumber === 3) {
        this.sampleNumber = 0;
        this.calcEnvelope();
      }

      const sample = SOURCE_FUNCTION(this.angle) * volume / GLOBAL_ATTENUATION;
     	this.angle += this.frequency * 2 * Math.PI / SAMPLE_RATE;
      samples[i] += sample;
    }
  }
}