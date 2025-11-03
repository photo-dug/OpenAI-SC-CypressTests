// tasks/audio-fingerprint.cjs
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Meyda = require('meyda');

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
  if (!rows || rows.length === 0) return [];
  const sum = new Array(rows[0].length).fill(0);
  for (const r of rows) r.forEach((v, i) => (sum[i] += v));
  return sum.map((v) => v / rows.length);
}

function cosine(a, b) {
  const A = a || [];
  const B = b || [];
  const dot = A.reduce((acc, v, i) => acc + v * (B[i] || 0), 0);
  const na = Math.sqrt(A.reduce((acc, v) => acc + v * v, 0));
  const nb = Math.sqrt(B.reduce((acc, v) => acc + v * v, 0));
  return na && nb ? dot / (na * nb) : 0;
}

/**
 * Decode a local file path or an http(s)/HLS/DASH URL to mono 16-bit PCM float32 samples.
 * We use ffmpeg’s demuxers and network reconnection flags to be resilient to short presigned URLs.
 */
function decodeToPCMFromUrl(input, seconds = 5, sampleRate = 16000) {
  return new Promise((resolve, reject) => {
    const src = String(input);
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      // network resilience for HLS/DASH
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_at_eof', '1',
      '-reconnect_delay_max', '2',
      '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,httpproxy',
      '-allowed_extensions', 'ALL',
      '-ss', '0',
      '-t', String(seconds),
      '-i', src,
      '-vn',
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      'pipe:1'
    ];

    const ff = require('child_process').spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';

    ff.stdout.on('data', (d) => chunks.push(d));
    ff.stderr.on('data', (d) => { stderr += d.toString(); });
    ff.on('error', (err) => reject(err));
    ff.on('close', (code) => {
      if (code === 0 && chunks.length) {
        try {
          const pcm = pcmS16ToFloat32(Buffer.concat(chunks));
          return resolve(pcm);
        } catch (e) {
          return reject(e);
        }
      }
      return reject(new Error(`ffmpeg exited ${code}. ${stderr || ''}`));
    });
  });
}

function fingerprintFromPCM(pcm, sampleRate = 16000) {
  const frameSize = 1024;
  const hop = 512;
  const feats = [];
  for (let i = 0; i + frameSize <= pcm.length; i += hop) {
    const frame = pcm.subarray(i, i + frameSize);
    const mfcc = Meyda.extract('mfcc', frame, { sampleRate, bufferSize: frameSize });
    const chroma = Meyda.extract('chroma', frame, { sampleRate, bufferSize: frameSize });
    if (mfcc && chroma) feats.push([...mfcc, ...chools]);
  }
  return average(feats);
}

function registerAudioTasks(on, config) {
  on('task', {
    async referenceFingerprint() {
      try {
        if (cachedRef) return cachedRef;
        const p = path.join(config.projectRoot, 'cypress', 'fixtures', 'reference.mp3');
        if (!fs.existsSync(p)) return null; // let the spec warn if missing
        const pcm = await decodeToPCMFromUrl(p);
        cachedRef = fingerprintFromPCM(pcm);
        return cachedRef;
      } catch (_e) {
        return null;
      }
    },

    // For direct, fetchable audio/file URLs (mp3/aac/ogg/wav) or local paths
    async fingerprintAudioFromUrl(url) {
      try {
        const pcm = await decodeToPCMFromUrl(url);
        return fingerprintFromPCM(pcm);
      } catch (_e) {
        return null;
      }
    },

    // For HLS/DASH/any http(s) URL: let ffmpeg pull & demux the first N seconds
    async fingerprintMedia({ url, seconds = 5 }) {
      try {
        const pcm = await decodeToPCMFromUrl(url, seconds);
        return fingerprintFromPCM(pcm);
      } catch (_e) {
        return null;
      }
    },

    // Cosine similarity scorer
    compareBins({ a, b, threshold = 0.9 }) {
      const score = cosine(a, b);
      return { score, pass: score >= threshold };
    }
  });
}

module.exports = { registerAudioTasks };
