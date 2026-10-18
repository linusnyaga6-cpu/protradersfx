const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const sources = require('./currency-connect-sources.cjs');

test('production CSP permits both currency providers without wildcard origins', () => {
  const hook = readFileSync('artifacts/protraders-fx/src/hooks/useUsdKesRate.ts', 'utf8');
  const urls = [...hook.matchAll(/const (?:RATE_URL|FALLBACK_URL) = "([^"]+)"/g)].map(match => match[1]);
  assert.equal(urls.length, 2);
  for (const url of urls) assert.ok(sources.includes(new URL(url).origin), url);
  assert.ok(sources.every(source => new URL(source).protocol === 'https:' && !source.includes('*')));
  assert.equal(sources.length, 3);
});

test('production CSP also permits approximate country detection', () => {
  assert.ok(sources.includes('https://api.country.is'));
});
