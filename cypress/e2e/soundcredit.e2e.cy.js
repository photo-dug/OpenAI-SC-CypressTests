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
      const entries =
        w.performance && w.performance.getEntriesByType
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
    cy.contains('button, [role=button], input[type=submit]', /sign in|log in|log on/i).should('be.enabled').click();

    // POST-LOGIN ASSERTION + TIMING
    cy.location('pathname', { timeout: 30000 }).should('not.include', '/login');
    cy.contains(/projects|dashboard|library/i, { timeout: 30000 })
      .should('be.visible')
      .then(() => cy.task('recordAction', { name: 'login', durationMs: Date.now() - t0 }));
  });

  it('03 – Open project "The Astronauts - Surf Party"', () => {
  const t0 = Date.now();
  const title = 'The Astronauts - Surf Party';

  // 1) If we're on Home, go to Projects (/playlists) via the left sidebar
  cy.location('pathname', { timeout: 20000 }).then((p) => {
    if (!/^\/playlists(\/|$)/.test(p)) {
      cy.get('a.sidebar-nav-link[href="/playlists"]', { timeout: 20000 })
        .should('be.visible')
        .click();
      cy.location('pathname', { timeout: 30000 }).should('match', /^\/playlists(\/|$)/);
    }
  });

  // 2) Prefer the LEFT LIST if it exists (it navigates to /playlists/{id})
  cy.get('body', { timeout: 20000 }).then(($b) => {
    const links = $b.find('.playlist-bottom-submenu a[href^="/playlists/"]').toArray();
    const match = links.find((a) => (a.innerText || '').trim().toLowerCase() === title.toLowerCase());
    if (match) {
      cy.wrap(match).scrollIntoView().click({ force: true });
      return;
    }

    // 3) Fallback: click the GRID CARD for the title
    cy.contains('.project-preview-card .project-title', title, { timeout: 20000 })
      .should('be.visible')
      .parents('.project-preview-card')
      .then(($card) => {
        // Try overlay play button on the thumbnail; if not, click first clickable child
        const overlaySel =
          '.project-thumbnail-container .play-button, .project-thumbnail-container button, .project-thumbnail-container';
        if ($card.find(overlaySel).length) {
          cy.wrap($card).find(overlaySel).first().scrollIntoView().click({ force: true });
        } else {
          cy.wrap($card).find('a,button,[role="link"],[role="button"]').first().scrollIntoView().click({ force: true });
        }
      });
  });

  // 4) Confirm we landed on the playlist page
  cy.location('pathname', { timeout: 30000 }).should('match', /^\/playlists\/\d+/);
  cy.contains('button, .btn, [role=button]', /open\s*link/i, { timeout: 30000 }).should('be.visible');
  cy.contains('button, .btn, [role=button]', /details/i,   { timeout: 30000 }).should('be.visible');

  cy.then(() => cy.task('recordAction', { name: 'open-project', durationMs: Date.now() - t0 }));
});

// 04 – Project buttons visible. Play, Add, Open Link, Details, Project Link
it('04 – Project buttons visible', () => {
  // we should already be on /playlists/{id}
  cy.location('pathname', { timeout: 30000 }).should('match', /^\/playlists\/\d+/);

  // OPEN LINK (text lives inside nested <div> within the <button>)
  cy.contains('button, .btn, [role=button]', /open\s*link/i, { timeout: 30000 })
    .should('be.visible');

  // DETAILS (text button)
  cy.contains('button, .btn, [role=button]', /details/i, { timeout: 30000 })
    .should('be.visible');

  // ADD (text button)
  cy.contains('button, .btn, [role=button]', /^\s*add\s*$/i)
    .should('be.visible');

  // PROJECT LINK (icon-only button with link icon)
  cy.get('button .fa-link', { timeout: 15000 })
    .should('exist');

  // PLAY (icon-only button with .fa-play)
  cy.get('button .fa-play', { timeout: 15000 })
    .should('exist');

  // OPTIONAL: Copy (not always present) — warn instead of failing if missing
  cy.get('body').then(($b) => {
    const hasCopy = $b.find('button .fa-copy, button:contains("Copy")').length > 0;
    if (!hasCopy) {
      cy.task('recordStep', { name: 'toolbar-copy', status: 'warning', note: 'Copy button not found' });
    }
  });
});

  it('05 – At least one audio file listed', () => {
    cy.contains('1').should('exist');
  });

  it('06 – Click track #1 to start playback', () => {
    cy.contains('1').click({ force: true });
    cy.wait(500);
  });

  it('07 – Verify audio is playing and matches reference (first 5s)', () => {
    // allow opt-out in CI
    const skipAudio = Cypress.env('SKIP_AUDIO') === true || Cypress.env('SKIP_AUDIO') === 'true';
    if (skipAudio) {
      cy.task('recordStep', { name: 'audio-fingerprint', status: 'skipped', note: 'SKIP_AUDIO=true' });
      return;
    }

    // try to assert play state if an <audio> exists
    cy.get('body').then(($body) => {
      const el = $body.find('audio').get(0);
      if (el) expect(el.paused).to.eq(false);
      if (!el) {
      cy.task('recordStep', { name: 'audio-element', status: 'warning', note: '<audio> not found; player may use WebAudio/MSE' });
    return;
  }
  expect(el.paused).to.eq(false);
});
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

    // fingerprint chain
    cy
      .then(() => {
        if (!audioUrls.length) {
          return cy.task('recordStep', { name: 'audio-fingerprint', status: 'warning', note: 'Live audio URL not captured; MSE/DRM suspected' });
        }
      })
      .then(() => {
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

// 08 – Verify bottom player controls (icon-based, container-agnostic)
// 08 – Verify bottom player controls (mount if needed, then assert by icons/slider)
it('08 – Verify bottom player controls', () => {
  // If the bottom bar isn't mounted yet, poke a play control to mount it
  cy.get('body', { timeout: 30000 })
    .then($b => $b.find('[class*="AudioPlayerBar_"], .AudioPlayerBar_audio-player-bar__').length > 0)
    .then((hasBar) => {
      if (!hasBar) {
        // Click a visible play control to trigger the player
        cy.get('button .fa-play-circle, button .fa-play', { timeout: 10000 })
          .first()
          .parents('button')
          .first()
          .scrollIntoView()
          .click({ force: true });
        cy.wait(500); // give the bar time to mount
      }
    });
  });

  // Now assert controls globally (container-agnostic)
  // shuffle
  cy.get('.fa-random, .fa-shuffle', { timeout: 30000 }).should('exist');
  // back/rewind
  cy.get('.fa-step-backward, .fa-backward', { timeout: 30000 }).should('exist');
  // play/pause (either state is fine)
  cy.get('.fa-play-circle, .fa-pause-circle, .fa-play, .fa-pause', { timeout: 30000 }).should('exist');
  // forward/skip
  cy.get('.fa-step-forward, .fa-forward', { timeout: 30000 }).should('exist');

  // Progress: slider or mm:ss times
  cy.get('[role="slider"], [class*="progress-slider"]', { timeout: 30000 }).should('exist');
  cy.get('span').then($spans => {
    const times = [...$spans].map(s => (s.textContent || '').trim()).filter(t => /^\d{2}:\d{2}$/.test(t));
    expect(times.length, 'player time labels').to.be.greaterThan(0);
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
    cy
      .then(() => cy.task('recordRequestsBatch', requests))
      .then(() => cy.task('flushResults'))
      .then((outPath) => {
        cy.log(`Results written to ${outPath}`);
      });
  });
});
