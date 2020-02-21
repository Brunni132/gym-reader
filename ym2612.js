export const SAMPLE_RATE = 48000;
export const FM_OVER_144 = 7670454 / 144; // Japan Mega Drive
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


function addBuffers(dest, ...sources) {
	for (let i = 0; i < dest.length; i++) {
		dest[i] = 0;
		for (let j = 0; j < sources.length; j++)
			dest[i] += sources[j][i];
	}
	return dest;
}

class Operator {
	constructor(name) {
		this.name = `[${name}]`;
		this.angle = 0;
		this.frequency = 0;
		this.amplitude = {
			counter: 0,
			phase: PHASE_RELEASE,
			// for each phase, slope and final point
			phaseParams: [
				{ rate: 0, level: 0x3ff }, // PHASE_ATTACK
				{ rate: 0, level: 0x3ff }, // PHASE_DECAY
				{ rate: 0, level: 0x3ff }, // PHASE_SUSTAIN
				{ rate: 0, level: 0x3ff }, // PHASE_RELEASE
			],
			attenuation: 0x3ff,
		};
	}

	// Done every 3 samples
	calcAmplitude() {
		let rate = this.amplitude.phaseParams[this.amplitude.phase].rate;
		if (rate > 0) {
			rate *= 2;
			// TODO Florian -- key scaling
			if (rate > 63) rate = 63;
		}

		// Determines every how many iterations we get the attenuation-increment-value in the table
		let counterShiftValue = 11 - rate >>> 2;
		if (counterShiftValue < 0) counterShiftValue = 0;

		if (++this.amplitude.counter % (1 << counterShiftValue) === 0) {
			const attenuationIncrement = ATTENUATION_INCREMENT_TABLE[rate] / 8;
			if (this.amplitude.phase === PHASE_ATTACK) {
				// Simulation discrète d'exponentielle
				this.amplitude.attenuation += (~this.amplitude.attenuation * attenuationIncrement) >> 4;
			} else {
				this.amplitude.attenuation += attenuationIncrement;
			}
		}
	}

	processKeyOn(on) {
		this.amplitude.phase = on ? PHASE_ATTACK : PHASE_RELEASE;
	}

	processTotalLevelWrite(data) {
		console.log(`${this.name} total_level=${data}`);
		this.amplitude.phaseParams[PHASE_ATTACK].level = data;
		//this.volume = Math.pow(10, -data * 96 / (127 * 20));
	}

	processRSARWrite(rateScaling, attackRate) {
		console.log(`${this.name} rate_scaling=${rateScaling}, attack_rate=${attackRate}`);
		// TODO Florian -- Rate scaling
		this.amplitude.phaseParams[PHASE_ATTACK].rate = attackRate;
	}

	processAMDRWrite(amplitudeModulation, decayRate) {
		console.log(`${this.name} amplitude_mod=${amplitudeModulation}, decay_rate=${decayRate}`);
		// TODO Florian -- Amplitude modulation
		this.amplitude.phaseParams[PHASE_DECAY].rate = decayRate;
	}

	processSustainRateWrite(sustainRate) {
		console.log(`${this.name} sustain_rate=${sustainRate}`);
		this.amplitude.phaseParams[PHASE_SUSTAIN].rate = sustainRate;
	}

	processSLRRWrite(sustainLevel, releaseRate) {
		console.log(`${this.name} sustain_level=${sustainLevel}, release_rate=${releaseRate * 2 + 1}`);
		this.amplitude.phaseParams[PHASE_SUSTAIN].level = sustainLevel;
		this.amplitude.phaseParams[PHASE_RELEASE].rate = releaseRate * 2 + 1;
	}

	processSamples(samples) {
		if (this.frequency === 0) return;
		for (let i = 0; i < samples.length; i++) {
			//const sample = (Math.sin(this.angle) > 0 ? 1 : -1) * TODO_volume / 24;
			//if (this.keyOn) {
			//	this.angle += this.frequency * 2 * Math.PI / SAMPLE_RATE;
			//}
			//samples[i] += sample;
		}
	}
}

class Channel {
	constructor(name) {
		this.name = `[${name}]`;
		this.operators = [
			new Operator(`${name} OP1`),
			new Operator(`${name} OP2`),
			new Operator(`${name} OP3`),
			new Operator(`${name} OP4`)
		];
		this.algorithm = 0;
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
			if (slotPerAlgo[this.algorithm] & 1 << i) {
				this.operators[i].processSamples(outputSamples);
			}
		}
		return outputSamples;
	}
}

// 3 channels
class ChannelSet {
	constructor(memory, channelOffset) {
		this.memoryMap = memory;
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
		if (reg & 3 === 3) return null;
		return this.channels[reg & 3].operators[reg >>> 2 & 3];
	}

	processFrequencyWrite(channel) {
		console.log(`${this.channels[channel].name} frequency=${this.channelFrequency(channel)}`);
		this.channels[channel].operators.forEach(op => op.frequency = this.channelFrequency(channel));
	}

	processFeedbackAlgorithm(channel, data) {
		console.log(`${this.channels[channel].name} algo=${data & 7} feedback=${data >>> 3 & 7}`);
		this.channels[channel].algorithm = data & 7;
	}

	processStereoLfoSensitivity(channel, data) {
		const fms_table = [0, 3.4, 6.7, 10, 14, 20, 40, 80];
		const ams_table = [0, 1.4, 5.9, 11.8];
		const output = ['disabled', 'right', 'left', 'center'];
		console.log(`${this.channels[channel].name} FMS=+/-${fms_table[data & 3]}% of halftone, AMS=${ams_table[data >>> 3 & 7]}dB, pan=${output[data >>> 6]}`);
	}

	processWrite(part, reg, data) {
		switch (reg & 0xf0) {
			case 0x40: {
				const operator = this.channelOperator(reg);
				if (operator) return operator.processTotalLevelWrite(data & 0x7f);
				break;
			}
			case 0x50: {
				const operator = this.channelOperator(reg);
				if (operator) return operator.processRSARWrite(data >>> 6, data & 0x1f);
				break;
			}
			case 0x60: {
				const operator = this.channelOperator(reg);
				if (operator) return operator.processAMDRWrite(data >>> 7, data & 0x1f);
				break;
			}
			case 0x70: {
				const operator = this.channelOperator(reg);
				if (operator) return operator.processSustainRateWrite(data & 0x1f);
				break;
			}
			case 0x80: {
				const operator = this.channelOperator(reg);
				if (operator) return operator.processSLRRWrite(data >>> 4, data & 0xf);
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
		console.warn(`YM reg=${part}${reg.toHex()} data=${data.toHex()}`);
	}
}

export class YM2612 {
	constructor() {
		this.memoryMap = new Uint8Array(512);
		this.channelSets = [new ChannelSet(this.memoryMap.subarray(0, 256), 0), new ChannelSet(this.memoryMap.subarray(256, 512), 3)];
	}

	get channels() {
		return this.channelSets[0].channels.concat(this.channelSets[1].channels);
	}

	// When read from register
	channelId(no) {
		return no < 4 ? this.channelSets[0].channels[no] : this.channelSets[1].channels[no - 4];
	}

	processKeyOn(data) {
		console.log(`Key ${(data & 0x10) ? 'on' : 'off'} channel=${this.channelId(data & 7).name}`);
		// Bits 4-7 => operators 0-3
		this.channelId(data & 7).operators.forEach((o, i) => o.processKeyOn((data >>> (4 + i)) & 1));
	}


	processWrite(part, reg, data) {
		//console.warn(`YM reg=${part}${reg.toHex()} data=${data.toHex()}`);
		this.memoryMap[part << 8 | reg] = data;

		if (reg < 0x30) {
			if (part !== 0) return;
			switch (reg & 0xff) {
				case 0x27:
					if (data >>> 6 !== 0) console.error(`Using unsupported channel 3 mode ${data >>> 6}`);
					return;

				case 0x28:
					this.processKeyOn(data);
					return;

				default:
					console.warn(`YM reg=${part}${reg.toHex()} data=${data.toHex()}`);
					return;
			}
		}

		this.channelSets[part].processWrite(part, reg, data);
	}

	processFrame() {
		console.log(`Skipping frame`);
	}

	processSamples(outputSamples) {
		outputSamples.fill(0);

		const runningOps = [];
		this.channels.forEach(c => {
			c.operators.forEach(o => {
				if (o.frequency > 0 && o.keyOn) {
					runningOps.push(o.name);
				}
			});
		});
		console.log(`Processing frame, active = ${runningOps.join(', ')}`);

		addBuffers(outputSamples,
				this.channels[0].processSamples(outputSamples.slice()),
				this.channels[1].processSamples(outputSamples.slice()),
				this.channels[2].processSamples(outputSamples.slice()),
				this.channels[3].processSamples(outputSamples.slice()),
				this.channels[4].processSamples(outputSamples.slice()),
				this.channels[5].processSamples(outputSamples.slice()),
		);
	}
}
