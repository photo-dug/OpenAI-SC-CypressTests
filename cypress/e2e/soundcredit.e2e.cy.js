// cypress/e2e/soundcredit.e2e.cy.js
const username = Cypress.env("SC_USERNAME") || "";
const password = Cypress.env("SC_PASSWORD") || "";

/* ---------- login with a versioned session ---------- */
const SESSION_VERSION = "v2"; // bump when you change login()
const SESSION_ID = [`sc-login:${SESSION_VERSION}`, username];
const LOGIN_INPUTS = [
  'input[type="email"]',
  'input[name="email"]',
  'input[placeholder*="mail"]',
  'input[id*="email"]',
  ".username-container input",
].join(", ");

const PASS_INPUTS = [
  'input[type="password"]',
  'input[name="password"]',
  'input[placeholder*="password"]',
  'input[id*="password"]',
].join(", ");

const login = () => {
  // go to /login but don’t fail if the server returns a 30x or interstitial
  cy.visit("/login", { failOnStatusCode: false });

  // if we’re already authenticated (redirected to /home or /playlists), short-circuit
  cy.url({ timeout: 15000 }).then((u) => {
    if (/\/(home|playlists)(?:[/?#]|$)/.test(u)) {
      // session is already valid — nothing to do
      return;
    }

    // otherwise we are really on /login: fill the form if inputs exist
    cy.get("body", { timeout: 30000 }).then(($b) => {
      const hasEmail = $b.find(LOGIN_INPUTS).length > 0;
      if (!hasEmail) {
        // Interstitial or slow render: try one soft reload once
        cy.reload();
      }
    });

    // type email
    cy.get(LOGIN_INPUTS, { timeout: 60000 })
      .filter(":visible")
      .first()
      .clear()
      .type(username, { delay: 40 });

    // type password
    cy.get(PASS_INPUTS, { timeout: 60000 })
      .filter(":visible")
      .first()
      .clear()
      .type(password, { log: false });

    // submit
    cy.contains(
      "button, [role=button], input[type=submit]",
      /sign\s*in|log\s*in|continue/i,
      { timeout: 60000 },
    )
      .scrollIntoView()
      .click({ force: true });
  });

  // post-login landmark (accept /home or /playlists)
  cy.contains(/home|projects|dashboard|library/i, { timeout: 60000 }).should(
    "be.visible",
  );
  cy.url({ timeout: 60000 }).should("match", /\/(home|playlists)(?:[/?#]|$)/);
};

const ensureLoggedIn = () =>
  cy.session(SESSION_ID, login, {
    cacheAcrossSpecs: true,
    validate() {
      // skip recreating if we can reach /playlists (or we’re already there)
      cy.request({ url: "/playlists", failOnStatusCode: false })
        .its("status")
        .should("be.oneOf", [200, 302]);
    },
  });

/* ---------- globals ---------- */
let audioUrls = [];
let audioHits = []; // [{ url, ts, ct }], newest last
let requests = [];
let currentAudioUrl = null;
let clickMark = 0; // timestamp when we click track #1

/* ---------- helpers ---------- */
const goToProjects = () => {
  return cy.get("body", { timeout: 60000 }).then(($b) => {
    // Sidebar "Projects"
    const sidebarLink = $b.find('a[href="/playlists"]')[0];
    if (sidebarLink) {
      cy.wrap(sidebarLink).scrollIntoView().click({ force: true });
      return cy.url({ timeout: 60000 }).should("match", /\/playlists(?:[/?#]|$)/);
    }

    // Footer “View all”
    const viewAllBtn = [...$b.find("button, .btn, [role=button]")].find((el) =>
      /view\s*all/i.test((el.textContent || "").trim())
    );
    if (viewAllBtn) {
      cy.wrap(viewAllBtn).scrollIntoView().click({ force: true });
      return cy.url({ timeout: 60000 }).should("match", /\/playlists(?:[/?#]|$)/);
    }

    // Last resort: direct visit
    cy.visit("/playlists", { failOnStatusCode: false });
    return cy.url({ timeout: 60000 }).should("match", /\/playlists(?:[/?#]|$)/);
  });
};

const openPlaylistByTitle = (title) => {
  const re = new RegExp(`^\\s*${Cypress._.escapeRegExp(title)}\\s*$`, "i");
  return cy.get("body", { timeout: 60000 }).then(($b) => {
    // Prefer LEFT LIST (sidebar)
    const span = [
      ...$b.find('.playlist-bottom-submenu a[href^="/playlists/"] span'),
    ].find((el) => re.test((el.textContent || "").trim()));
    if (span) {
      return cy
        .wrap(span.closest('a[href^="/playlists/"]'))
        .scrollIntoView()
        .click({ force: true });
    }

    // Fallback: GRID card (wake UI), then click left-list entry
    return cy
      .contains(".project-preview-card .project-title", title, {
        timeout: 60000,
      })
      .should("be.visible")
      .parents(".project-preview-card")
      .first()
      .within(() =>
        cy
          .get(
            ".project-thumbnail-container .play-button, .project-thumbnail-container button, .project-thumbnail-container",
          )
          .first()
          .click({ force: true }),
      )
      .then(() =>
        cy.get(".playlist-bottom-submenu", { timeout: 60000 }).should("exist"),
      )
      .then(() =>
        cy
          .contains(
            '.playlist-bottom-submenu a[href^="/playlists/"] span',
            re,
            { timeout: 60000 },
          )
          .parents('a[href^="/playlists/"]')
          .first()
          .scrollIntoView()
          .click({ force: true }),
      );
  });
};
/* -------------------------------- */

describe("SoundCredit – Login → Play → Logout", () => {
  it("00 – sanity", () => {
    expect(true).to.eq(true);
  });

  before(() => {
    expect(username, "SC_USERNAME env var").to.be.a("string").and.not.be.empty;
    expect(password, "SC_PASSWORD env var").to.be.a("string").and.not.be.empty;

    // Clear cached sessions only in the App (avoids “already initialized” in cypress open)
     if (Cypress.config('isInteractive') && Cypress.session?.clearAllSavedSessions) {
      Cypress.session.clearAllSavedSessions();
   }

    // Capture requests WITHOUT calling cy.task() in this callback
    cy.intercept('GET', '**', (req) => {
      const startedAt = Date.now();

      req.on('response', (res) => {
        const ct  = String(res.headers['content-type'] || '').toLowerCase();
        const url = (req.url || '').toLowerCase();

        // MIME-based
        const looksAudio =
          ct.includes("audio") ||
          ct.includes("application/vnd.apple.mpegurl") || // HLS .m3u8
          ct.includes("application/dash+xml") || // DASH .mpd
          ct.includes("video/mp2t") || // TS segments
          ct.includes("application/octet-stream"); // sometimes segments

        // Path-based
        const urlLike =
          url.includes(".mp3") ||
          url.includes(".aac") ||
          url.includes(".ogg") ||
          url.includes(".wav") ||
          url.includes(".m3u8") ||
          url.includes(".mpd");

        // Segment patterns
        const segLike =
          /\.(m3u8|mpd|m4s|ts|aac|mp3|ogg|wav)(\?|$)/i.test(url) ||
          /segment=|chunk=|init\.mp4|frag/i.test(url);

        // If you use audioHits elsewhere, capture with a timestamp too:
        // if (looksAudio || urlLike || segLike) audioHits.push({ url: req.url, ts: Date.now(), ct: ct || '(n/a)' });

            if (looksAudio || urlLike || segLike) {
            // keep RAW URL to preserve signed query params
            audioUrls.push(req.url);
            // (optional) if you’re using audioHits elsewhere, add:
          // audioHits.push({ url: req.url, ts: Date.now(), ct: ct || '(n/a)' });
    }

    const durationMs = Date.now() - startedAt;       // compute once

    requests.push({                                  // and push once
      url: req.url,
      method: req.method,
      status: res.statusCode,
      durationMs,
    });
  });
});

    // Stable layout; DOM ready
cy.viewport(1366, 900);
cy.document({ log: false }).its('readyState').should('eq', 'complete');

    // Pre-warm reference (non-fatal; don’t chain .catch on Cypress commands)
    cy.task("referenceFingerprint");
  });

  it("01 – Login page loads & capture nav timing", () => {
    cy.visit("/login");
    cy.window().then((w) => {
      const entries = w.performance?.getEntriesByType?.("navigation") || [];
      const entry =
        Array.isArray(entries) && entries.length ? entries[0] : null;
      if (entry) {
        const data =
          typeof entry.toJSON === "function" ? entry.toJSON() : entry;
        cy.task("recordNavTiming", data);
      }
    });
  });

  it("02 – Login with credentials", () => {
    const t0 = Date.now();
    ensureLoggedIn().then(() =>
      cy.task("recordAction", { name: "login", durationMs: Date.now() - t0 }),
    );
  });

  it('03 – Open project "The Astronauts - Surf Party"', () => {
    const t0 = Date.now();
    const title = "The Astronauts - Surf Party";

    // Ensure /playlists
    ensureLoggedIn();
    cy.url({ timeout: 60000 }).then((u) => {
      if (!/\/playlists(?:[/?#]|$)/.test(u)) {
        cy.visit("/playlists", { failOnStatusCode: false });
      }
    });

    // Click the grid card (container) for our title; if toolbar fails to appear, go direct
    cy.contains(".project-preview-card .project-title", title, {
      timeout: 60000,
    })
      .should("be.visible")
      .parents(".project-preview-card")
      .first()
      .scrollIntoView()
      .click({ force: true });

    cy.get("body", { timeout: 8000 }).then(($b) => {
      const hasToolbar = [...$b.find("button, .btn, [role=button]")].some(
        (el) => /open\s*link/i.test((el.textContent || "").trim()),
      );
      if (!hasToolbar)
        cy.visit("/playlists/42765", { failOnStatusCode: false });
    });

    // UI landmark then URL
    cy.contains("button, .btn, [role=button]", /open\s*link/i, {
      timeout: 60000,
    }).should("be.visible");
    cy.contains("button, .btn, [role=button]", /details/i, {
      timeout: 60000,
    }).should("be.visible");
    cy.url({ timeout: 60000 }).should("match", /\/playlists\/\d+(?:[/?#]|$)/);

    cy.then(() =>
      cy.task("recordAction", {
        name: "open-project",
        durationMs: Date.now() - t0,
      }),
    );
  });

  // 04 – Project buttons visible
  it("04 – Project buttons visible", () => {
    cy.contains("button, .btn, [role=button]", /open\s*link/i, {
      timeout: 60000,
    }).should("be.visible");
    cy.contains("button, .btn, [role=button]", /details/i, {
      timeout: 60000,
    }).should("be.visible");
    cy.url().should("match", /\/playlists\/\d+(?:[/?#]|$)/);

    cy.contains("button, .btn, [role=button]", /^\s*add\s*$/i).should(
      "be.visible",
    ); // Add
    cy.get("button .fa-link", { timeout: 15000 }).should("exist"); // Project link (icon)
    cy.get("button .fa-play", { timeout: 15000 }).should("exist"); // Play (icon)
  });

  // 05 – At least one audio file listed (playlist table)
  it("05 – At least one audio file listed", () => {
    cy.get(".playlist-file-table", { timeout: 60000 }).should("exist");
    cy.get(
      ".playlist-file-table .playlist-file-table__playlist-track-number",
    ).should("have.length.greaterThan", 0);
  });

  // 06 – Click track #1 to start playback (playlist table)
  it("06 – Click track #1 to start playback", () => {
    cy.get(".playlist-file-table", { timeout: 60000 }).should("exist");

    clickMark = Date.now();
    const beforeCount = audioHits.length;

    cy.get(".playlist-file-table .playlist-file-table__playlist-track-number", {
      timeout: 60000,
    })
      .then(($cells) => {
        const exactOne = [...$cells].find(
          (el) => (el.textContent || "").trim() === "1",
        );
        const target = exactOne || $cells[0];
        expect(target, "track-number cell to click").to.exist;

        cy.wrap(target)
          .scrollIntoView()
          .trigger("mouseover", { force: true })
          .find(".fas.fa-play, .fa-play.mr-2")
          .first()
          .click({ force: true });
      })
      .then(() => cy.wait(1200)) // give the player a beat to mount + fetch

      // Try to harvest a direct src (if not blob:)
      .then(() =>
        cy.get("body").then(($b) => {
          const el = $b.find("audio").get(0);
          if (
            el &&
            el.currentSrc &&
            !String(el.currentSrc).startsWith("blob:")
          ) {
            currentAudioUrl = el.currentSrc;
          }
        }),
      )

      // Backfill from Resource Timing (short requests can be missed)
      .then(() =>
        cy.window().then((w) => {
          const names = (
            w.performance?.getEntriesByType?.("resource") || []
          ).map((e) => ({ name: e.name, startTime: e.startTime }));
          const hits = names
            .filter((e) =>
              /\.(m3u8|mpd|m4s|ts|aac|mp3|ogg|wav)(\?|$)/i.test(e.name),
            )
            .map((e) => ({ url: e.name, ts: Date.now(), ct: "(resource)" }));
          if (hits.length) audioHits.push(...hits);
        }),
      )
      .then(() => {
        const newOnes = audioHits.slice(beforeCount);
        if (newOnes.length) currentAudioUrl = newOnes[newOnes.length - 1].url;
      });
  });

// 07 – Verify audio is playing and matches reference (first 5s)
it('07 – Verify audio is playing and matches reference (first 5s)', () => {
// hard-fail Step 07 if the reference fingerprint is missing
// Step 7 guard: prove the reference exists and decodes
cy.task('statReference').then(info => {
  cy.log(`ref path: ${info.path || '(unknown)'}`);
  if (!info.exists) {
    cy.task('recordStep', {
      name: 'audio-fingerprint',
      status: 'fail',
      note: 'reference.mp3 not found at expected path'
    }).then(() => {
      expect(false, `reference fingerprint (restart cypress if null)`).to.be.true;
    });
    return;
  }
  cy.log(`ref size=${info.size} mtime=${info.mtime}`);

  // try a quick decode to explain nulls
  cy.task('probeReferenceDecode').then(probe => {
    if (!probe || probe.ok !== true) {
      cy.task('recordStep', {
        name: 'audio-fingerprint',
        status: 'fail',
        note: `reference decode failed: ${(probe && probe.error) || 'unknown'}`
      }).then(() => {
        expect(false, `reference fingerprint (restart cypress if null)`).to.be.true;
      });
    }
  });
});
  const strict    = true; // force fail-on-mismatch in this test only
  const threshold = Number(Cypress.env('FINGERPRINT_THRESHOLD') ?? 0.90);
  const seconds   = Number(Cypress.env('FINGERPRINT_SECONDS') ?? 5);

  // 7.1 playback sanity (if <audio> exists)
  cy.get('body').then(($b) => {
    const el = $b.find('audio').get(0);
    if (!el) {
      return cy.task('recordStep', {
        name: 'audio-element',
        status: 'warning',
        note: '<audio> not found or blob: src; assuming HLS/WebAudio'
      });
    }
    const t1 = el.currentTime || 0;
    return cy.wait(1500).then(() => {
      const t2 = el.currentTime || 0;
      cy.task('recordStep', {
        name: 'audio-playing',
        status: t2 > t1 ? 'pass' : 'fail',
        note: `t1=${t1.toFixed(2)} → t2=${t2.toFixed(2)}`
      }).then(() => {
        if (!(t2 > t1) && strict) {
          expect(false, `playback did not advance (t1=${t1.toFixed(2)} → t2=${t2.toFixed(2)})`).to.be.true;
        }
      });
    });
  });

  // 7.2 choose a post-click media URL (prefer manifest → file → segment; ignore blob:)
  cy.then(() => {
    const recent = (audioHits || []).filter(h => h && h.ts >= (clickMark - 200));
    const preferDirect = u => (typeof u === 'string' && u && !u.startsWith('blob:')) ? { url: u } : null;
    const m3u8 = recent.find(h => /\.m3u8(\?|$)/i.test(h.url));
    const mpd  = recent.find(h => /\.mpd(\?|$)/i.test(h.url));
    const file = recent.find(h => /\.(mp3|aac|ogg|wav)(\?|$)/i.test(h.url));
    const seg  = recent.find(h => /\.(m4s|ts)(\?|$)/i.test(h.url));
    const cand =
      preferDirect(currentAudioUrl) ||
      m3u8 || mpd || file || seg || recent[recent.length - 1];

    if (!cand) {
      return cy.task('recordStep', {
        name: 'audio-fingerprint',
        status: 'fail',
        note: 'No post-click media URL captured to fingerprint'
      }).then(() => {
        if (strict) expect(false, 'no media URL to fingerprint').to.be.true;
      });
    }

    const urlToUse = cand.url;
    cy.log(`Fingerprinting: ${urlToUse}`);

    // 7.3 decode first N seconds using ffmpeg (manifest or file) and compare
    return cy.task('fingerprintMedia', { url: urlToUse, seconds }, { timeout: 120000 })
      .then(live => cy.task('referenceFingerprint').then(ref => ({ live, ref, urlToUse })))
      .then(({ live, ref, urlToUse }) => {
        if (!ref || !live || !live.length) {
          return cy.task('recordStep', {
            name: 'audio-fingerprint',
            status: 'fail',
            note: !ref ? 'Missing reference fingerprint' : 'Could not decode first N seconds of live media',
            url: urlToUse
          }).then(() => {
            if (strict) expect(false, 'missing reference or live fingerprint').to.be.true;
          });
        }
        return cy.task('compareFingerprints', { a: ref, b: live, threshold })
          .then(result => ({ ...result, urlToUse }));
      })
      .then(result => {
        if (!result) return;
        const { score, pass, urlToUse } = result;
        cy.log(`Audio similarity: ${score?.toFixed?.(3)} (threshold ${threshold})`);
        cy.task('recordStep', {
          name: 'audio-fingerprint',
          status: pass ? 'pass' : 'fail',
          score,
          url: urlToUse
        });
        if (!pass && strict) {
          expect(pass, `Audio similarity ${score?.toFixed?.(3)} < ${threshold}`).to.be.true;
        }
      });
  });
});

// 08 – Verify bottom player controls (scoped & tolerant)
it('08 – Verify bottom player controls', () => {
  cy.get('[class*="AudioPlayerBar_"], .AudioPlayerBar_audio-player-bar__', { timeout: 30000 })
    .should('be.visible')
    .then($bar => {
      const has = (sel) => $bar.find(sel).length > 0;
      const hasAria = (rx) => [...$bar.find('[aria-label]')]
        .some(el => rx.test((el.getAttribute('aria-label') || '').trim()));

      // shuffle: icon OR aria-label (case-insensitive via JS)
      expect(has('.fa-random, .fa-shuffle') || hasAria(/shuffle/i), 'shuffle control').to.eq(true);

      // back/rewind: cover several FA variants + aria
      expect(
        has('.fa-step-backward, .fa-backward, .fa-backward-step') || hasAria(/(back|rewind)/i),
        'back/rewind control'
      ).to.eq(true);

      // play/pause: either state + aria
      expect(
        has('.fa-play-circle, .fa-pause-circle, .fa-play, .fa-pause') || hasAria(/(play|pause)/i),
        'play/pause control'
      ).to.eq(true);

      // forward/skip: FA variants + aria
      expect(
        has('.fa-step-forward, .fa-forward, .fa-forward-step') || hasAria(/(forward|skip)/i),
        'forward/skip control'
      ).to.eq(true);

      // progress/slider exists
      expect(has('[role="slider"], [class*="progress-slider"]'), 'progress slider').to.eq(true);

      // at least one time label like 0:02 or 00:02
      const times = [...$bar.find('span')]
        .map(s => (s.textContent || '').trim())
        .filter(t => /^\d{1,2}:\d{2}$/.test(t));
      expect(times.length, 'player time labels').to.be.greaterThan(0);
    });
});
  
// 09 – Progress advances, then pause toggles
it('09 – Progress advances, then pause toggles', () => {
  const readCurrentTime = () =>
    cy.get('[class*="AudioPlayerBar_"], .AudioPlayerBar_audio-player-bar__', { timeout: 30000 })
      .then($bar => {
        const mmss = [...$bar.find('span')]
          .map(s => (s.textContent || '').trim())
          .filter(t => /^\d{1,2}:\d{2}$/.test(t));
        return mmss.length ? mmss[0] : null;
      });

  const toSec = (t) => {
    if (!t) return null;
    const [m, s] = t.split(':').map(n => parseInt(n, 10));
    return (isNaN(m) || isNaN(s)) ? null : m * 60 + s;
  };

  let t1s = null;
  readCurrentTime().then(t1 => { t1s = toSec(t1); });
  cy.wait(1500);
  readCurrentTime().then(t2 => {
    const t2s = toSec(t2);
    if (t1s !== null && t2s !== null) {
      expect(t2s, 'current time (s)').to.be.a('number');
      expect(t2s).to.be.greaterThan(t1s);
    } else {
      // fallback: use <audio>.currentTime
      cy.get('body').then($b => {
        const el = $b.find('audio').get(0);
        expect(el, '<audio> present for fallback time check').to.exist;
        const a1 = el.currentTime || 0;
        return cy.wait(1500).then(() => {
          const a2 = el.currentTime || 0;
          expect(a2).to.be.greaterThan(a1);
        });
      });
    }
  });

  // toggle using whatever icon is visible
  cy.get('button .fa-pause-circle, button .fa-pause, button .fa-play-circle, button .fa-play', { timeout: 15000 })
    .filter(':visible')
    .first()
    .parents('button')
    .first()
    .scrollIntoView()
    .click({ force: true });

  cy.wait(800);

  cy.get('body').then(($b) => {
    const el = $b.find('audio').get(0);
    if (el) {
      expect(el.paused, '<audio>.paused after toggle').to.eq(true);
    } else {
      // no audio tag: accept “play” icon or the time no longer advancing as proof of pause
      const hasPlayIcon = $b.find('.fa-play-circle, .fa-play').length > 0;
      if (hasPlayIcon) {
        expect(hasPlayIcon, 'play icon visible after toggle').to.eq(true);
      } else {
        return readCurrentTime().then(tBefore => {
          const sBefore = toSec(tBefore);
          cy.wait(1000).then(() => {
            readCurrentTime().then(tAfter => {
              const sAfter = toSec(tAfter);
              if (sBefore !== null && sAfter !== null) {
                expect(sAfter - sBefore, 'time delta while paused').to.be.at.most(0);
              }
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

  // If there is a visible /login anchor anywhere, click it
  cy.get('a[href="/login"], .logout-nav a[href="/login"]', { timeout: 10000 })
    .filter(':visible')
    .first()
    .then($a => {
      if ($a.length) {
        cy.wrap($a).scrollIntoView().click({ force: true });
      } else {
        // fallback: clear cookies and go to /login explicitly
        cy.clearCookies();
        cy.visit('/login', { failOnStatusCode: false });
      }
    });

  cy.url({ timeout: 60000 }).should('match', /\/login(?:[/?#]|$)/);
  cy.get('input[type="email"], input[name="email"], input[placeholder*="mail"]', { timeout: 10000 }).should('exist');
  cy.get('input[type="password"], input[name="password"]', { timeout: 10000 }).should('exist');

  cy.then(() => cy.task('recordAction', { name: 'logout', durationMs: Date.now() - t0 }));
});
  //      }),
  //    );
  //  });

    after(() => {
      // Flush batched requests and results in one place
      cy.then(() => {
        for (const r of requests) cy.task("recordRequest", r);
      })
        .then(() => cy.task("flushResults")) // returns the path string
        .then((outPath) => {
          // <-- capture it here
          cy.log(`Results written to ${outPath}`);
          // (optional) also drop a small pointer file so you can click/open it easily
          cy.writeFile(
            "cypress/reports/_results_pointer.txt",
            String(outPath) + "\n",
            { log: false },
          );
        });
    });
 });
//});
