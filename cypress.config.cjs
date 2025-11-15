// cypress.config.cjs
const { defineConfig } = require('cypress');
const reporterPlugin = require('cypress-mochawesome-reporter/plugin');
const { registerAudioTasks } = require('./tasks/audio-fingerprint.cjs');
const { registerResultsTasks } = require('./tasks/results-writer.cjs');

module.exports = defineConfig({
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    reportDir: 'cypress/reports',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveJson: true,
  },

  env: {
    // credentials (either SC_* or CYPRESS_SC_* will work)
    SC_USERNAME: process.env.CYPRESS_SC_USERNAME ?? process.env.SC_USERNAME ?? '',
    SC_PASSWORD: process.env.CYPRESS_SC_PASSWORD ?? process.env.SC_PASSWORD ?? '',

    // audio fingerprint knobs
    FINGERPRINT_STRICT:
      (process.env.CYPRESS_FINGERPRINT_STRICT ?? process.env.FINGERPRINT_STRICT) === 'true',
    FINGERPRINT_SECONDS:
      process.env.CYPRESS_FINGERPRINT_SECONDS ?? process.env.FINGERPRINT_SECONDS ?? '5',
    FINGERPRINT_THRESHOLD:
      process.env.CYPRESS_FINGERPRINT_THRESHOLD ?? process.env.FINGERPRINT_THRESHOLD ?? '0.90',

    // cache-buster for reference.mp3 (used by referenceFingerprintTask)
    REF_VERSION: process.env.CYPRESS_REF_VERSION ?? process.env.REF_VERSION ?? '1',

    // legacy toggle (kept for completeness)
    SKIP_AUDIO: process.env.CYPRESS_SKIP_AUDIO ?? process.env.SKIP_AUDIO ?? 'false',
  }, // ← keep this comma

  e2e: {
    baseUrl: 'https://portal.soundcredit.com',
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 120000,
    testIsolation: false,

    setupNodeEvents(on, config) {
      // wire mochawesome
      reporterPlugin(on);

      // register our tasks
      registerAudioTasks(on, config);      // statReference, probeReferenceDecode, probeLiveDecode,
                                           // referenceFingerprint, fingerprintMedia/fingerprintAudioFromUrl,
                                           // compareFingerprints
      registerResultsTasks(on, config);    // recordStep/Action/NavTiming/Request + flushResults

      return config;
    },
  },
});
