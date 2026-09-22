import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { installLocalTimestampParser, parseLocalTimestamp } from './pg-timestamps.mjs';

test('keeps all PostgreSQL microseconds as a JSON-safe ISO version token', () => {
  const version = parseLocalTimestamp('2026-09-20 10:11:12.123456+00');
  assert.equal(version, '2026-09-20T10:11:12.123456Z');
  assert.equal(JSON.parse(JSON.stringify({ version })).version, version);
  assert.equal(`eq.${version}`, 'eq.2026-09-20T10:11:12.123456Z');
  assert.notEqual(new Date(version).toISOString(), version);
});

test('does not conflate versions in the same millisecond', () => {
  const current = parseLocalTimestamp('2026-09-20 10:11:12.123456+00');
  const stale = parseLocalTimestamp('2026-09-20 10:11:12.123455+00');
  assert.equal(new Date(current).getTime(), new Date(stale).getTime());
  assert.notEqual(current, stale);
});

test('preserves fractional precision including zero and six digits', () => {
  for (const fraction of ['', '.1', '.12', '.123', '.1234', '.12345', '.123456', '.000001']) {
    assert.equal(parseLocalTimestamp(`2026-09-20 10:11:12${fraction}+00`), `2026-09-20T10:11:12${fraction}Z`);
  }
});

test('normalizes PostgreSQL offsets without changing the instant', () => {
  for (const [zone, expected] of [['+00', 'Z'], ['+00:00', 'Z'], ['Z', 'Z'], ['+02', '+02:00'], ['-04:30', '-04:30'], ['+0545', '+05:45']]) {
    assert.equal(parseLocalTimestamp(`2026-09-20 10:11:12.123456${zone}`), `2026-09-20T10:11:12.123456${expected}`);
  }
});

test('rejects unsupported format without including the source value in the error', () => {
  assert.throws(() => parseLocalTimestamp('unexpected-sensitive-value'), { message: 'LOCAL_TIMESTAMP_FORMAT_UNSUPPORTED' });
  assert.equal(parseLocalTimestamp('infinity'), 'infinity');
  assert.equal(parseLocalTimestamp('-infinity'), '-infinity');
});

test('installs only the timestamptz text parser used by the original API', () => {
  const calls = [];
  installLocalTimestampParser({ setTypeParser: (...args) => calls.push(args) });
  assert.deepEqual(calls, [[1184, 'text', parseLocalTimestamp]]);
  const require = createRequire(new URL('../../api/package.json', import.meta.url));
  assert.equal(require('pg').types.getTypeParser(1184, 'text'), parseLocalTimestamp);
});
