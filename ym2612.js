export const SAMPLE_RATE = 48000;
export const FM_OVER_144 = 7670454 / 144; // Japan Mega Drive

function addBuffers(dest, ...sources) {
	for (let i = 0; i < dest.length; i++) {
		dest[i] = 0;
		for (let j = 0; j < sources.length; j++)
			dest[i] += sources[j][i];
	}
	return dest;
}

// 3 channels
class ChannelSet {
	constructor(memory, channelOffset) {
		this.memoryMap = memory;
		this.channelOffset = channelOffset;
		this.channels = [new Channel(this), new Channel(this), new Channel(this)];
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

	channelStr(channel) {
		return `[CH${this.channelOffset + channel + 1}]`;
	}

	processFrequencyWrite(channel) {
		console.log(`${this.channelStr(channel)} frequency=${this.channelFrequency(channel)}`);
		this.channels[channel].operators.forEach(op => op.frequency = this.channelFrequency(channel));
	}

	processFeedbackAlgorithm(channel, data) {
		console.log(`${this.channelStr(channel)} algo=${data & 7} feedback=${data >>> 3 & 7}`);
		this.channels[channel].algorithm = data & 7;
	}

	processStereoLfoSensitivity(channel, data) {
		const fms_table = [0, 3.4, 6.7, 10, 14, 20, 40, 80];
		const ams_table = [0, 1.4, 5.9, 11.8];
		const output = ['disabled', 'right', 'left', 'center'];
		console.log(`${this.channelStr(channel)} FMS=+/-${fms_table[data & 3]}% of halftone, AMS=${ams_table[data >>> 3 & 7]}dB, pan=${output[data >>> 6]}`);
	}

	processWrite(part, reg, data) {
		switch (reg & 0xf0) {
		case 0xa0:
			if (reg < 0xa4) return this.processFrequencyWrite(reg & 3);
			else if (reg < 0xa8) return; // MSB frequency
			break;

		case 0xb0:
			if (reg < 0xb4) return this.processFeedbackAlgorithm(reg & 3, data);
			if (reg < 0xb8) return this.processStereoLfoSensitivity(reg & 3, data);
		}
		console.warn(`YM reg=${part}${reg.toHex()} data=${data.toHex()}`);
	}
}

class Channel {
	constructor(channelSet) {
		this.operators = [new Operator(), new Operator(), new Operator(), new Operator()];
		this.algorithm = 0;
		this.channelSet = channelSet;
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

class Operator {
	constructor() {
		this.angle = 0;
		this.frequency = 0;
		this.keyOn = false;
	}

	processSamples(samples) {
		for (let i = 0; i < samples.length; i++) {
			const sample = Math.sin(this.angle) / 24;
			if (this.keyOn) {
				this.angle += this.frequency * 2 * Math.PI / SAMPLE_RATE;
			}
			samples[i] += sample;
		}
	}
}


export class YM2612 {
	constructor() {
		this.memoryMap = new Uint8Array(512);
		this.channelSets = [new ChannelSet(this.memoryMap.subarray(0, 256), 0), new ChannelSet(this.memoryMap.subarray(256, 512), 3)];
	}

	channel(no) {
		if (no === 3 || no === 7) throw new Error(`Channel ${no} invalid`);
		return no < 4 ? this.channelSets[0].channels[no] : this.channelSets[1].channels[no - 4];
	}

	processKeyOn(data) {
		console.log(`Key ${(data & 0x10) ? 'on' : 'off'} channel=${(data & 0x7) + 1}`);
		this.channel(data & 7).operators[0].keyOn = data & 0x10;
		this.channel(data & 7).operators[1].keyOn = data & 0x20;
		this.channel(data & 7).operators[2].keyOn = data & 0x40;
		this.channel(data & 7).operators[3].keyOn = data & 0x80;
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

		addBuffers(outputSamples,
			this.channel(0).processSamples(outputSamples.slice()),
			this.channel(1).processSamples(outputSamples.slice()),
			this.channel(2).processSamples(outputSamples.slice()),
			this.channel(4).processSamples(outputSamples.slice()),
			this.channel(5).processSamples(outputSamples.slice()),
			this.channel(6).processSamples(outputSamples.slice()));

		//for (let i = 0; i < samples.length; i++) {
		//	samples[i] = Math.sin(i * 0.05)
		//}
	}
}
