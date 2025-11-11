// tasks/audio-fingerprint.cjs
const ffmpegPath = require('ffmpeg-static');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const Meyda = require('meyda');

let cachedRef = null;
let cachedKey = null;

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

/** Decode a local path or http(s)/HLS/DASH URL to mono s16 PCM (Float32Array). */
function decodeToPCMFromUrl(input, seconds = 5, sampleRate = 16000) {
  return new Promise((resolve, reject) => {
    const src = String(input);
    const isHttp = /^https?:\/\//i.test(src);

    // Always include the basics
    const args = [
      '-hide_banner',
      '-loglevel', 'error'
    ];

    // Only for http(s)/HLS/DASH inputs – NOT for local files
    if (isHttp) {
      args.push(
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_delay_max', '2',
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,httpproxy',
        '-allowed_extensions', 'ALL'
      );
    }

    // Cut first N seconds and write raw s16le PCM to stdout
    args.push(
      '-ss', '0',
      '-t', String(seconds),
      '-i', src,
      '-vn',
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      'pipe:1'
    );

    const ff = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';

    ff.stdout.on('data', d => chunks.push(d));
    ff.stderr.on('data', d => { stderr += d.toString(); });
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code === 0 && chunks.length) {
        try { return resolve(pcmS16ToFloat32(Buffer.concat(chunks))); }
        catch (e) { return reject(e); }
      }
      reject(new Error(`ffmpeg exited ${code}. ${stderr || ''}`));
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
    if (mfcc && chroma) feats.push([...mfcc, ...chroma]);
  }
  return average(feats);
}

/** recompute ref when file mtime/bump changes */

async function referenceFingerprintTask(config) {
  const p = path.join(config.projectRoot, 'cypress', 'fixtures', 'reference.mp3');
  if (!fs.existsSync(p)) return null;
  const mtime = fs.statSync(p).mtimeMs;
  const bump  = process.env.CYPRESS_REF_VERSION ?? process.env.REF_VERSION ?? '1';
  const key   = `${p}:${mtime}:${bump}`;
  if (cachedRef && cachedKey === key) return cachedRef;

  const pcm = await decodeToPCMFromUrl(p);
  cachedRef  = fingerprintFromPCM(pcm);
  cachedKey  = key;
  return cachedRef;
}

function registerAudioTasks(on, config) {
  on('task', {
    referenceFingerprint() {
      return referenceFingerprintTask(config);
    },
    statReference() {
  try {
    const p = path.join(config.projectRoot, 'cypress', 'fixtures', 'reference.mp3');
    if (!fs.existsSync(p)) return { exists: false, path: p };
    const st = fs.statSync(p);
    return { exists: true, path: p, size: st.size, mtime: st.mtimeMs };
  } catch (e) {
    return { exists: false, error: String(e) };
  }
},

    /** direct file/http audio (mp3/aac/ogg/wav) or local paths */
    async fingerprintAudioFromUrl(url) {
      try {
        const pcm = await decodeToPCMFromUrl(url);
        return fingerprintFromPCM(pcm);
      } catch {
        return null;
      }
    },

    /** HLS/DASH or any http(s) URL: let ffmpeg fetch/demux first N seconds */
    async fingerprintMedia({ url, seconds = 5 }) {
      try {
        const pcm = await decodeToPCMFromUrl(url, seconds);
        return fingerprintFromPCM(pcm);
      } catch {
        return null;
      }
    },

    compareFingerprints({ a, b, threshold = 0.9 }) {
      const score = cosine(a, b);
      return { score, pass: score >= threshold };
    }
  });
}

module.exports = { registerAudioTasks };
