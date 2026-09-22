import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { localConnectionConfig } from './import-snapshot.mjs';
import { createLocalSync } from './sync.mjs';

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.pdf':'application/pdf','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
const BLOCKED = /^(?:\/api\/(?:auth|connectors|admin|stakeholder-import)(?:\/|$)|\/api\/profile\/avatar$|\/api\/contacts\/[^/]+\/image$|\/api\/contact-note-attachments(?:\/[^/]+)?$)/;
export function sameSecret(actual, expected) {
  const a = Buffer.from(String(actual || '')), b = Buffer.from(String(expected || ''));
  return a.length === b.length && a.length >= 32 && timingSafeEqual(a,b);
}
export function safeWebPath(root, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded.includes('\0') || decoded.includes('\\') || decoded.split('/').includes('..')) return null;
  const result = path.resolve(root, '.' + decoded);
  return result.startsWith(path.resolve(root) + path.sep) ? result : null;
}
export function assetMaps(snapshot) {
  const urls = new Map(), routes = new Map(), files = new Map();
  for (const asset of snapshot.assets || []) {
    if (!/^assets\/[a-f0-9]{64}\.[a-z0-9]+$/.test(asset.relativePath)) throw new Error('LOCAL_ASSET_PATH_INVALID');
    const local = '/__local/' + asset.relativePath;
    urls.set(asset.sourceUrl,local); files.set(local,asset);
    const prefix = {profiles:'profile-avatar',contacts:'contact-images',stakeholder_organizations:'stakeholder-logos',contact_note_attachments:'contact-note-attachments'}[asset.table];
    if (prefix) routes.set('/api/' + prefix + '/' + encodeURIComponent(asset.recordId) + (asset.table === 'contact_note_attachments' ? '/content' : ''),asset);
  }
  return {urls,routes,files};
}
export function localizeImages(value, urls, key = '') {
  if (Array.isArray(value)) return value.map(item => localizeImages(item, urls,key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,localizeImages(v,urls,k)]));
  if (typeof value !== 'string') return value;
  if (/^(?:imageUrl|image_url|logoUrl|logo_url|avatarUrl|avatar_url|photoUrl|photo_url|photo|image)$/i.test(key)) {
    return urls.get(value) || (/^(?:https?:|gs:|private:|\/\/)/i.test(value) ? '' : value);
  }
  return value;
}
export async function startGateway({config, snapshot, webRoot, snapshotRoot, apiOrigin='http://127.0.0.1:8081', port=8080, host='0.0.0.0', sync=null}) {
  webRoot=await fs.realpath(webRoot);
  snapshotRoot=await fs.realpath(snapshotRoot);
  const maps = assetMaps(snapshot);
  const origin = `http://127.0.0.1:${config.port}`;
  const expectedHost = new URL(origin).host;
  const sendJson = (res,status,payload) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(payload));};
  const file = async (res,filename,type) => {
    const content = await fs.readFile(filename);
    res.setHeader('Content-Type',type || TYPES[path.extname(filename)] || 'application/octet-stream');
    res.setHeader('Content-Length',content.length);
    res.end(content);
  };
  const server = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; worker-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    try {
      if (req.headers.host !== expectedHost) return sendJson(res,403,{error:'Lokaler Zugriff erforderlich.'});
      const url = new URL(req.url,origin);
      if (req.headers.origin && req.headers.origin !== origin) return sendJson(res,403,{error:'Andere Herkunft gesperrt.'});
      if (url.pathname === '/__local/health' && req.method === 'GET') {
        const ready=await fetch(apiOrigin+'/api/readyz',{signal:AbortSignal.timeout(2000)});
        return sendJson(res,ready.ok?200:503,{ok:ready.ok,application:'versorgungs-kompass-local',instanceId:config.instanceId});
      }
      if (url.pathname === '/__local/open' && req.method === 'GET') {
        if (!sameSecret(url.searchParams.get('token'),config.openToken)) return sendJson(res,403,{error:'Bitte über die lokale App öffnen.'});
        res.setHeader('Set-Cookie',`vk_local=${config.openToken}; HttpOnly; SameSite=Strict; Path=/`);
        res.writeHead(303,{Location:'/frontend/app/versorgungs-kompass.html#hospitations'});return res.end();
      }
      const cookie = /(?:^|;\s*)vk_local=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      if (!sameSecret(cookie,config.openToken)) return sendJson(res,401,{error:'Bitte Versorgungs-Kompass Lokal aus dem Programme-Ordner öffnen.'});
      if (req.headers['sec-fetch-site'] === 'cross-site') return sendJson(res,403,{error:'Externer Zugriff gesperrt.'});
      if (!['GET','HEAD'].includes(req.method) && req.headers.origin !== origin) return sendJson(res,403,{error:'Lokale Herkunft erforderlich.'});
      if (sync && url.pathname.startsWith('/__local/sync/')) {
        if (url.pathname === '/__local/sync/status' && req.method === 'GET') return sendJson(res,200,await sync.status());
        if (url.pathname === '/__local/sync/history' && req.method === 'GET') return sendJson(res,200,await sync.history());
        if (req.method !== 'POST' || req.headers['content-type'] !== 'application/json') return sendJson(res,405,{error:'Methode nicht verfügbar.'});
        const chunks=[];let size=0;
        for await (const chunk of req) {size+=chunk.length;if(size>10_000)return sendJson(res,413,{error:'Anfrage zu groß.'});chunks.push(chunk);}
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
        if(url.pathname === '/__local/sync/pair')return sendJson(res,200,await sync.beginPairing());
        if(url.pathname === '/__local/sync/run')return sendJson(res,200,await sync.run());
        if(url.pathname === '/__local/sync/resolve')return sendJson(res,200,await sync.resolve(input));
        return sendJson(res,404,{error:'Nicht gefunden.'});
      }
      if (url.pathname === '/__local/status' && req.method === 'GET') return sendJson(res,200,{local:true,sourceDate:snapshot.exportedAt,changesStayLocal:true});
      if (sync && req.method === 'GET' && /^\/api\/(?:profile-avatar|contact-images|stakeholder-logos|contact-note-attachments)\//.test(url.pathname)) {
        const current=await sync.asset(url.pathname);
        if(current?.missing)return sendJson(res,404,{error:'Datei ist lokal nicht vorhanden.'});
        if(current){res.writeHead(200,{'Content-Type':current.content_type,'Content-Security-Policy':"default-src 'none'; sandbox"});return res.end(current.content);}
      }
      const asset = maps.files.get(url.pathname) || maps.routes.get(url.pathname);
      if (asset && req.method === 'GET') {
        res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
        const realAsset=await fs.realpath(path.join(snapshotRoot,asset.relativePath));
        if(!realAsset.startsWith(snapshotRoot+path.sep)) return sendJson(res,404,{error:'Nicht gefunden.'});
        return await file(res,realAsset,asset.mimeType);
      }
      if (/^\/api\/(?:profile-avatar|contact-images|stakeholder-logos)\//.test(url.pathname) || /^\/api\/contact-note-attachments\/[^/]+\/content$/.test(url.pathname)) return sendJson(res,404,{error:'Datei ist lokal nicht vorhanden.'});
      if (url.pathname === '/api/politics/health-committee' && req.method === 'GET') {
        const source = Object.values(snapshot.externalSources || {}).find(item => item.data?.members || item.payload?.members);
        return sendJson(res,200,localizeImages(source?.data || source?.payload || {members:snapshot.data.bundestag_health_committee || [],source:'Lokaler Datenstand'},maps.urls));
      }
      if (url.pathname.startsWith('/api/')) {
        if (BLOCKED.test(url.pathname) && req.method !== 'GET') return sendJson(res,409,{error:'Diese Funktion ist in der lokalen Anwendung deaktiviert.',code:'LOCAL_FEATURE_DISABLED'});
        if (url.pathname.startsWith('/api/auth/') || url.pathname.startsWith('/api/ops/')) return sendJson(res,409,{error:'Diese Online-Funktion ist lokal nicht verfügbar.',code:'LOCAL_FEATURE_DISABLED'});
        const chunks=[];let size=0;
        for await (const chunk of req) {size+=chunk.length;if(size>4*1024*1024) return sendJson(res,413,{error:'Anfrage zu groß.'});chunks.push(chunk);}
        const headers={Accept:'application/json',Origin:origin,'X-Auth-Request-User':config.profileId};
        if(req.headers['x-local-data-version'])headers['X-Local-Data-Version']=req.headers['x-local-data-version'];
        if(chunks.length) headers['Content-Type']='application/json';
        const response=await fetch(apiOrigin+url.pathname+url.search,{method:req.method,headers,body:chunks.length?Buffer.concat(chunks):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
        if(req.method==='HEAD'){res.writeHead(response.status);return res.end();}
        const body=await response.text();
        let payload;try{payload=JSON.parse(body);}catch{return sendJson(res,502,{error:'Lokale API-Antwort ungültig.'});}
        if(response.headers.get('content-disposition')) res.setHeader('Content-Disposition',response.headers.get('content-disposition'));
        if(response.headers.get('x-local-data-version'))res.setHeader('X-Local-Data-Version',response.headers.get('x-local-data-version'));
        return sendJson(res,response.status,url.pathname==='/api/export'?payload:localizeImages(payload,maps.urls));
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res,405,{error:'Methode nicht verfügbar.'});
      if(url.pathname === '/') {res.writeHead(302,{Location:'/frontend/app/versorgungs-kompass.html#hospitations'});return res.end();}
      const filename=safeWebPath(webRoot,url.pathname);
      if(!filename) return sendJson(res,404,{error:'Nicht gefunden.'});
      const real=await fs.realpath(filename);
      if(!real.startsWith(path.resolve(webRoot)+path.sep)) return sendJson(res,404,{error:'Nicht gefunden.'});
      return await file(res,real);
    } catch(error) {
      if(!res.headersSent) sendJson(res,error.code==='ENOENT'?404:503,{error:error.code==='ENOENT'?'Nicht gefunden.':'Lokale Anwendung ist noch nicht bereit.'});
      else res.destroy();
    }
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
  return server;
}

async function main() {
  const root='/local';
  const config=JSON.parse(await fs.readFile(root+'/config.json','utf8'));
  if(!process.argv.includes('--api-only')) {
    const snapshot=JSON.parse(await fs.readFile(root+'/source-snapshot/snapshot.json','utf8'));
    const {Pool}=createRequire(new URL('../../api/package.json',import.meta.url))('pg');
    const pool=new Pool(await localConnectionConfig());
    const sync=config.syncEnabled ? createLocalSync({pool,profileId:config.profileId}) : null;
    const server=await startGateway({config,snapshot,webRoot:'/program/web',snapshotRoot:root+'/source-snapshot',apiOrigin:'http://backend:8081',sync});
    sync?.start();
    const stop=async()=>{await sync?.stop();server.close(()=>pool.end().finally(()=>process.exit(0)));};
    process.on('SIGTERM',stop);process.on('SIGINT',stop);
    console.log('Lokale Oberfläche gestartet.');
    return;
  }
  const password=(await fs.readFile('/run/secrets/local-db-password','utf8')).trim();
  const child=spawn(process.execPath,['--import','/program/tools/local-app/pg-timestamps.mjs','/program/api/server.mjs'],{cwd:'/program',stdio:'inherit',env:{PATH:process.env.PATH,NODE_ENV:'development',PORT:'8081',API_AUTH_MODE:'trusted-header',API_AUTH_ALLOW_DEV_PROFILE:'0',API_AUTH_ALLOW_BEARER_DEV:'0',ALLOWED_ORIGIN:`http://127.0.0.1:${config.port}`,DB_HOST:'database',DB_PORT:'5432',DB_NAME:'versorgungs_kompass_local',DB_USER:'vk_local_admin',DB_PASSWORD:password,DB_SSL_MODE:'disable',LOCAL_APP_SYNC:config.syncEnabled?'1':'0',IMAGE_UPLOAD_MODE:'disabled',ATTACHMENT_UPLOAD_MODE:'disabled',RATE_LIMIT_READS_PER_MINUTE:'5000',RATE_LIMIT_WRITES_PER_MINUTE:'1000'}});
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;child.kill('SIGTERM');setTimeout(()=>process.exit(),3000).unref();};
  child.once('error',()=>{process.exitCode=1;});
  child.once('exit',code=>{process.exitCode=stopping?0:(code||1);});
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
  console.log('Lokale Fachlogik gestartet.');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
