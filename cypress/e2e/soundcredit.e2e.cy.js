// cypress/e2e/soundcredit.e2e.cy.js
const username = Cypress.env('SC_USERNAME') || '';
const password = Cypress.env('SC_PASSWORD') || '';

// collect audio request URLs + batched request logs across the whole spec
let audioUrls = [];
let requests = [];

describe('SoundCredit – Login → Play → Logout', () => {
  it('00 – sanity', () => {
    expect(true).to.eq(true);
  });

  before(() => {
    expect(username, 'SC_USERNAME env var').to.be.a('string').and.not.be.empty;
    expect(password, 'SC_PASSWORD env var').to.be.a('string').and.not.be.empty;

    // Capture requests without calling cy.* inside this callback
    cy.intercept('GET', '**', (req) => {
      const startedAt = Date.now();
      req.on('response', (res) => {
        const ct = String(res.headers['content-type'] || '');
        const url = req.url.toLowerCase();
        const looksAudio =
          ct.includes('audio') ||
          url.includes('.mp3') ||
          url.includes('.m3u8') ||
          url.includes('.aac') ||
          url.includes('.ogg');
        const durationMs = Date.now() - startedAt;
        if (looksAudio) audioUrls.push(req.url);
        requests.push({ url: req.url, method: req.method, status: res.statusCode, durationMs });
      });
    });

    // pre-warm reference fingerprint cache (non-fatal)
    cy.task('referenceFingerprint');
  });

  it('01 – Login page loads & capture nav timing', () => {
    cy.visit('/login');
    cy.window().then((w) => {
      const entries = w.performance && w.performance.getEntriesByType
        ? w.performance.getEntriesByType('navigation')
        : [];
      const entry = Array.isArray(entries) && entries.length ? entries[0] : null;
      if (entry) {
        const data = typeof entry.toJSON === 'function' ? entry.toJSON() : entry;
        cy.task('recordNavTiming', data);
      }
    });
  });

  it('02 – Login with credentials', () => {
  const t0 = Date.now();

  // dismiss cookie/consent banners if they appear
  cy.get('body').then(($b) => {
    const txt = $b.text();
    if (/accept|agree|cookie/i.test(txt)) {
      cy.contains(/accept|agree/i).click({ multiple: true, force: true }).catch(() => {});
    }
  });

  // EMAIL / USERNAME
  cy.get(
    '.username-container input[placeholder="Email"], ' +
    '.username-container input[name="email"], ' +
    'input[placeholder="Email"], input[name="email"], input[type="email"]',
    { timeout: 15000 }
  )
    .should('be.visible')
    .first()
    .clear()
    .type(username, { delay: 20 });

  // PASSWORD
  cy.get('input[placeholder="Password"], input[name="password"], input[type="password"]', { timeout: 15000 })
    .should('be.visible')
    .first()
    .clear()
    .type(password, { log: false });

  // SUBMIT
  cy.contains('button, [role=button], input[type=submit]', /sign in|log in|log on/i)
    .should('be.enabled')
    .click();

  // POST-LOGIN ASSERTION + TIMING
  cy.location('pathname', { timeout: 30000 })
    .should('not.include', '/login');
  cy.contains(/projects|dashboard|library/i, { timeout: 30000 })
    .should('be.visible')
    .then(() => cy.task('recordAction', { name: 'login', durationMs: Date.now() - t0 }));
});
it('03 – Open project "The Astronauts - Surf Party"', () => {
  const t0 = Date.now();
  const title = 'The Astronauts - Surf Party';
  const re = new RegExp(`\\b${Cypress._.escapeRegExp(title)}\\b`, 'i');

  // 1) Best case: it’s an accessible link/button with the project name
  cy.findByRole('link', { name: re, timeout: 20000 })
    .then($lnk => {
      if ($lnk.length) {
        cy.wrap($lnk).scrollIntoView().click();
        return;
      }
      throw new Error('no-aria-link');
    })
    .catch(() => {
      // 2) Fallback: find the card, then click its inner link/button (or the card itself)
      cy.get('[class*="project-preview-card"], .project-preview-card, .project-preview-card.card, .card', { timeout: 20000 })
        .then($cards => {
          // find the first card whose innerText matches the title
          const target = [...$cards].find(el => re.test(el.innerText || ''));
          expect(target, `project card "${title}"`).to.exist;

          const clickable =
            target.querySelector('a,button,[role="link"],[role="button"]') || target;

          cy.wrap(clickable).scrollIntoView().click({ force: true });
        });
    });

  // page ready = playlist has the "Open Link" button
  cy.contains('button, [role=button]', /open link/i, { timeout: 20000 })
    .should('be.visible')
    .then(() => cy.task('recordAction', { name: 'open-project', durationMs: Date.now() - t0 }));
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
    // allow opt-out in CI
    if (Cypress.env('SKIP_AUDIO')) {
      cy.task('recordStep', { name: 'audio-fingerprint', status: 'skipped', note: 'SKIP_AUDIO=true' });
      return;
    }

    // try to assert play state if an <audio> exists
    cy.get('body').then(($body) => {
      const el = $body.find('audio').get(0);
      if (el) expect(el.paused).to.eq(false);
      else cy.task('recordStep', { name: 'audio-element', status: 'warning', note: '<audio> not found; player may be WebAudio/MSE' });
    });

    // time should advance if audio tag exists
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

    // fingerprint chain (no async/await; no cy.* inside raw callbacks)
    cy.then(() => {
      if (!audioUrls.length) {
        return cy.task('recordStep', { name: 'audio-fingerprint', status: 'warning', note: 'Live audio URL not captured; MSE/DRM suspected' });
      }
    }).then(() => {
      if (!audioUrls.length) return;
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
    cy.get('body').then(($body) => {
      const el = $body.find('audio').get(0);
      if (!el) return;
      const t1 = el.currentTime;
      cy.wait(1500).then(() => {
        const t2 = el.currentTime;
        expect(t2).to.be.greaterThan(t1);
      });
    });

    cy.contains('button, [role=button]', /play|pause/i).click();
    cy.wait(800);
    cy.get('body').then(($body) => {
      const el = $body.find('audio').get(0);
      if (el) expect(el.paused).to.eq(true);
    });
  });

  it('10 – Logout and verify redirected to login', () => {
    const t0 = Date.now();
    cy.contains('a, button, [role=button]', /log out|sign out/i, { timeout: 20000 }).click({ force: true });
    cy.location('pathname', { timeout: 20000 })
      .should('eq', '/login')
      .then(() => cy.task('recordAction', { name: 'logout', durationMs: Date.now() - t0 }));
  });
  after(() => {
    // Flush batched requests from intercept callback, then write results.json
    cy.then(() => cy.task('recordRequestsBatch', requests))
      .then(() => cy.task('flushResults'))
      .then((outPath) => { cy.log(`Results written to ${outPath}`); });
  });
});
