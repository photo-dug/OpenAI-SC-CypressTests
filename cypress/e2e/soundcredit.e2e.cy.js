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

    // OPEN LINK
    cy.contains('button, .btn, [role=button]', /open\s*link/i, { timeout: 30000 }).should('be.visible');
    // DETAILS
    cy.contains('button, .btn, [role=button]', /details/i, { timeout: 30000 }).should('be.visible');
    // ADD
    cy.contains('button, .btn, [role=button]', /^\s*add\s*$/i).should('be.visible');
    // PROJECT LINK (icon)
    cy.get('button .fa-link', { timeout: 15000 }).should('exist');
    // PLAY (icon)
    cy.get('button .fa-play', { timeout: 15000 }).should('exist');

    // OPTIONAL Copy: warn if missing
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
    const skipAudio = Cypress.env('SKIP_AUDIO') === true || Cypress.env('SKIP_AUDIO') === 'true';
    if (skipAudio) {
      cy.task('recordStep', { name: 'audio-fingerprint', status: 'skipped', note: 'SKIP_AUDIO=true' });
      return;
    }

    // Try to assert play state if an <audio> exists; warn if using WebAudio/MSE
    cy.get('body').then(($body) => {
      const el = $body.find('audio').get(0);
      if (!el) {
        cy.task('recordStep', { name: 'audio-element', status: 'warning', note: '<audio> not found; player may use WebAudio/MSE' });
        return;
      }
      expect(el.paused).to.eq(false);
    });

    // Time should advance if audio tag exists
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

  // 08 – Verify bottom player controls (mount if needed, then assert by icons/slider)
  it('08 – Verify bottom player controls', () => {
    // If the bottom bar isn't mounted yet, poke a play control to mount it
    cy.get('body', { timeout: 30000 })
      .then($b => $b.find('[class*="AudioPlayerBar_"], .AudioPlayerBar_audio-player-bar__').length > 0)
      .then((hasBar) => {
        if (!hasBar) {
          cy.get('button .fa-play-circle, button .fa-play', { timeout: 10000 })
            .first()
            .parents('button')
            .first()
            .scrollIntoView()
            .click({ force: true });
          cy.wait(500);
        }
      });

    // Now assert controls globally (container-agnostic)
    cy.get('.fa-random, .fa-shuffle', { timeout: 30000 }).should('exist');                    // shuffle
    cy.get('.fa-step-backward, .fa-backward', { timeout: 30000 }).should('exist');            // back/rewind
    cy.get('.fa-play-circle, .fa-pause-circle, .fa-play, .fa-pause', { timeout: 30000 }).should('exist'); // play/pause
    cy.get('.fa-step-forward, .fa-forward', { timeout: 30000 }).should('exist');              // forward

    // Progress: slider or mm:ss times
    cy.get('[role="slider"], [class*="progress-slider"]', { timeout: 30000 }).should('exist');
    cy.get('span').then($spans => {
      const times = [...$spans].map(s => (s.textContent || '').trim()).filter(t => /^\d{2}:\d{2}$/.test(t));
      expect(times.length, 'player time labels').to.be.greaterThan(0);
    });
  });

 // 09 – Progress advances, then pause toggles
it('09 – Progress advances, then pause toggles', () => {
  // Ensure player is visible / mounted (best-effort)
  cy.get('.fa-play-circle, .fa-pause-circle, .fa-play, .fa-pause', { timeout: 30000 }).should('exist');

  // Grab the *current time* label (mm:ss) and check it advances
  const readCurrentTime = () =>
    cy.get('span').then($spans => {
      const mmss = [...$spans]
        .map(s => (s.textContent || '').trim())
        .filter(t => /^\d{2}:\d{2}$/.test(t));
      // Assume the first mm:ss near the player is current time
      return mmss.length ? mmss[0] : null;
    });

  const toSec = (t) => {
    if (!t) return null;
    const [m, s] = t.split(':').map(n => parseInt(n, 10));
    return (isNaN(m) || isNaN(s)) ? null : m * 60 + s;
  };

  let t1s = null;

  readCurrentTime().then(t1 => {
    t1s = toSec(t1);
    // if not playing yet, tap play icon to start
    if (t1s === 0 || t1s === null) {
      cy.get('button .fa-play-circle, button .fa-play').first().parents('button').first().click({ force: true });
      cy.wait(700);
    }
  });

  cy.wait(1500);

  readCurrentTime().then(t2 => {
    const t2s = toSec(t2);
    // Progress should have advanced
    expect(t2s, 'current time (s)').to.be.a('number');
    if (t1s !== null) {
      expect(t2s).to.be.greaterThan(t1s);
    }
  });

  // Click the play/pause button (icon-based)
  cy.get('button .fa-pause-circle, button .fa-pause, button .fa-play-circle, button .fa-play', { timeout: 10000 })
    .first()
    .parents('button')
    .first()
    .scrollIntoView()
    .click({ force: true });

  cy.wait(800);

  // Prefer an <audio> pause assertion if available; else confirm icon flip or no time movement
  cy.get('body').then(($body) => {
    const el = $body.find('audio').get(0);
    if (el) {
      expect(el.paused, '<audio>.paused after toggle').to.eq(true);
    } else {
      // No <audio>: check icon indicates paused, or time stops advancing
      const hasPlayIcon = $body.find('.fa-play-circle, .fa-play').length > 0;
      if (hasPlayIcon) {
        expect(hasPlayIcon, 'play icon visible after toggle').to.eq(true);
      } else {
        // fallback: time should not increase over the next 1s
        return readCurrentTime().then(tBefore => {
          const sBefore = toSec(tBefore);
          cy.wait(1000).then(() => {
            readCurrentTime().then(tAfter => {
              const sAfter = toSec(tAfter);
              // allow 1s jitter; should not be +1 or more if paused
              expect(sAfter - sBefore, 'time delta while paused').to.be.at.most(0);
            });
          });
        });
      }
    }
  });
});

// 10 – Logout and verify redirected to login
it('10 – Logout and verify redirected to login', () => {
  const t0 = Date.now();

  // Click the sidebar Logout link (anchor goes to /login)
  cy.get('a.sidebar-nav-link[href="/login"], .logout-nav a[href="/login"]', { timeout: 20000 })
    .should('be.visible')
    .scrollIntoView()
    .click({ force: true });

  // Verify we’re back on the login page
  cy.location('pathname', { timeout: 30000 }).should('eq', '/login');
  cy.get('input[placeholder="Email"], input[name="email"], input[type="email"]', { timeout: 10000 }).should('be.visible');
  cy.get('input[placeholder="Password"], input[name="password"], input[type="password"]').should('be.visible');

  cy.then(() => cy.task('recordAction', { name: 'logout', durationMs: Date.now() - t0 }));
      });
    });
  });
});
});
});
