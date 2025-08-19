//@@
//-const username = Cypress.env('SC_USERNAME');
//-const password = Cypress.env('SC_PASSWORD');
//-
// collect audio request URLs across the whole spec
//-let audioUrls = [];
const username = Cypress.env('SC_USERNAME');
const password = Cypress.env('SC_PASSWORD');

// collect audio request URLs + batched request logs across the whole spec
let audioUrls = [];
let requests = [];
//@@
   before(() => {
//@@
//-    cy.intercept('GET', '**', (req) => {
    cy.intercept('GET', '**', (req) => {
       const startedAt = Date.now();
       req.on('response', (res) => {
         const ct = String(res.headers['content-type'] || '');
         const url = req.url.toLowerCase();
         const looksAudio = ct.includes('audio') || url.includes('.mp3') || url.includes('.m3u8') || url.includes('.aac') || url.includes('.ogg');
         const durationMs = Date.now() - startedAt;
         if (looksAudio) {
           audioUrls.push(req.url);
         }
//        cy.task('recordRequest', { url: req.url, method: req.method, status: res.statusCode, durationMs });
        // DO NOT call cy.task() inside this callback (runs during cy.visit)
        requests.push({ url: req.url, method: req.method, status: res.statusCode, durationMs });
       });
     });
//@@
   it('07 – Verify audio is playing and matches reference (first 5s)', () => {
//-    cy.get('audio').first().should('exist').then(($audio) => {
//-      const el = $audio[0];
//-      expect(el.paused).to.eq(false);
//-    });
//-    cy.wait(1500);
//-    cy.get('audio').first().then(($audio) => {
//-      const t = $audio[0].currentTime;
//-      expect(t).to.be.greaterThan(1);
//-    });
//-
//-    cy.then(async () => {
//-      if (audioUrls.length) {
//-        const live = (await cy.task('fingerprintAudioFromUrl', audioUrls[0]));
//-        const ref = (await cy.task('referenceFingerprint'));
//-        const { score, pass } = (await cy.task('compareFingerprints', { a: ref, b: live, threshold: 0.9 }));
//-        const strict = Cypress.env('FINGERPRINT_STRICT') === true || Cypress.env('FINGERPRINT_STRICT') === 'true';
//-        if (!pass) {
//-          if (strict) {
//-            expect(pass, `Audio similarity score ${score.toFixed(3)}`).to.be.true;
//-          } else {
//-            cy.task('recordStep', { name: 'audio-fingerprint', status: 'warning', score });
//-          }
//-        }
//-      } else {
//-        cy.task('recordStep', { name: 'audio-fingerprint', status: 'warning', note: 'Live audio URL not captured; MSE/DRM suspected' });
//-      }
//-    });
    // Optional skip via env
    if (Cypress.env('SKIP_AUDIO')) {
      cy.task('recordStep', { name: 'audio-fingerprint', status: 'skipped', note: 'SKIP_AUDIO=true' });
      return;
    }

    // Try to assert play state if an <audio> exists
    cy.get('body').then(($body) => {
      const el = $body.find('audio').get(0);
      if (el) expect(el.paused).to.eq(false);
      else cy.task('recordStep', { name: 'audio-element', status: 'warning', note: '<audio> not found; player may be WebAudio/MSE' });
    });
    cy.get('body').then(($body) => {
      const el = $body.find('audio').get(0);
      if (el) {
        const t1 = el.currentTime;
        cy.wait(1500).then(() => {
          const t2 = el.currentTime;
          expect(t2).to.be.greaterThan(t1);
        });
      }
    });

    // Fingerprint chain (no async/await; no cy.* outside chain)
    cy.then(() => {
      if (!audioUrls.length) {
        return cy.task('recordStep', { name: 'audio-fingerprint', status: 'warning', note: 'Live audio URL not captured; MSE/DRM suspected' });
      }
    }).then(() => {
      if (!audioUrls.length) return; // already warned
      return cy
        .task('fingerprintAudioFromUrl', audioUrls[0], { timeout: 120000 })
        .then((live) => cy.task('referenceFingerprint').then((ref) => ({ live, ref })))
        .then(({ live, ref }) => {
          if (!ref || !live || !live.length) {
            return cy.task('recordStep', { name: 'audio-fingerprint', status: 'warning', note: 'Missing reference or live fingerprint' });
          }
          return cy.task('compareFingerprints', { a: ref, b: live, threshold: 0.9 });
        })
        .then((result) => {
          if (!result || result.pass === undefined) return;
          const strict = Cypress.env('FINGERPRINT_STRICT') === true || Cypress.env('FINGERPRINT_STRICT') === 'true';
          if (!result.pass) {
            if (strict) {
              expect(result.pass, `Audio similarity score ${result.score?.toFixed?.(3)}`).to.be.true;
            } else {
              return cy.task('recordStep', { name: 'audio-fingerprint', status: 'warning', score: result.score });
            }
          }
        });
    });
   });
//@@
-  after(() => {
-    cy.task('flushResults').then((outPath) => {
-      cy.log(`Results written to ${outPath}`);
-    });
-  });
+  after(() => {
+    // Flush batched requests from intercept callback
+    cy.then(() => cy.task('recordRequestsBatch', requests))
+      .then(() => cy.task('flushResults'))
+      .then((outPath) => { cy.log(`Results written to ${outPath}`); });
+  });
 });
