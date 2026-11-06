// LINE webhook (POST /line/webhook). Security model: the request must carry a valid signature made with the
// channel secret, and only messages from the owner's LINE user id are acted on. Anyone else is ignored silently.
import { replyText } from './line.mjs';
import { runChatCommand } from './chat.mjs';

const enc = new TextEncoder();

export async function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(rawBody)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0; // constant-time comparison
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// deps.runCommand and deps.reply exist so tests can replace them.
export async function handleWebhook(request, env, ctx, { db, fetchFn = fetch, log = console.log, runCommand = runChatCommand, reply = replyText } = {}) {
  if (!env.LINE_CHANNEL_SECRET) return new Response('webhook not configured', { status: 503 });
  const raw = await request.text();
  if (!(await verifySignature(raw, request.headers.get('x-line-signature'), env.LINE_CHANNEL_SECRET))) {
    return new Response('bad signature', { status: 401 });
  }
  let body;
  try { body = JSON.parse(raw); } catch { return new Response('bad request', { status: 400 }); }

  for (const event of body.events ?? []) {
    if (event.type !== 'message' || event.message?.type !== 'text' || !event.replyToken) continue;
    if (!env.LINE_USER_ID || event.source?.userId !== env.LINE_USER_ID) {
      log('ignored a message from someone other than the owner');
      continue;
    }
    // Answer LINE at once; do the work after the response so slow commands cannot time the webhook out.
    ctx.waitUntil((async () => {
      let text;
      try {
        text = await runCommand({ text: event.message.text, db, env, fetchFn });
      } catch (e) {
        text = `⚠️ ${e.message}`;
      }
      try {
        await reply({ token: env.LINE_CHANNEL_ACCESS_TOKEN, replyToken: event.replyToken, text, fetchFn });
      } catch (e) {
        log(`reply failed: ${e.message}`);
      }
    })());
  }
  return new Response('OK', { status: 200 });
}
