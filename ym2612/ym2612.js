import { print } from "../client-main.js";
import { ChannelSet } from "./channelSet.js";
import * as SourceFunctions from "./sourceFunctions.js";
import { addStereoBuffers } from "./utils.js";

export const GLOBAL_ATTENUATION = 6;
export const DEBUG_LOG_UNKNOWN_WRITES = false;
export const SOURCE_FUNCTION = SourceFunctions.sin;

export const SAMPLE_RATE = 48000;
export const MEGADRIVE_FREQUENCY = 7670454; // Japan Mega Drive
export const FM_OVER_144 = MEGADRIVE_FREQUENCY / 144;

export class YM2612 {
	constructor() {
		this.name = 'YM2612';
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
		print(this, `Key ${(data & 0x10) ? 'on' : 'off'} channel=${this.channelId(data & 7).name}`);
		// Bits 4-7 => operators 0-3
		this.channelId(data & 7).operators.forEach((o, i) => o.processKeyOn((data >>> (4 + i)) & 1));
	}


	processWrite(part, reg, data) {
		//console.warn(`YM reg=${part}${reg.toHex()} data=${data.toHex()}`);
		this.memoryMap[part << 8 | reg] = data;

		if (reg < 0x30) {
			if (part !== 0) return;
			switch (reg & 0xff) {
				case 0x22:
					console.error(`Unsupported LFO config ${data & 0xf}`);
					return;

				case 0x27:
					if (data >>> 6 !== 0) console.error(`Using unsupported channel 3 mode ${data >>> 6}`);
					return;

				case 0x28:
					this.processKeyOn(data);
					return;

				default:
					if (DEBUG_LOG_UNKNOWN_WRITES) {
						console.warn(`YM reg=${part}${reg.toHex()} data=${data.toHex()}`);
					}
					return;
			}
		}

		this.channelSets[part].processWrite(part, reg, data);
	}

	processFrame() {
		//print(this, `Skipping frame`);
	}

	processSamples(outputSamples) {
		const runningOps = [];
		this.channels.forEach(c => {
			c.operators.forEach(o => {
				if (o.frequency > 0) {
					runningOps.push(o.name);
				}
			});
		});
		//print(this, `Processing frame active = ${runningOps.join(', ')}`);

		const nbOutputSamples = outputSamples[0].length;
		addStereoBuffers(outputSamples,
			this.channels[0].processSamples(nbOutputSamples),
			this.channels[1].processSamples(nbOutputSamples),
			this.channels[2].processSamples(nbOutputSamples),
			this.channels[3].processSamples(nbOutputSamples),
			this.channels[4].processSamples(nbOutputSamples),
			this.channels[5].processSamples(nbOutputSamples),
		);
		for (let j = 0; j < 2; j++) {
			for (let i = 0; i < nbOutputSamples; i++) {
				outputSamples[j][i] /= GLOBAL_ATTENUATION;
			}
		}
	}
}
