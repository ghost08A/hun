// Cloudflare Worker entry: no HTTP endpoints, only the two daily cron triggers (SPEC section 2).
import { bindingDb } from './d1db.mjs';
import { dailyJob } from './daily.mjs';

const FINAL_CRON = '0 13 * * *'; // 20:00 Asia/Bangkok; the first trigger (0 12 * * *) is 19:00

export default {
  // No public endpoints (SPEC section 2); answer politely instead of showing a platform error page.
  async fetch() {
    return new Response('price-alert: no public endpoints', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      dailyJob({
        db: bindingDb(env.DB),
        env,
        label: event.cron,
        isFinalRun: event.cron === FINAL_CRON,
      }),
    );
  },
};
