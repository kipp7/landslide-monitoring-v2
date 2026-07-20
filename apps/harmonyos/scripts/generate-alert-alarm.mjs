import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const sampleRate = 44100;
const durationSeconds = 4;
const sampleCount = Math.floor(sampleRate * durationSeconds);
const dataSize = sampleCount * 2;
const buffer = Buffer.alloc(44 + dataSize);

buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16);
buffer.writeUInt16LE(1, 20);
buffer.writeUInt16LE(1, 22);
buffer.writeUInt32LE(sampleRate, 24);
buffer.writeUInt32LE(sampleRate * 2, 28);
buffer.writeUInt16LE(2, 32);
buffer.writeUInt16LE(16, 34);
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

let phase = 0;
for (let index = 0; index < sampleCount; index += 1) {
  const time = index / sampleRate;
  // A smooth civil-defense-style wail is recognizable without the harshness
  // of alternating electronic beeps. Four seconds is one seamless cycle.
  const frequency = 670 - 150 * Math.cos(2 * Math.PI * time / durationSeconds);
  phase += 2 * Math.PI * frequency / sampleRate;
  const fundamental = Math.sin(phase);
  const harmonic = Math.sin(phase * 2) * 0.12;
  const sample = (fundamental + harmonic) * 0.38;
  buffer.writeInt16LE(Math.round(sample * 32767), 44 + index * 2);
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(scriptDirectory, '..', 'entry', 'src', 'main', 'resources', 'rawfile', 'alert_alarm.wav');
fs.writeFileSync(output, buffer);
console.log(`Generated ${output}`);
