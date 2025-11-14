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
    // Credentials (available via Cypress.env('SC_USERNAME'|'SC_PASSWORD'))
      SC_USERNAME: process.env.CYPRESS_SC_USERNAME ?? process.env.SC_USERNAME ?? '',
      SC_PASSWORD: process.env.CYPRESS_SC_PASSWORD ?? process.env.SC_PASSWORD ?? '',
      REF_VERSION: process.env.CYPRESS_REF_VERSION ?? process.env.REF_VERSION ?? '1',

    // strictness: fail test 7 on mismatch when true
    FINGERPRINT_STRICT:
      (process.env.CYPRESS_FINGERPRINT_STRICT ?? process.env.FINGERPRINT_STRICT) === 'true',
  
    // skip toggle (kept for completeness; your step 7 now forces strict anyway)
    SKIP_AUDIO: (process.env.CYPRESS_SKIP_AUDIO ?? process.env.SKIP_AUDIO ?? 'false'),

    // 🔽 add these convenience envs
    FINGERPRINT_SECONDS: process.env.CYPRESS_FINGERPRINT_SECONDS ?? process.env.FINGERPRINT_SECONDS ?? '5',
    FINGERPRINT_THRESHOLD: process.env.CYPRESS_FINGERPRINT_THRESHOLD ?? process.env.FINGERPRINT_THRESHOLD ?? '0.90',

  // cache-buster for reference.mp3 in the plugin process
  REF_VERSION: process.env.CYPRESS_REF_VERSION ?? process.env.REF_VERSION ?? '1',
},

  e2e: {
    baseUrl: 'https://portal.soundcredit.com',
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 120000,
    testIsolation: false,
    setupNodeEvents(on, config) {
      registerReporter(on, config);
      registerAudioTasks(on, config);   // <-- must be present
      registerResultsTasks(on, config);
    return config;
    },
  },
});
