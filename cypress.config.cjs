// cypress.config.cjs
const { defineConfig } = require('cypress');
// ❌ do NOT call the plugin's after:run to avoid hard crash
// const mochawesomePlugin = require('cypress-mochawesome-reporter/plugin');

module.exports = defineConfig({
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    reportDir: 'cypress/reports',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveJson: true, // puts per-spec JSONs in cypress/reports/.jsons
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
      // Instead of using the plugin's after:run (which throws on empty), do a guarded merge.
      on('after:run', async () => {
        const fs = require('node:fs');
        const path = require('node:path');
        const merge = require('mochawesome-merge');
        const generator = require('mochawesome-report-generator');

        const jsonsDir = path.join(config.projectRoot, 'cypress', 'reports', '.jsons');
        const outDir = path.join(config.projectRoot, 'cypress', 'reports');

        if (!fs.existsSync(jsonsDir)) return; // nothing to merge
        const hasJson = fs.readdirSync(jsonsDir).some(f => f.endsWith('.json'));
        if (!hasJson) return; // nothing to merge

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
