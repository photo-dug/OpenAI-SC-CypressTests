import * as fs from 'node:fs';
import * as path from 'node:path';

const state = { steps: [], actions: [], navTimings: [], requests: [] };

function outDir(root) {
  const dir = path.join(root, 'cypress', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function registerResultsTasks(on, config) {
  on('task', {
    recordStep(p) { state.steps.push(p); return null; },
    recordAction(p) { state.actions.push(p); return null; },
    recordNavTiming(p) { state.navTimings.push(p); return null; },
    recordRequest(p) { state.requests.push(p); return null; },
    flushResults() {
      const out = path.join(outDir(config.projectRoot), 'results.json');
      fs.writeFileSync(out, JSON.stringify(state, null, 2));
      return out;
    }
  });
}
