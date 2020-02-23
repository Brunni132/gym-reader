import {DEBUG_LOG_UNKNOWN_WRITES, SAMPLE_RATE, YM2612} from "./ym2612/ym2612";
import {WaveFile} from "wavefile";

export let DEBUG_frameNo = 0;

export function print(object, ...text) {
  //if (object instanceof Operator && object.name !== '[CH3 OP4]') return;
  //if (DEBUG_frameNo === 194)
  //if (text[0].startsWith(`next`))
  //if (object.name === '[CH1 OP4]' && !text[0].startsWith('next'))
  //  console.log(`${object.name} frame=${DEBUG_frameNo}`, ...text);
}

function playSound(audioCtx, audioBuffer) {
  const source = audioCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(audioCtx.destination);
  source.start();
}

function saveSound(samples) {
  const buffer16 = new Array(samples.length);
  for (let i = 0; i < samples.length; i++)
    buffer16[i] = Math.round(samples[i] * 32767);

  const wav = new WaveFile();
  wav.fromScratch(1, SAMPLE_RATE, '16', buffer16);
  window.fetch('http://localhost:3001/sound.wav', {
    method: 'POST',
    mode: 'cors',
    cache: 'no-cache',
    credentials: 'same-origin',
    contentType: 'application/binary',
    body: new Blob([wav.toBuffer()], {type : 'application/binary'})
  });
}

Number.prototype.toHex = function(positions = 2) {
	return this.toString(16).padStart(positions, '0');
};

Number.prototype.toBin = function(positions = 8) {
	return this.toString(2).padStart(positions, '0');
};

Number.prototype.bit = function(bitNo) {
  return (this >>> bitNo) & 1;
};

async function run() {
	const res = await window.fetch('http://localhost:3001/file.gym');
	if (!res.ok) throw Error('Unable to fetch gym file');

	const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
	const audioBuffer = audioCtx.createBuffer(1, 90 * SAMPLE_RATE, SAMPLE_RATE);
	const samples = audioBuffer.getChannelData(0);
	const samplesPerFrame = SAMPLE_RATE / 60;
	let processedSamples = 0;

	const ym = new YM2612();
	let processedFrames = 0;
	let buffer = new Uint8Array(await res.arrayBuffer());
	buffer = buffer.subarray(428);

	while (buffer.length > 0 && processedSamples < samples.length) {
		switch (buffer[0]) {
			case 0:
				ym.processFrame();
				processedFrames += 1;
				buffer = buffer.subarray(1);
				ym.processSamples(samples.subarray(processedSamples, Math.min(processedSamples + samplesPerFrame, samples.length)));
				processedSamples += samplesPerFrame;
				break;
			case 1:
				ym.processWrite(0, buffer[1], buffer[2]);
				buffer = buffer.subarray(3);
				break;
			case 2:
				ym.processWrite(1, buffer[1], buffer[2]);
				buffer = buffer.subarray(3);
				break;
			case 3:
			  if (DEBUG_LOG_UNKNOWN_WRITES) {
          console.warn(`PSG data=${buffer[1].toHex()}`);
        }
				buffer = buffer.subarray(2);
				break;
			default:
				throw new Error(`Unknown command ${buffer[0]}`);
		}
    DEBUG_frameNo++;
	}

	playSound(audioCtx, audioBuffer);
	saveSound(samples);
}

//function test() {
//	const ym = new YM2612();
//	// 440 Hz
//	ym.processWrite(0, 0xa4, 110 >>> 8);
//	ym.processWrite(0, 0xa0, 110 & 0xff);
//	// Algorithm
//	ym.processWrite(0, 0xb0, 7);
//	// Key on
//	ym.processWrite(0, 0x28, 0 | 0xf0);
//
//	const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
//	const buffer = audioCtx.createBuffer(1, 1 * SAMPLE_RATE, SAMPLE_RATE);
//	const samples = buffer.getChannelData(0);
//	const perFrame = SAMPLE_RATE / 60;
//
//	for (let i = 0; i < samples.length; i += perFrame) {
//		ym.processSamples(samples.subarray(i, Math.min(i + perFrame, samples.length)));
//	}
//
//	const source = audioCtx.createBufferSource();
//	source.buffer = buffer;
//	source.connect(audioCtx.destination);
//	source.start();
//}

document.querySelector('button').onclick = () => {
	run();
};
