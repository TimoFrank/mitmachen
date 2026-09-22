import { createRequire } from 'node:module';

// The unchanged API uses updated_at as an exact optimistic-lock token. pg's
// default Date parser both changes its type and discards PostgreSQL microseconds.
// Keep a JSON-safe ISO string instead, only in the isolated local API process.
export function parseLocalTimestamp(value) {
  if (value === 'infinity' || value === '-infinity') return value;
  const match = /^(\d{4,}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d{1,6})?(Z|[+-]\d{2}(?::?\d{2})?)$/.exec(value);
  if (!match) throw new Error('LOCAL_TIMESTAMP_FORMAT_UNSUPPORTED');
  const [, date, time, fraction = '', zone] = match;
  const offset = zone === 'Z' ? 'Z' : zone.length === 3 ? zone + ':00' : zone.replace(/^([+-]\d{2})(\d{2})$/, '$1:$2');
  return `${date}T${time}${fraction}${/^[+-]00:00$/.test(offset) ? 'Z' : offset}`;
}

export function installLocalTimestampParser(types) {
  types.setTypeParser(1184, 'text', parseLocalTimestamp);
}

const require = createRequire(new URL('../../api/package.json', import.meta.url));
installLocalTimestampParser(require('pg').types);
