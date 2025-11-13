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

/** Decode a local path or http(s)/HLS/DASH URL to mono s16 PCM (Float32Array). *//at top: const https = require('node:https');
function decodeToPCMFromUrl(input, seconds = 5, sampleRate = 16000) {
  return new Promise((resolve, reject) => {
    const src = String(input);
    const isHttp = /^https?:\/\//i.test(src);

    const doFfmpeg = (args, stdinStream /* optional */) => new Promise((res, rej) => {
      const ff = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks = [];
      let stderr = '';

      if (stdinStream) stdinStream.pipe(ff.stdin);
      else ff.stdin.end(); // close stdin when not using pipe:0

      ff.stdout.on('data', d => chunks.push(d));
      ff.stderr.on('data', d => { stderr += d.toString(); });
      ff.on('error', rej);
      ff.on('close', (code, signal) => {
        if (code === 0 && chunks.length) {
          try { return res(pcmS16ToFloat32(Buffer.concat(chunks))); }
          catch (e) { return rej(e); }
        }
        // Include as much detail as possible
        const why = `ffmpeg exited ${code == null ? 'null' : code}${signal ? ' (signal ' + signal + ')' : ''}. ${stderr || ''}`;
        rej(new Error(why));
      });
    });

    // Build args for "direct URL" attempt
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];

    if (isHttp) {
      // Only for http(s)
      args.push(
        // network/timeouts
        '-rw_timeout', '15000000',           // 15s (microseconds)
        '-reconnect', '1',
        '-reconnect_streamed', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_delay_max', '2',
        '-protocol_whitelist', 'file,http,https,tcp,tls,crypto,httpproxy',
        '-allowed_extensions', 'ALL',
        // “polite” headers; some CDNs are picky
        '-http_user_agent', 'Mozilla/5.0 (Cypress ffmpeg)',
        '-headers', 'Accept: audio/*\r\n'
      );
    }

    args.push(
      '-ss', '0',
      '-t', String(seconds),
      '-i', src,                  // first try: let ffmpeg pull the URL
      '-vn',
      '-ac', '1',
      '-ar', String(sampleRate),
      '-f', 's16le',
      'pipe:1'
    );

    // FIRST try: direct -i URL
    doFfmpeg(args, null)
      .then(resolve)
      .catch((e1) => {
        // If not http(s), or we already produced bytes, bubble the error
        if (!isHttp) return reject(e1);

        // SECOND try: fetch with Node and pipe → -i pipe:0
        try {
          const req = https.get(src, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Cypress ffmpeg)',
              'Accept': 'audio/*,*/*;q=0.8'
            }
          }, (res) => {
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`HTTP ${res.statusCode} for ${src}`));
            }

            const argsPipe = [
              '-hide_banner', '-loglevel', 'error', '-nostdin',
              '-ss', '0', '-t', String(seconds),
              '-i', 'pipe:0',
              '-vn', '-ac', '1', '-ar', String(sampleRate),
              '-f', 's16le', 'pipe:1'
            ];

            doFfmpeg(argsPipe, res).then(resolve).catch(reject);
          });

          req.on('error', reject);
        } catch (e2) {
          reject(e2);
        }
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
  try {
    const p = path.join(config.projectRoot, 'cypress', 'fixtures', 'reference.mp3');
    if (!fs.existsSync(p)) return null;

    const mtime = fs.statSync(p).mtimeMs;
    const bump  = process.env.CYPRESS_REF_VERSION ?? process.env.REF_VERSION ?? '1';
    const key   = `${p}:${mtime}:${bump}`;

    if (cachedRef && cachedKey === key) return cachedRef;

    const pcm = await decodeToPCMFromUrl(p); // local file path
    cachedRef  = fingerprintFromPCM(pcm);
    cachedKey  = key;
    return cachedRef;
  } catch {
    return null;
  }
}

function registerAudioTasks(on, config) {
  on('task', {
    // --- Diagnostics for Step 7 guard ---
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

    async probeReferenceDecode() {
      try {
        const p = path.join(config.projectRoot, 'cypress', 'fixtures', 'reference.mp3');
        const pcm = await decodeToPCMFromUrl(p, 5);
        return { ok: !!pcm && pcm.length > 0, samples: pcm ? pcm.length : 0 };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },

    async probeLiveDecode({ url, seconds = 5 }) {
      try {
        const pcm = await decodeToPCMFromUrl(url, seconds);
        return { ok: !!pcm && pcm.length > 0, samples: pcm ? pcm.length : 0 };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    },

    // --- Cached reference fingerprint (mtime + REF_VERSION cache key) ---
    referenceFingerprint() {
      return referenceFingerprintTask(config);
    },

    // --- Decode and fingerprint a direct audio/file URL ---
    async fingerprintAudioFromUrl(url) {
      try {
        const pcm = await decodeToPCMFromUrl(url);
        return fingerprintFromPCM(pcm);
      } catch {
        return null;
      }
    },

    // --- Decode and fingerprint HLS/DASH/http(s) (first N seconds) ---
    async fingerprintMedia({ url, seconds = 5 }) {
      try {
        const pcm = await decodeToPCMFromUrl(url, seconds);
        return fingerprintFromPCM(pcm);
      } catch {
        return null;
      }
    },

    // --- Cosine similarity compare ---
    compareFingerprints({ a, b, threshold = 0.9 }) {
      const score = cosine(a, b);
      return { score, pass: score >= threshold };
    }
  });
}

module.exports = { registerAudioTasks };
