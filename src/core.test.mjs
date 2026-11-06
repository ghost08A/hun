import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSymbol, parseThreshold, sqlText, checkQuote, assetTypeFrom,
  addSql, removeSql, updateSql, targetPrice, dropPercent,
} from './core.mjs';

test('symbol is uppercased and strictly validated', () => {
  assert.equal(parseSymbol(' brk.b '), 'BRK.B');
  for (const bad of ['', "AAPL'; DROP TABLE Assets;--", '1ABC', 'TOOLONGSYMBOL1']) {
    assert.throws(() => parseSymbol(bad));
  }
});

test('threshold must be in (0, 100)', () => {
  assert.equal(parseThreshold('7.5'), 7.5);
  for (const bad of ['0', '100', '-1', 'abc', '']) assert.throws(() => parseThreshold(bad));
});

test('sqlText escapes quotes and rejects control characters', () => {
  assert.equal(sqlText("O'Reilly"), "'O''Reilly'");
  assert.throws(() => sqlText('a\nb'));
});

test('only NYSE/NASDAQ/Arca quotes are accepted', () => {
  const ok = { name: 'Apple Inc', exchange: 'NASDAQ', mic_code: 'XNAS', currency: 'USD' };
  assert.equal(checkQuote(ok, 'AAPL').exchange, 'XNAS');
  assert.equal(checkQuote({ ...ok, mic_code: 'XNGS' }, 'AAPL').exchange, 'XNGS');
  assert.throws(() => checkQuote({ ...ok, mic_code: 'XBKK', exchange: 'SET' }, 'PTT'), /only NYSE/);
  assert.throws(() => checkQuote({ status: 'error', message: 'not found' }, 'ZZZZ'), /not found/);
});

test('asset type: flag wins, otherwise hint, otherwise Stock', () => {
  assert.equal(assetTypeFrom({ flag: 'ETF' }), 'ETF');
  assert.equal(assetTypeFrom({ typeHint: 'ETF' }), 'ETF');
  assert.equal(assetTypeFrom({}), 'Stock');
});

test('sql builders embed validated, escaped values', () => {
  assert.match(addSql({ symbol: 'VOO', name: "Vanguard S&P 500", assetType: 'ETF', exchange: 'ARCX', currency: 'USD', threshold: 5 }), /VALUES \('VOO', 'Vanguard S&P 500', 'ETF', 'ARCX', 'USD', 5\)$/);
  assert.match(removeSql('VOO'), /DELETE FROM Assets WHERE Symbol = 'VOO'$/);
  assert.match(updateSql('VOO', { isActive: false }), /IsActive = 0/);
  assert.throws(() => updateSql('VOO', {}));
});

test('BR-02 math', () => {
  assert.equal(targetPrice(100, 10), 90);
  assert.equal(dropPercent(100, 90), 10);
  assert.ok(dropPercent(100, 110) < 0);
});
