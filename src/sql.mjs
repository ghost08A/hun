// D1 statements are built as strings, so every text value goes through here.
export function sqlText(value) {
  const s = String(value);
  if (/[\u0000-\u001f]/.test(s)) throw new Error('Control characters are not allowed in text values');
  return `'${s.replaceAll("'", "''")}'`;
}
