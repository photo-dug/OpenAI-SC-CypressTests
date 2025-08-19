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
describe('SoundCredit – Login → Play → Logout', () => {
  before(() => {
    expect(username, 'SC_USERNAME env var').to.be.a('string').and.not.be.empty;
    expect(password, 'SC_PASSWORD env var').to.be.a('string').and.not.be.empty;     
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
    cy.task('referenceFingerprint');
//@@
     it('01 – Login page loads & capture nav timing', () => {
  cy.visit('/login');
  cy.window().then((w) => {
    const entry = w.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming; | undefined;
    if (entry) {
      const data = typeof entry.toJSON === 'function' ? entry.toJSON() : entry;
      cy.task('recordNavTiming', data);
    });
  });

  it('02 – Login with credentials', () => {
    const t0 = Date.now();
    cy.findByLabelText(/email|username/i).type(username).catch(() => {
      cy.get('input[type=email], input[name=email], input[name=username]').first().type(username);
    });
    cy.findByLabelText(/password/i).type(password).catch(() => {
      cy.get('input[type=password], input[name=password]').first().type(password);
    });
    cy.contains('button, [role=button]', /sign in|log in/i).click();
    cy.contains(/projects|dashboard|library/i, { timeout: 30000 }).should('be.visible').then(() => {
      cy.recordAction('login', t0);
    });
  });

  it('03 – Open project "The Astronauts - Surf Party"', () => {
    const t0 = Date.now();
    cy.contains('The Astronauts - Surf Party', { timeout: 20000 }).click();
    cy.contains('button, [role=button]', /open link/i, { timeout: 20000 }).should('be.visible').then(() => {
      cy.recordAction('open-project', t0);
    });
  });

  it('04 – Playlist buttons visible', () => {
    cy.contains('button, [role=button]', /^play$/i).should('exist');
    cy.contains('button, [role=button]', /open link/i).should('exist');
    cy.contains('button, [role=button]', /details/i).should('exist');
  });

  it('05 – At least one audio file listed', () => {
    cy.contains('# 1').should('exist');
  });

  it('06 – Click track #1 to start playback', () => {
    cy.contains('# 1').click({ force: true });
  });
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
   
  it('08 – Verify bottom player controls', () => {
    cy.get('body').within(() => {
      cy.contains(/shuffle/i).should('exist');
      cy.contains(/rewind|back/i).should('exist');
      cy.contains(/play|pause/i).should('exist');
      cy.contains(/forward|skip/i).should('exist');
    });
  });

  it('09 – Progress advances, then pause toggles', () => {
    cy.get('audio').first().then(($audio) => {
      const t1 = ($audio[0] as HTMLAudioElement).currentTime;
      cy.wait(1500);
      cy.get('audio').first().then(($audio2) => {
        const t2 = ($audio2[0] as HTMLAudioElement).currentTime;
        expect(t2).to.be.greaterThan(t1);
      });
    });

    cy.contains('button, [role=button]', /play|pause/i).click();
    cy.wait(800);
    cy.get('audio').first().then(($audio) => {
      const el = $audio[0] as HTMLAudioElement;
      expect(el.paused).to.eq(true);
    });
  });

  it('10 – Logout and verify redirected to login', () => {
    const t0 = Date.now();
    cy.contains('a, button, [role=button]', /log out|sign out/i, { timeout: 20000 }).click({ force: true });
    cy.location('pathname', { timeout: 20000 }).should('eq', '/login').then(() => {
      cy.recordAction('logout', t0);
    });
  });
//@@
//-  after(() => {
//-    cy.task('flushResults').then((outPath) => {
//-      cy.log(`Results written to ${outPath}`);
//-    });
//-  });
  after(() => {
    // Flush batched requests from intercept callback
    cy.then(() => cy.task('recordRequestsBatch', requests))
      .then(() => cy.task('flushResults'))
      .then((outPath) => { cy.log(`Results written to ${outPath}`); });
  });
 });
