// Prints a new VAPID key pair for Web Push to the owner's phones
// (api/src/lib/webpush.ts): the two values for VAPID_PUBLIC_KEY and
// VAPID_PRIVATE_KEY (docs/ENVIRONMENT.md). Free and made once; the private key
// is a secret (wrangler secret put VAPID_PRIVATE_KEY). Changing the pair later
// means every phone has to be added again.
//
//   npx tsx scripts/plan/vapid-keys.ts
import { newVapidKeys, vapidValid } from '../../api/src/lib/webpush';

const keys = await newVapidKeys();
if (!(await vapidValid(keys))) throw new Error('the new key pair did not verify');
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
