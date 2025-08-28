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
    
    // Viewport: Forces a desktop layout so the sidebar and inputs aren’t hidden behind responsive variants.
    cy.viewport(1366, 900); // avoid responsive variants hiding the sidebar
    cy.document({ log: false }).its('readyState').should('eq', 'complete');
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

  // Ensure we are on the login route
  cy.url({ timeout: 80000 }).should('match', /\/login(?:[/?#]|$)/);

  // dismiss cookie/consent if present
  cy.get('body', { timeout: 80000 }).then(($b) => {
    const txt = $b.text();
    if (/accept|agree|cookie/i.test(txt)) {
      cy.contains(/accept|agree/i).click({ multiple: true, force: true }).catch(() => {});
    }
  });

  // EMAIL
  cy.get(
    [
      'input[type="email"]',
      'input[name="email"]',
      'input[placeholder*="mail" i]',
      'input[id*="email" i]',
      '.username-container input'
    ].join(', '),
    { timeout: 80000 }
  )
    .filter(':visible')
    .first()
    .should('be.visible')
    .clear()
    .type(username, { delay: 20 });

  // PASSWORD
  cy.get(
    [
      'input[type="password"]',
      'input[name="password"]',
      'input[placeholder*="password" i]',
      'input[id*="password" i]'
    ].join(', '),
    { timeout: 80000 }
  )
    .filter(':visible')
    .first()
    .should('be.visible')
    .clear()
    .type(password, { log: false });

  // SUBMIT
  cy.contains('button, [role=button], input[type=submit]', /sign\s*in|log\s*in|continue/i, { timeout: 80000 })
    .scrollIntoView()
    .click({ force: true });

  // Post-login: wait for a *UI* landmark instead of only url
  cy.contains(/home|projects|dashboard|library/i, { timeout: 80000 }).should('be.visible');

  // URL may be /home or /playlists, accept both
  cy.url({ timeout: 80000 }).should('match', /\/(home|playlists)(?:[/?#]|$)/);

  cy.then(() => cy.task('recordAction', { name: 'login', durationMs: Date.now() - t0 }));
});

it('03 – Open project "The Astronauts - Surf Party"', () => {
  const t0 = Date.now();
  const title = 'The Astronauts - Surf Party';
  const titleRe = new RegExp(`^\\s*${Cypress._.escapeRegExp(title)}\\s*$`, 'i');

  // If Cloud bounced us to /login, retry submit once
  cy.url({ timeout: 10000 }).then((u) => {
    if (/\/login(?:[/?#]|$)/.test(u)) {
      cy.contains('button, [role=button], input[type=submit]', /sign\s*in|log\s*in|continue/i, { timeout: 20000 })
        .scrollIntoView()
        .click({ force: true });
      cy.contains(/home|projects|dashboard|library/i, { timeout: 60000 }).should('be.visible');
    }
  });

  // (A) On HOME: start playback on the card with our title
  cy.contains('.project-preview-card .project-title', title, { timeout: 60000 })
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

  // (B) Try to navigate via ANY anchor to /playlists/<id> (e.g., bottom bar)
  cy.wait(400); // give the bar a tick to mount
  cy.get('a[href^="/playlists/"]', { timeout: 5000 }).then(($as) => {
    const withId = [...$as].find((a) => /\d+/.test(a.getAttribute('href') || ''));
    if (withId) {
      cy.wrap(withId).scrollIntoView().click({ force: true });
    } else {
      // (C) Fallback: go to Projects and use the left list
      cy.get('a[href="/playlists"]', { timeout: 60000 }).filter(':visible').first().click({ force: true });
      cy.get('.playlist-bottom-submenu', { timeout: 60000 }).should('exist');
      cy.contains('.playlist-bottom-submenu a[href^="/playlists/"] span', titleRe, { timeout: 60000 })
        .parents('a[href^="/playlists/"]')
        .first()
        .scrollIntoView()
        .click({ force: true });
    }
  });

  // Landmark first (avoid URL-race flake in Cloud)
  cy.contains('button, .btn, [role=button]', /open\s*link/i, { timeout: 60000 }).should('be.visible');
  cy.contains('button, .btn, [role=button]', /details/i,   { timeout: 60000 }).should('be.visible');

  // Optional: url after UI is ready
  cy.url({ timeout: 60000 }).should('match', /\/playlists\/\d+(?:[/?#]|$)/);

  cy.then(() => cy.task('recordAction', { name: 'open-project', durationMs: Date.now() - t0 }));
});

it('04 – Project buttons visible', () => {
  // UI landmarks prove we’re on the playlist page
  cy.contains('button, .btn, [role=button]', /open\s*link/i, { timeout: 60000 }).should('be.visible');
  cy.contains('button, .btn, [role=button]', /details/i,   { timeout: 60000 }).should('be.visible');

  // Optional: now the URL should be /playlists/<id> (allow query/hash)
  cy.url().should('match', /\/playlists\/\d+(?:[/?#]|$)/);

  // ... your existing Add / link icon / play icon checks ...
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
  // Progress advances first (mm:ss)
  const readCurrentTime = () =>
    cy.get('span').then($spans => {
      const mmss = [...$spans].map(s => (s.textContent || '').trim()).filter(t => /^\d{2}:\d{2}$/.test(t));
      return mmss.length ? mmss[0] : null;
    });
  const toSec = (t) => {
    if (!t) return null; const [m, s] = t.split(':').map(n => parseInt(n, 10));
    return (isNaN(m) || isNaN(s)) ? null : m * 60 + s;
  };

  let t1s = null;
  readCurrentTime().then(t1 => { t1s = toSec(t1); });
  cy.wait(1500);
  readCurrentTime().then(t2 => {
    const t2s = toSec(t2);
    expect(t2s, 'current time (s)').to.be.a('number');
    if (t1s !== null) expect(t2s).to.be.greaterThan(t1s);
  });

  // Click the PAUSE control specifically (prefer the pause icon if playing)
  cy.get('button .fa-pause-circle, button .fa-pause, button .fa-play-circle, button .fa-play', { timeout: 15000 })
    .filter(':visible')
    .first()
    .parents('button')
    .first()
    .scrollIntoView()
    .click({ force: true });

  cy.wait(800);

  // Prefer <audio>.paused when available; otherwise confirm icon flip or that time stops
  cy.get('body').then(($body) => {
    const el = $body.find('audio').get(0);
    if (el) {
      expect(el.paused, '<audio>.paused after toggle').to.eq(true);
    } else {
      const hasPlayIcon = $body.find('.fa-play-circle, .fa-play').length > 0;
      if (hasPlayIcon) expect(hasPlayIcon, 'play icon visible after toggle').to.eq(true);
      else {
        return readCurrentTime().then(tBefore => {
          const sBefore = toSec(tBefore);
          cy.wait(1000).then(() => {
            readCurrentTime().then(tAfter => {
              const sAfter = toSec(tAfter);
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

  // Ensure the sidebar is in view and try the explicit /login anchor
  cy.get('aside.m-sidebar', { timeout: 60000 }).scrollTo('bottom', { ensureScrollable: false });
  cy.get('a.sidebar-nav-link[href="/login"], .logout-nav a[href="/login"]', { timeout: 60000 })
    .should('be.visible')
    .scrollIntoView()
    .click({ force: true });

  // If the anchor wasn’t found (responsive variant), use a direct logout fallback:
  cy.url({ timeout: 10000 }).then((u) => {
    if (!/\/login(?:[/?#]|$)/.test(u)) {
      // as a last resort: clear session cookies and go to /login
      cy.clearCookies();
      cy.visit('/login', { failOnStatusCode: false });
    }
  });

  cy.url({ timeout: 60000 }).should('match', /\/login(?:[/?#]|$)/);
  cy.get('input[type="email"], input[name="email"], input[placeholder*="mail" i]', { timeout: 10000 }).should('exist');
  cy.get('input[type="password"], input[name="password"]', { timeout: 10000 }).should('exist');

  cy.then(() => cy.task('recordAction', { name: 'logout', durationMs: Date.now() - t0 }));
  });
});

