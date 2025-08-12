@@
 export function registerResultsTasks(on, config) {
   on('task', {
     recordStep(p) { state.steps.push(p); return null; },
     recordAction(p) { state.actions.push(p); return null; },
     recordNavTiming(p) { state.navTimings.push(p); return null; },
     recordRequest(p) { state.requests.push(p); return null; },
+    recordRequestsBatch(items) { if (Array.isArray(items)) state.requests.push(...items); return null; },
     flushResults() {
       const out = path.join(outDir(config.projectRoot), 'cypress', 'reports', 'results.json');
       fs.writeFileSync(out, JSON.stringify(state, null, 2));
       return out;
     }
   });
 }
