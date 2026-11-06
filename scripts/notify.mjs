// Usage: npm run notify [-- --remote]     send Pending/Failed alerts through LINE
//        npm run line-test                 send one test message to the owner (FR-18)
// Needs LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID in .dev.vars. Real messages go to your LINE account.
import { loadEnv, cliDb } from './lib.mjs';
import { sendPending } from '../src/notifier.mjs';
import { pushText, testText } from '../src/line.mjs';

const argv = process.argv.slice(2);
const cmd = argv.find((a) => !a.startsWith('--')) ?? 'send';
const remote = argv.includes('--remote');
const env = loadEnv();
const token = env.LINE_CHANNEL_ACCESS_TOKEN;
const userId = env.LINE_USER_ID;

async function main() {
  if (!token || !userId) throw new Error('LINE_CHANNEL_ACCESS_TOKEN and LINE_USER_ID must be set in .dev.vars');
  if (cmd === 'test') {
    const r = await pushText({ token, userId, text: testText(), retryKey: crypto.randomUUID() });
    console.log(`Test message sent${r.messageId ? ` (id ${r.messageId})` : ''}. Check your LINE.`);
  } else if (cmd === 'send') {
    const r = await sendPending({ db: cliDb(remote), token, userId });
    console.log(`\n[${remote ? 'REMOTE' : 'local'}] sent=${r.sent} failed=${r.failed}`);
    if (r.failed) process.exitCode = 1;
  } else {
    throw new Error(`Unknown command "${cmd}". Use: send | test`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
