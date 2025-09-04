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

    // Strictness toggle (warn by default)
    FINGERPRINT_STRICT:
      (process.env.CYPRESS_FINGERPRINT_STRICT ?? process.env.FINGERPRINT_STRICT) === 'true',

    // Audio skip toggle
    SKIP_AUDIO: (process.env.CYPRESS_SKIP_AUDIO ?? process.env.SKIP_AUDIO ?? 'false'),
  }, // <-- keep this comma

  e2e: {
    baseUrl: 'https://portal.soundcredit.com',
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 120000,
    testIsolation: false,
    setupNodeEvents(on, config) {
      reporterPlugin(on);
      registerAudioTasks(on, config);
      registerResultsTasks(on, config);
      return config;
    },
  },
});
