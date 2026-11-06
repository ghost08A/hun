// LINE Messaging API client (SPEC sections 2 and 4: BR-08). No Node-only APIs, so the Worker can reuse it.
// Assumptions to verify live: push returns 200 with {sentMessages:[{id}]}; X-Line-Retry-Key makes a retried
// push idempotent (a duplicate key answers 409 with the already-accepted request id).

export const PUSH_URL = 'https://api.line.me/v2/bot/message/push';

export class LineError extends Error {
  constructor(message, { status, retryable }) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export async function pushText({ token, userId, text, retryKey, fetchFn = fetch }) {
  let res;
  try {
    res = await fetchFn(PUSH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Line-Retry-Key': retryKey },
      body: JSON.stringify({ to: userId, messages: [{ type: 'text', text }] }),
    });
  } catch (e) {
    throw new LineError(`network error: ${e.message}`, { retryable: true });
  }
  const header = (name) => res.headers?.get?.(name) ?? null;
  if (res.status === 200) {
    let id = null;
    try { id = (await res.json()).sentMessages?.[0]?.id ?? null; } catch { /* body is optional */ }
    return { messageId: id ?? header('x-line-request-id') };
  }
  // Same retry key already accepted: the earlier attempt did deliver, so this is a success, not a duplicate.
  if (res.status === 409) return { messageId: header('x-line-accepted-request-id') };
  let detail = '';
  try { detail = (await res.json()).message ?? ''; } catch { /* no body */ }
  throw new LineError(`LINE ${res.status}${detail ? `: ${detail}` : ''}`, {
    status: res.status,
    retryable: res.status === 429 || res.status >= 500,
  });
}

// Bounded retry (BR-08): up to maxAttempts, retrySeconds apart, only for errors that can clear up.
export async function deliver({ send, maxAttempts = 3, retrySeconds = 60, sleep }) {
  let lastError;
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts++;
    try {
      const { messageId } = await send(attempts);
      return { status: 'Sent', messageId, attempts };
    } catch (e) {
      lastError = e;
      if (!(e instanceof LineError) || !e.retryable || attempts === maxAttempts) break;
      await sleep(retrySeconds * 1000);
    }
  }
  return { status: 'Failed', error: String(lastError?.message ?? lastError), attempts };
}

const n2 = (x) => Number(x).toFixed(2);

// row: asset + alert + reference fields (see src/notifier.mjs). Thai text, ISO dates.
// Layout answers three questions in order: what was the starting price, what rate triggers, where is it now.
export function alertText(row) {
  const target = row.ReferencePrice * (1 - row.Threshold / 100);
  const cur = row.Currency;
  const lines = [
    `🔔 ${row.Symbol} (${row.Name}) ราคาลดถึงเกณฑ์แล้ว`,
    '',
    `ราคาตั้งต้น (ปิด ${row.ReferenceDate}): ${n2(row.ReferencePrice)} ${cur}${row.ReferenceBackfilled ? ' *ย้อนหาจากต้นเดือน' : ''}`,
    `เกณฑ์แจ้งเตือน: ลด ${row.Threshold}% → ที่ราคา ${n2(target)} ${cur}`,
    '',
    `ราคาปิดล่าสุด${row.PriceDate ? ` (${row.PriceDate})` : ''}: ${n2(row.TriggerPrice)} ${cur}`,
    `ลดลงจากราคาตั้งต้น ${n2(row.DropPercent)}%`,
  ];
  return lines.join('\n');
}

export const testText = () => '✅ ทดสอบการเชื่อมต่อ LINE สำเร็จ (Price Alert)';

export const REPLY_URL = 'https://api.line.me/v2/bot/message/reply';

// Reply to a chat message. Replies do not count toward the monthly push quota. The reply token expires
// after about a minute, so call this soon after the event arrives.
export async function replyText({ token, replyToken, text, fetchFn = fetch }) {
  const res = await fetchFn(REPLY_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4900) }] }),
  });
  if (res.status !== 200) {
    let detail = '';
    try { detail = (await res.json()).message ?? ''; } catch { /* no body */ }
    throw new LineError(`LINE reply ${res.status}${detail ? `: ${detail}` : ''}`, { status: res.status, retryable: false });
  }
}
