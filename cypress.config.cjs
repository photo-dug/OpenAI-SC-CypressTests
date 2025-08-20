const { defineConfig } = require('cypress');

module.exports = defineConfig({
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    reportDir: 'cypress/reports',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveJson: true
  },
  env: {
    FINGERPRINT_STRICT: process.env.FINGERPRINT_STRICT === 'true',
    SKIP_AUDIO: process.env.SKIP_AUDIO === 'true'
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
    specPattern: 'cypress/e2e/**/*.cy.{js,jsx,ts,tsx}',
    setupNodeEvents(on, config) {
      // Guarded merge: only generate HTML if JSON files actually exist
      on('after:run', async () => {
        const fs = require('node:fs');
        const path = require('node:path');
      //- const merge = require('mochawesome-merge');
      //- const generator = require('mochawesome-report-generator');
        const mm = require('mochawesome-merge');
        const merge = (mm && (mm.merge || mm.default || mm));
        const generator = require('mochawesome-report-generator');
        const jsonsDir = path.join(config.projectRoot, 'cypress', 'reports', '.jsons');
        const outDir = path.join(config.projectRoot, 'cypress', 'reports');

// bail out if merge isn’t a function (version mismatch)
  if (typeof merge !== 'function') {
    console.warn('mochawesome-merge not a function; skipping HTML merge.');
    return;
  }

  try {
    const reportJson = await merge({ files: [path.join(jsonsDir, '*.json')] });
    await generator.create(reportJson, {
      reportDir: outDir,
      inline: true,
      overwrite: true,
      reportFilename: 'mochawesome',
    });
  } catch (e) {
    console.warn('Skipping HTML merge:', e && e.message ? e.message : e);
  }
});
      // keep other node tasks you already registered elsewhere
      return config;
    }
  }
});
