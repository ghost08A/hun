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

// row: asset + alert + reference fields (see scripts/notifier.mjs). Thai text, ISO dates.
export function alertText(row) {
  const target = row.ReferencePrice * (1 - row.Threshold / 100);
  const lines = [
    `🔔 ${row.Symbol} (${row.Name})`,
    `ราคาปิด ${n2(row.TriggerPrice)} ${row.Currency}${row.PriceDate ? ` (${row.PriceDate})` : ''} ลดลง ${n2(row.DropPercent)}% จากราคาอ้างอิงเดือนนี้`,
    `ราคาอ้างอิง ${n2(row.ReferencePrice)} (${row.ReferenceDate})${row.ReferenceBackfilled ? ' – ย้อนหาจากต้นเดือน' : ''}`,
    `เกณฑ์ ${row.Threshold}% · ราคาเป้าหมาย ${n2(target)}`,
  ];
  return lines.join('\n');
}

export const testText = () => '✅ ทดสอบการเชื่อมต่อ LINE สำเร็จ (Price Alert)';
