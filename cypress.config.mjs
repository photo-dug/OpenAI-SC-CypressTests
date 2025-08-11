import { defineConfig } from 'cypress';
import registerReporter from 'cypress-mochawesome-reporter/plugin.js';
import { registerAudioTasks } from './tasks/audio-fingerprint.js';
import { registerResultsTasks } from './tasks/results-writer.js';

export default defineConfig({
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    reportPageTitle: 'SoundCredit E2E',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveJson: true
  },
  env: {
    FINGERPRINT_STRICT: process.env.FINGERPRINT_STRICT === 'true'
  },
  e2e: {
    baseUrl: 'https://portal.soundcredit.com',
    video: true,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 15000,
    pageLoadTimeout: 60000,
    testIsolation: false,
    setupNodeEvents(on, config) {
      registerReporter(on);
      registerAudioTasks(on, config);
      registerResultsTasks(on, config);
      return config;
    }
  }
});
