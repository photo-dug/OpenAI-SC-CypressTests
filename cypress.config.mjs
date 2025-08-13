import { defineConfig } from 'cypress';
import registerReporter from 'cypress-mochawesome-reporter/plugin.js';
import { registerAudioTasks } from './tasks/audio-fingerprint.js';
import { registerResultsTasks } from './tasks/results-writer.js';

export default defineConfig({
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    reportDir: 'cypress/reports',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveJson: true
  },
  e2e: {
    video: true,
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
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
