import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function composeArgs(root) {
  const config=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));
  const project=config.projectName || 'versorgungs-kompass-lokal';
  if(!/^versorgungs-kompass-lokal(?:-[a-z0-9-]+)?$/.test(project))throw new Error('Ungültige lokale Installation.');
  return ['compose','--project-name',project,'--file',path.join(root,'compose.json')];
}
export async function docker(root,args,options={}) {
  return exec('/usr/local/bin/docker',[...await composeArgs(root),...args],{cwd:root,timeout:120000,maxBuffer:4*1024*1024,...options});
}
async function runningDocker() {try{await exec('/usr/local/bin/docker',['info','--format','{{.ServerVersion}}'],{timeout:5000});return true;}catch{return false;}}
async function ensureDocker() {
  if(await runningDocker()) return;
  await exec('/usr/bin/open',['-g','-a','Docker']);
  for(let attempt=0;attempt<60;attempt++){await pause(1000);if(await runningDocker())return;}
  throw new Error('Docker konnte nicht gestartet werden. Bitte Docker öffnen und danach die lokale App erneut öffnen.');
}
export async function start(root,{openBrowser=false}={}) {
  const config=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));
  await ensureDocker();
  await docker(root,['up','-d','--pull','never','--no-build']);
  let ready=false;
  for(let attempt=0;attempt<60;attempt++){
    try{
      const response=await fetch(`http://127.0.0.1:${config.port}/__local/health`,{signal:AbortSignal.timeout(1000)});
      const value=await response.json();
      if(value.instanceId===config.instanceId && value.ok){ready=true;break;}
    }catch{}
    await pause(500);
  }
  if(!ready)throw new Error('Die lokale Anwendung wurde nicht rechtzeitig bereit. Der gespeicherte Datenstand bleibt erhalten.');
  if(openBrowser)await exec('/usr/bin/open',[`http://127.0.0.1:${config.port}/__local/open?token=${config.openToken}`]);
  return {ok:true,port:config.port};
}
export async function backup(root) {
  await fs.mkdir(path.join(root,'backups'),{recursive:true,mode:0o700});
  const filename=path.join(root,'backups',new Date().toISOString().replace(/[:.]/g,'-')+'.dump');
  const handle=await fs.open(filename,'wx',0o600);
  const child=spawn('/usr/local/bin/docker',[...await composeArgs(root),'exec','-T','database','pg_dump','-U','vk_local_admin','-d','versorgungs_kompass_local','-Fc'],{cwd:root,stdio:['ignore',handle.fd,'pipe']});
  try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Lokale Sicherung fehlgeschlagen.')));});}catch(error){await fs.unlink(filename).catch(()=>{});throw error;}finally{await handle.close();}
  return filename;
}
async function main(){
  const args=process.argv.slice(2),action=args[0]||'start';
  const index=args.indexOf('--root');
  const root=index>=0?path.resolve(args[index+1]):path.join(os.homedir(),'Library/Application Support/Versorgungs-Kompass Lokal');
  if(action==='start'){console.log(JSON.stringify(await start(root,{openBrowser:args.includes('--open')})));return;}
  if(action==='stop'){await backup(root);await docker(root,['stop']);console.log('Lokale Anwendung gesichert und beendet.');return;}
  if(action==='backup'){console.log(await backup(root));return;}
  throw new Error('Unbekannte Aktion.');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main().catch(error=>{console.error(error.message);process.exitCode=1;});
