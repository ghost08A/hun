// Cloudflare Worker entry: the two daily cron triggers (SPEC section 2) and one HTTP route for LINE chat
// commands. Everything else answers 404.
import { bindingDb } from './d1db.mjs';
import { dailyJob } from './daily.mjs';
import { handleWebhook } from './webhook.mjs';

const FINAL_CRON = '0 13 * * *'; // 20:00 Asia/Bangkok; the first trigger (0 12 * * *) is 19:00

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/line/webhook') {
      return handleWebhook(request, env, ctx, { db: bindingDb(env.DB) });
    }
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
