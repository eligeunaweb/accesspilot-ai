// TEST ONLY. The production code never reads this environment variable.
// Used when the execution host already isolates Chromium but cannot nest its sandbox.
import { chromium } from 'playwright';
if(process.env.ACCESSPILOT_TEST_OUTER_SANDBOX==='1') {
  const launch=chromium.launch.bind(chromium);
  chromium.launch=options=>launch({...options,chromiumSandbox:false});
}
