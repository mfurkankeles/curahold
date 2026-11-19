// The hub's thin door to the setup checks and the "test your setup" list
// (their own screens: /setup-health, /setup-test). The hub reads their state
// from the plan (Plan.setup) and only ever asks them to run a test. A step the
// server can run (a test ticket, a sync) runs from here; a step that needs a
// person's own verdict (inviting a colleague, the portal) opens its place in
// the test list instead.
import { SETUP_LINKS } from '../../../shared/src/onboarding';
import { testStepDef } from '../../../shared/src/setupHealth';
import { post } from './api';
import { navigate } from './router';

/** Runs one test where the server can; otherwise takes the person to that step. Returns whether it ran here. */
export async function runSetupTest(id: string): Promise<boolean> {
  if (!testStepDef(id)?.auto) {
    navigate(`${SETUP_LINKS.tests}#${encodeURIComponent(id)}`);
    return false;
  }
  await post(SETUP_LINKS.run(id));
  return true;
}
