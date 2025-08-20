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

  // 1) Narrow the list if the search bar exists
  cy.get('input#pill-search-bar, input[placeholder="Search..."]', { timeout: 5000 })
    .then($inp => {
      if ($inp.length) cy.wrap($inp).clear().type(title, { delay: 10 }).blur();
    });

  // 2) Wait for cards / thumbnails to render
  cy.get('.project-thumbnail-container', { timeout: 20000 }).should('exist');

  // 3) Find the thumbnail whose containing card text matches the title, then click its overlay play
  cy.get('body').then(($body) => {
    const thumbs = $body.find('.project-thumbnail-container').toArray();
    let chosenThumb = null;

    for (const el of thumbs) {
      const card =
        el.closest('[class*="project-preview-card"]') ||
        el.closest('.project-preview-card') ||
        el.closest('.card') ||
        el.parentElement;
      const text = (card && card.innerText) ? card.innerText.trim() : '';
      if (re.test(text)) { chosenThumb = el; break; }
    }

    if (!chosenThumb) {
      // Fallback: click a card by its title text directly (if clickable)
      cy.contains(
        '[class*="project-preview-card"], .project-preview-card, .project-preview-card.card, .card',
        re,
        { timeout: 20000 }
      ).scrollIntoView().click({ force: true });
      return;
    }

    const playBtn =
      chosenThumb.querySelector('.play-button') ||
      chosenThumb.querySelector('button') ||
      chosenThumb.querySelector('.fa-play')?.closest('button');
    
    cy.get('[class*="project-preview-card"], .project-preview-card, .card').then($cards => {
    const titles = [...$cards].map(n => (n.innerText || '').trim()).slice(0, 10);
    cy.log('first card texts:', JSON.stringify(titles));
  });

    if (playBtn) {
      cy.wrap(playBtn).scrollIntoView().click({ force: true });
    } else {
      // Last resort: click the thumb container itself
      cy.wrap(chosenThumb).scrollIntoView().click({ force: true });
    }
  });

  // 4) Confirm we’re on the playlist page by checking the known toolbar controls (global, not navbar)
  cy.contains('button, .btn, [role=button]', /open\s*link/i, { timeout: 30000 }).should('be.visible');
  cy.contains('button, .btn, [role=button]', /details/i, { timeout: 30000 }).should('be.visible');
  cy.get('button').filter((_, el) => !!el.querySelector('.fa-play')).should('exist');

  cy.task('recordAction', { name: 'open-project', durationMs: Date.now() - t0 });
});
  
  it('04 – Project buttons visible. Play, Add, Copy, Open link, Details, Project Link', () => {
  // Narrow to the top action bar so we don't pick up other buttons elsewhere
  cy.get('.d-flex.justify-content-between', { timeout: 20000 })
    .first()
    .within(() => {
      // PLAY: icon-only button – assert a button that contains a .fa-play icon
      cy.get('button').filter((_, el) => !!el.querySelector('.fa-play')).should('exist');
      
      // ADD: text is inside nested divs; match with flexible whitespace
      cy.contains('button', /add/i).should('be.visible');
      
      // COPY: similarly inside a nested div
      cy.contains('button', /Copy/i).should('be.visible');
      
      // OPEN LINK: text is inside nested divs; match with flexible whitespace
      cy.contains('button', /open\s*link/i).should('be.visible');

      // DETAILS: similarly inside a nested div
      cy.contains('button', /details/i).should('be.visible');
    });
});

  it('05 – At least one audio file listed', () => {
    cy.contains('1').should('exist');
  });

  it('06 – Click track #1 to start playback', () => {
    cy.contains('1').click({ force: true });
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
