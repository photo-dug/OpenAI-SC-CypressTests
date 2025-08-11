import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import Meyda from 'meyda';

let cachedRef = null;

function pcmS16ToFloat32(buf) {
  const out = new Float32Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) {
    const s = buf.readInt16LE(i * 2);
    out[i] = Math.max(-1, Math.min(1, s / 32768));
  }
  return out;
}

function average(rows) {
  if (!rows.length) return [];
  const sum = new Array(rows[0].length).fill(0);
  for (const r of rows) r.forEach((v, i) => (sum[i] += v));
  return sum.map((v) => v / rows.length);
}

function cosine(a, b) {
  const dot = a.reduce((s, v, i) => s + v * (b[i] || 0), 0);
  const na = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
  const nb = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
  return na && nb ? dot / (na * nb) : 0;
}

async function decodeToPCMFromUrl(input, seconds = 5, sampleRate = 16000) {
  return new Promise((resolve, reject) => {
    const args = ['-ss', '0', '-t', String(seconds), '-i', input, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 's16le', '-'];
    const ff = spawn(ffmpegPath, args);
    const chunks = [];
    ff.stdout.on('data', (d) => chunks.push(d));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0) resolve(pcmS16ToFloat32(Buffer.concat(chunks)));
      else reject(new Error(`ffmpeg exited ${code}`));
    });
  });
}

function fingerprintFromPCM(pcm, sampleRate = 16000) {
  const frameSize = 1024;
  const hop = 512;
  const features = [];
  for (let i = 0; i + frameSize <= pcm.length; i += hop) {
    const frame = pcm.subarray(i, i + frameSize);
    const mfcc = Meyda.extract('mfcc', frame, { sampleRate, bufferSize: frameSize });
    const chroma = Meyda.extract('chroma', frame, { sampleRate, bufferSize: frameSize });
    if (mfcc && chroma) features.push([...mfcc, ...chroma]);
  }
  return average(features);
}

export function registerAudioTasks(on, config) {
  on('task', {
    async referenceFingerprint() {
      if (cachedRef) return cachedRef;
      const p = path.join(config.projectRoot, 'cypress', 'fixtures', 'reference.mp3');
      if (!fs.existsSync(p)) throw new Error(`Missing reference mp3 at ${p}`);
      const pcm = await decodeToPCMFromUrl(p);
      cachedRef = fingerprintFromPCM(pcm);
      return cachedRef;
    },
    async fingerprintAudioFromUrl(url) {
      const pcm = await decodeToPCMFromUrl(url);
      return fingerprintFromPCM(pcm);
    },
    compareFingerprints({ a, b, threshold = 0.9 }) {
      const score = cosine(a, b);
      return { score, pass: score >= threshold };
    }
  });
}
