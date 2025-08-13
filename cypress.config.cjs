// cypress.config.cjs
const { defineConfig } = require('cypress');
// NOTE: don't call the plugin's built-in merge hook; we'll do a guarded merge ourselves.

module.exports = defineConfig({
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    reportDir: 'cypress/reports',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveJson: true, // writes JSONs into cypress/reports/.jsons
  },
  env: {
    FINGERPRINT_STRICT: process.env.FINGERPRINT_STRICT === 'true',
    SKIP_AUDIO: process.env.SKIP_AUDIO === 'true',
  },
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

    setupNodeEvents(on, config) {
      // Guarded merge: only generate HTML if JSON files actually exist.
      on('after:run', async () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const merge = require('mochawesome-merge');
        const generator = require('mochawesome-report-generator');

        const jsonsDir = path.join(config.projectRoot, 'cypress', 'reports', '.jsons');
        const outDir = path.join(config.projectRoot, 'cypress', 'reports');

        if (!fs.existsSync(jsonsDir)) return;
        const hasJson = fs.readdirSync(jsonsDir).some(f => f.endsWith('.json'));
        if (!hasJson) return;

        const reportJson = await merge({ files: [path.join(jsonsDir, '*.json')] });
        await generator.create(reportJson, {
          reportDir: outDir,
          inline: true,
          overwrite: true,
          reportFilename: 'mochawesome',
        });
      });

      return config;
    },
  },
});
