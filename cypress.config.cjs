// cypress.config.cjs
const { defineConfig } = require('cypress');
const mm = require('mochawesome-merge');                 // robust import
const merge = (mm && (mm.merge || mm.default || mm));    // handle different exports
const generator = require('mochawesome-report-generator');
const { registerAudioTasks } = require('./tasks/audio-fingerprint.cjs');
const { registerResultsTasks } = require('./tasks/results-writer.cjs');

module.exports = defineConfig({
  projectId: 'gao7ec',
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    reportDir: 'cypress/reports',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveJson: true
  },
  env: {
    // Make secrets available to Cypress.env() whether you pass SC_* or CYPRESS_SC_* in the workflow
    SC_USERNAME: process.env.SC_USERNAME || process.env.CYPRESS_SC_USERNAME || '',
    SC_PASSWORD: process.env.SC_PASSWORD || process.env.CYPRESS_SC_PASSWORD || '',
    FINGERPRINT_STRICT: process.env.FINGERPRINT_STRICT === 'true',
    FINGERPRINT_STRICT: process.env.FINGERPRINT_STRICT === 'true',
    // accept both SKIP_AUDIO and CYPRESS_SKIP_AUDIO
    SKIP_AUDIO:(process.env.CYPRESS_SKIP_AUDIO ?? process.env.SKIP_AUDIO ?? 'false'),
},

  }),
  e2e: {
    baseUrl: 'https://portal.soundcredit.com',
    video: true,
    screenshotsFolder: 'cypress/screenshots',
    videosFolder: 'cypress/videos',
    defaultCommandTimeout: 20000,
    pageLoadTimeout: 120000,
    testIsolation: false,
    chromeWebSecurity: false,
    retries: { runMode: 2, openMode: 0 },
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',

    setupNodeEvents(on, config) {
      // Guarded mochawesome merge: generate HTML only if JSONs exist
      on('after:run', async () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const jsonsDir = path.join(config.projectRoot, 'cypress', 'reports', '.jsons');
        const outDir = path.join(config.projectRoot, 'cypress', 'reports');

        if (!fs.existsSync(jsonsDir)) return;
        const hasJson = fs.readdirSync(jsonsDir).some(f => f.endsWith('.json'));
        if (!hasJson || typeof merge !== 'function') return;

        try {
          const reportJson = await merge({ files: [path.join(jsonsDir, '*.json')] });
          await generator.create(reportJson, {
            reportDir: outDir,
            inline: true,
            overwrite: true,
            reportFilename: 'mochawesome'
          });
        } catch (e) {
          console.warn('Skipping HTML merge:', e && e.message ? e.message : e);
        }
      });

      // ✅ Register tasks so cy.task(...) works
      registerAudioTasks(on, config);
      registerResultsTasks(on, config);

      return config;
    }
  }
});
