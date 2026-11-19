// The hub's thin door to the setup checks and the "test your setup" list
// (their own screens: /setup-health, /setup-test). The hub reads their state
// from the plan (Plan.setup) and only ever asks them to run a test; while
// that feature is not installed here, "Test it" opens its screen instead.
import { SETUP_LINKS } from '../../../shared/src/onboarding';
import { ApiFailure, post } from './api';
import { navigate } from './router';

/** Runs one test where the setup feature can; otherwise takes the person to its screen. Returns whether it ran here. */
export async function runSetupTest(id: string): Promise<boolean> {
  try {
    await post(SETUP_LINKS.run(id));
    return true;
  } catch (e) {
    if (e instanceof ApiFailure && (e.status === 404 || e.status === 405)) {
      navigate(SETUP_LINKS.tests);
      return false;
    }
    throw e;
  }
}
