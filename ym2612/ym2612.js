import {ChannelSet} from "./channelSet";
import {DEBUG_frameNo} from "../client-main";

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
		//console.log(`Skipping frame`);
	}

	processSamples(outputSamples) {
		outputSamples.fill(0);

		const runningOps = [];
		this.channels.forEach(c => {
			c.operators.forEach(o => {
				if (o.frequency > 0) {
					runningOps.push(o.name);
				}
			});
		});
		console.log(`Processing frame ${DEBUG_frameNo}, active = ${runningOps.join(', ')}`);

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