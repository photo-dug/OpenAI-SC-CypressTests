// cypress.config.cjs
const { defineConfig } = require('cypress');
const reporterPlugin = require('cypress-mochawesome-reporter/plugin');
const { registerAudioTasks } = require('./tasks/audio-fingerprint.cjs');
const { registerResultsTasks } = require('./tasks/results-writer.cjs');

module.exports = defineConfig({
  // ... your reporterOptions + env as you already have ...
  e2e: {
    baseUrl: 'https://portal.soundcredit.com',
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 120000,
    testIsolation: false,
    setupNodeEvents(on, config) {
      try {
        reporterPlugin(on);                 // ✅ just the reporter
        registerAudioTasks(on, config);     // ✅ your audio tasks
        registerResultsTasks(on, config);   // ✅ your results-writer tasks
        return config;
      } catch (e) {
        console.error('[setupNodeEvents] crashed:', e && e.stack ? e.stack : e);
        throw e; // let Cypress show the real stack
      }
    },
  },
});
