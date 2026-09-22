import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { startGateway } from './gateway.mjs';

const token = 'synthetic-local-token-0123456789abcdef0123456789abcdef';
const localOrigin = 'http://127.0.0.1:41737';
const localHost = '127.0.0.1:41737';
const assetPath = `assets/${'a'.repeat(64)}.png`;
const remoteImage = 'https://images.example.invalid/synthetic.png';
const assetBytes = Buffer.from('SYNTHETIC LOCAL IMAGE BYTES');

async function closeServer(server) {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kompass-gateway-test-'));
  const webRoot = path.join(root, 'web');
  const snapshotRoot = path.join(root, 'snapshot');
  await fs.mkdir(path.join(webRoot, 'frontend', 'app'), { recursive: true });
  await fs.mkdir(path.join(snapshotRoot, 'assets'), { recursive: true });
  await fs.writeFile(path.join(webRoot, 'frontend', 'app', 'versorgungs-kompass.html'), '<!doctype html><title>Synthetischer Test</title>LOCAL APP');
  await fs.writeFile(path.join(webRoot, 'app.js'), 'window.synthetic = true;');
  await fs.writeFile(path.join(snapshotRoot, assetPath), assetBytes);
  const outside = path.join(root, 'outside.txt');
  await fs.writeFile(outside, 'PRIVATE OUTSIDE SENTINEL');
  const requests = [];
  const api = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    requests.push({ method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') });
    if (req.url === '/api/broken') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('synthetic non-JSON response');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ items: [{ id: 'synthetic-contact', imageUrl: remoteImage, logo_url: 'https://missing.example.invalid/logo.png', avatar_url: '/api/profile-avatar/synthetic-profile', sourceUrl: remoteImage, notes: 'Unveraenderter synthetischer Text' }], received: chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null }));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const snapshot = {
    exportedAt: '2026-09-20T08:00:00.000Z', data: {},
    assets: [{ relativePath: assetPath, sourceUrl: remoteImage, mimeType: 'image/png', table: 'contacts', recordId: 'synthetic-contact' }],
    externalSources: { bundestagHealthCommittee: { payload: { members: [{ id: 'synthetic-member', imageUrl: remoteImage }], source: 'Synthetischer lokaler Datenstand' } } }
  };
  const gateway = await startGateway({
    config: { port: 41737, instanceId: 'synthetic-instance', openToken: token, profileId: 'synthetic-local-profile' },
    snapshot, webRoot, snapshotRoot, apiOrigin: `http://127.0.0.1:${api.address().port}`, port: 0, host: '127.0.0.1'
  });
  t.after(async () => {
    await closeServer(gateway);
    await closeServer(api);
    await fs.rm(root, { recursive: true, force: true });
  });
  function request(route, { method = 'GET', headers = {}, authenticated = true, body } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: gateway.address().port, path: route, method,
        headers: { Host: localHost, ...(authenticated ? { Cookie: `vk_local=${token}` } : {}), ...headers }
      }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks), text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(3000, () => req.destroy(new Error('SYNTHETIC_REQUEST_TIMEOUT')));
      req.end(body);
    });
  }
  return { request, requests, webRoot, snapshotRoot, outside };
}

test('lokaler Oeffnungstoken erzeugt echte geschuetzte Sitzung', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/app.js', { authenticated: false })).status, 401);
  assert.equal((await request('/__local/open?token=wrong', { authenticated: false })).status, 403);
  const opened = await request(`/__local/open?token=${token}`, { authenticated: false });
  assert.equal(opened.status, 303);
  const cookie = opened.headers['set-cookie'][0];
  assert.match(cookie, /; HttpOnly; SameSite=Strict; Path=\//);
  const authenticated = await request('/app.js', { authenticated: false, headers: { Cookie: cookie.split(';')[0] } });
  assert.equal(authenticated.status, 200);
  assert.match(authenticated.text, /synthetic/);
  assert.equal((await request('/app.js', { headers: { Cookie: `vk_local=${'z'.repeat(token.length)}` } })).status, 401);
});

test('fremde Hosts, Origins und browserseitige Cross-Site-Anfragen bleiben gesperrt', async t => {
  const { request, requests } = await fixture(t);
  for (const headers of [{ Host: 'attacker.example.invalid:41737' }, { Origin: 'https://attacker.example.invalid' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    assert.equal((await request('/api/contacts', { headers })).status, 403);
  }
  assert.equal(requests.length, 0);
});

test('Schreibzugriff benoetigt Sitzung und exakte lokale Origin', async t => {
  const { request, requests } = await fixture(t);
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    assert.equal((await request('/api/contacts/synthetic-contact', { method })).status, 403);
  }
  assert.equal((await request('/api/contacts', { method: 'POST', authenticated: false, headers: { Origin: localOrigin }, body: '{}' })).status, 401);
  const written = await request('/api/contacts', { method: 'POST', headers: { Origin: localOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Synthetischer Datensatz' }) });
  assert.equal(written.status, 200);
  assert.deepEqual(JSON.parse(requests[0].body), { name: 'Synthetischer Datensatz' });
});

test('vom Client gesetzte Identitaetsheader erreichen das Backend nicht', async t => {
  const { request, requests } = await fixture(t);
  const response = await request('/api/session', { headers: {
    Authorization: 'Bearer synthetic-spoof', 'X-Auth-Request-User': 'wrong-profile', 'X-Auth-Request-Email': 'spoof@example.invalid',
    'X-Goog-Authenticated-User-Id': 'wrong-google-profile', 'X-Forwarded-Email': 'spoof@example.invalid', 'X-Forwarded-Host': 'attacker.example.invalid'
  } });
  assert.equal(response.status, 200);
  const forwarded = requests[0].headers;
  assert.equal(forwarded['x-auth-request-user'], 'synthetic-local-profile');
  assert.equal(forwarded.origin, localOrigin);
  for (const header of ['authorization', 'x-auth-request-email', 'x-goog-authenticated-user-id', 'x-forwarded-email', 'x-forwarded-host', 'cookie']) assert.equal(forwarded[header], undefined, header);
});

test('Pfadtraversierung und ungueltige Dateipfade geben keine fremden Dateien frei', async t => {
  const { request } = await fixture(t);
  for (const route of ['/../outside.txt', '/%2e%2e/outside.txt', '/%2e%2e%2foutside.txt', '/%5c..%5coutside.txt', '/%00outside.txt', '/%not-encoding']) {
    const response = await request(route);
    assert.equal(response.status, 404, route);
    assert.doesNotMatch(response.text, /PRIVATE OUTSIDE SENTINEL/);
  }
});

test('Symlinks in den Webdateien duerfen den lokalen Webordner nicht verlassen', async t => {
  const { request, webRoot, outside } = await fixture(t);
  await fs.symlink(outside, path.join(webRoot, 'escape.txt'));
  const response = await request('/escape.txt');
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.text, /PRIVATE OUTSIDE SENTINEL/);
});

test('lokale Bilddateien werden ohne Backendzugriff ausgeliefert', async t => {
  const { request, requests } = await fixture(t);
  for (const route of [`/__local/${assetPath}`, '/api/contact-images/synthetic-contact']) {
    const response = await request(route);
    assert.equal(response.status, 200);
    assert.deepEqual(response.bytes, assetBytes);
    assert.equal(response.headers['content-type'], 'image/png');
    assert.match(response.headers['content-security-policy'], /sandbox/);
  }
  assert.equal((await request('/api/contact-images/missing-contact')).status, 404);
  assert.equal(requests.length, 0);
});

test('Symlinks in privaten Bilddateien duerfen den Snapshotordner nicht verlassen', async t => {
  const { request, snapshotRoot, outside, requests } = await fixture(t);
  await fs.unlink(path.join(snapshotRoot, assetPath));
  await fs.symlink(outside, path.join(snapshotRoot, assetPath));
  const response = await request('/api/contact-images/synthetic-contact');
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.text, /PRIVATE OUTSIDE SENTINEL/);
  assert.equal(requests.length, 0);
});

test('API-Antworten erhalten lokale Bilder und behalten Quellenangaben', async t => {
  const { request } = await fixture(t);
  const response = await request('/api/contacts');
  assert.equal(response.status, 200);
  const [item] = JSON.parse(response.text).items;
  assert.equal(item.imageUrl, `/__local/${assetPath}`);
  assert.equal(item.logo_url, '');
  assert.equal(item.avatar_url, '/api/profile-avatar/synthetic-profile');
  assert.equal(item.sourceUrl, remoteImage);
  assert.equal(item.notes, 'Unveraenderter synthetischer Text');
  assert.match(response.headers['content-security-policy'], /connect-src 'self'/);
});

test('Online-Anmeldung und deaktivierte Uploads werden nie weitergeleitet', async t => {
  const { request, requests } = await fixture(t);
  const routes = [
    ['GET', '/api/auth/bootstrap'], ['POST', '/api/auth/external-enrollment'], ['POST', '/api/connectors/typo3/mitmachen-registrations'],
    ['POST', '/api/profile/avatar'], ['DELETE', '/api/profile/avatar'], ['POST', '/api/contacts/synthetic-contact/image'],
    ['POST', '/api/contact-note-attachments'], ['DELETE', '/api/contact-note-attachments/synthetic-attachment']
  ];
  for (const [method, route] of routes) {
    const response = await request(route, { method, headers: { Origin: localOrigin } });
    assert.equal(response.status, 409, route);
    assert.equal(JSON.parse(response.text).code, 'LOCAL_FEATURE_DISABLED');
  }
  assert.equal(requests.length, 0);
});

test('Politikdaten werden aus dem gesicherten Bestand mit lokalen Bildern geliefert', async t => {
  const { request, requests } = await fixture(t);
  const response = await request('/api/politics/health-committee');
  assert.equal(response.status, 200);
  const payload = JSON.parse(response.text);
  assert.equal(payload.members[0].id, 'synthetic-member');
  assert.equal(payload.members[0].imageUrl, `/__local/${assetPath}`);
  assert.equal(requests.length, 0);
});

test('nicht lesbare Backendantwort liefert einen begrenzten lokalen Fehler', async t => {
  const { request } = await fixture(t);
  const response = await request('/api/broken');
  assert.equal(response.status, 502);
  assert.equal(JSON.parse(response.text).error, 'Lokale API-Antwort ungültig.');
  assert.doesNotMatch(response.text, /synthetic non-JSON response/);
});
