import { googleKeys } from './firebaseToken';
import { handle, type Env } from './handler';

// The Cloudflare Worker's entry point (setup: docs/calendar-helper-setup.md).
// The Firebase key cache lives as long as this Worker instance.

const now = () => Date.now();
const keyFor = googleKeys((input, init) => fetch(input, init), now);

export default {
  fetch: (req: Request, env: Env) => handle(req, env, { fetch: (input, init) => fetch(input, init), keyFor, now }),
};
