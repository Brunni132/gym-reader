import {GLOBAL_ATTENUATION, SAMPLE_RATE} from "./ym2612";
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
  constructor(name) {
    this.name = `[${name}]`;
    this.angle = 0;
    this.frequency = 0;
    this.sampleNumber = 0;
    this.envelope = {
      counter: 0,
      phase: PHASE_RELEASE,
      get currentPhaseParams() { return this.phaseParams[this.phase]; },
      // for each phase, slope and final point
      phaseParams: [
        {rate: 0, level: 0x3ff}, // PHASE_ATTACK
        {rate: 0, level: 0x3ff}, // PHASE_DECAY
        {rate: 0, level: 0x3ff}, // PHASE_SUSTAIN
        {rate: 0, level: 0x3ff}, // PHASE_RELEASE
      ],
      attenuation: 0x3ff,
    };
  }

  // Done every 3 samples
  calcEnvelope() {
    let rate = this.envelope.currentPhaseParams.rate;
    if (rate > 0) {
      rate *= 2;
      // TODO Florian -- key scaling
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

        if (this.envelope.attenuation <= this.envelope.currentPhaseParams.level) {
          this.envelope.attenuation = this.envelope.currentPhaseParams.level;
          this.envelope.phase++;
          print(this, `next from attack`);
        }
      } else {
        this.envelope.attenuation += attenuationIncrement;
        if (this.envelope.phase !== PHASE_RELEASE)
          print(this, `next from ${this.envelope.phase}`, this.envelope.attenuation, this.envelope.currentPhaseParams.level);

        if (this.envelope.attenuation >= this.envelope.currentPhaseParams.level) {
          this.envelope.attenuation = this.envelope.currentPhaseParams.level;
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

  processTotalLevelWrite(data) {
    print(this, `total_level=${data}`);
    this.envelope.phaseParams[PHASE_ATTACK].level = data;
  }

  processRSARWrite(rateScaling, attackRate) {
    print(this, `rate_scaling=${rateScaling}, attack_rate=${attackRate}`);
    // TODO Florian -- Rate scaling
    this.envelope.phaseParams[PHASE_ATTACK].rate = attackRate;
  }

  processAMDRWrite(amplitudeModulation, decayRate) {
    print(this, `amplitude_mod=${amplitudeModulation}, decay_rate=${decayRate}`);
    // TODO Florian -- Amplitude modulation
    this.envelope.phaseParams[PHASE_DECAY].rate = decayRate;
  }

  processSustainRateWrite(sustainRate) {
    print(this, `sustain_rate=${sustainRate}`);
    this.envelope.phaseParams[PHASE_SUSTAIN].rate = sustainRate;
  }

  processSLRRWrite(sustainLevel, releaseRate) {
    print(this, `sustain_level=${sustainLevel}, release_rate=${releaseRate * 2 + 1}`);
    this.envelope.phaseParams[PHASE_DECAY].level = sustainLevel;
    this.envelope.phaseParams[PHASE_RELEASE].rate = releaseRate * 2 + 1;
  }

  processSamples(samples) {
    if (this.frequency === 0) return;
    // * 20 because in decibels (all computations are made in logarithmic scale)
    let volume = Math.pow(10, -this.envelope.attenuation * 48 / (127 * 20));

    print(this, `state`, this.envelope.phaseParams);

    for (let i = 0; i < samples.length; i++) {
      if (++this.sampleNumber === 3) {
        this.sampleNumber = 0;
        this.calcEnvelope();
        volume = Math.pow(10, -this.envelope.attenuation * 48 / (127 * 20));
      }

      const sample = Math.sin(this.angle) * volume / GLOBAL_ATTENUATION;
     	this.angle += this.frequency * 2 * Math.PI / SAMPLE_RATE;
      samples[i] += sample;
    }
  }
}