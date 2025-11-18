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
    saveJson: true
  },
  env: {
    SC_USERNAME: process.env.CYPRESS_SC_USERNAME ?? process.env.SC_USERNAME ?? '',
    SC_PASSWORD: process.env.CYPRESS_SC_PASSWORD ?? process.env.SC_PASSWORD ?? '',
    FINGERPRINT_STRICT:
      (process.env.CYPRESS_FINGERPRINT_STRICT ?? process.env.FINGERPRINT_STRICT) === 'true',
    FINGERPRINT_SECONDS:
      process.env.CYPRESS_FINGERPRINT_SECONDS ?? process.env.FINGERPRINT_SECONDS ?? '5',
    FINGERPRINT_THRESHOLD:
      process.env.CYPRESS_FINGERPRINT_THRESHOLD ?? process.env.FINGERPRINT_THRESHOLD ?? '0.90',
    REF_VERSION: process.env.CYPRESS_REF_VERSION ?? process.env.REF_VERSION ?? '1',
    SKIP_AUDIO: process.env.CYPRESS_SKIP_AUDIO ?? process.env.SKIP_AUDIO ?? 'false'
  },
  e2e: {
    baseUrl: 'https://portal.soundcredit.com',
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 120000,
    testIsolation: false,
    setupNodeEvents(on, config) {
      try {
        // reporter must be first
        reporterPlugin(on);

        // our tasks (comment these two lines temporarily to bisect)
        registerAudioTasks(on, config);
        registerResultsTasks(on, config);
      } catch (e) {
        // print clearly in the Cypress App and CI logs
        console.error('[setupNodeEvents] crash:', e && e.stack ? e.stack : e);
        throw e;
      }
      return config;
    }
  }
});
