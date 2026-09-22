import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify, parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { verifyArchive, privateDirectory, writePrivate } from '../offline-copy/archive.mjs';
import { buildFrontend } from './build-frontend.mjs';
import { docker, start } from './control.mjs';
import { configureAutostart } from './autostart.mjs';

const exec=promisify(execFile);
const codeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const quoted=value=>"'"+String(value).replaceAll("'","'\\''")+"'";
async function copy(from,to){await fs.mkdir(path.dirname(to),{recursive:true,mode:0o700});await fs.cp(from,to,{recursive:true,dereference:false});}
async function bundle(name,root,action){
  const application=path.join(os.homedir(),'Applications',name+'.app');
  await privateDirectory(path.join(application,'Contents/MacOS'));
  const plist=`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleName</key><string>${name}</string><key>CFBundleIdentifier</key><string>de.versorgungs-kompass.local.${action}</string><key>CFBundleExecutable</key><string>launcher</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>`;
  await writePrivate(path.join(application,'Contents/Info.plist'),plist);
  const script=`#!/bin/zsh\nexport PATH=/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin\n/opt/homebrew/bin/node ${quoted(path.join(root,'program/tools/local-app/control.mjs'))} ${action} --root ${quoted(root)} ${action==='start'?'--open':''} >> ${quoted(path.join(root,'launcher.log'))} 2>&1\nif [ $? -ne 0 ]; then\n/usr/bin/osascript -e 'display alert "Versorgungs-Kompass Lokal" message "Die lokale Anwendung konnte nicht gestartet oder beendet werden. Dein Datenstand bleibt gespeichert. Details stehen in launcher.log im lokalen Anwendungsordner."'\nfi\n`;
  const launcher=path.join(application,'Contents/MacOS/launcher');await writePrivate(launcher,script);await fs.chmod(launcher,0o700);
  return application;
}
export async function install({root,snapshotDir,sourceRoot,sourceRevision,gitRepository=codeRoot,port=4188,profileId,createApplications=true}){
  root=path.resolve(root);snapshotDir=await fs.realpath(snapshotDir);sourceRoot=path.resolve(sourceRoot);
  if(/\/(?:Desktop|Documents|Mobile Documents|CloudStorage)(?:\/|$)/.test(root))throw new Error('Installation muss außerhalb von Cloud-Synchronisationsordnern liegen.');
  if(!/^[a-f0-9]{40}$/.test(sourceRevision))throw new Error('Quellrevision fehlt.');
  if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Ungültiger lokaler Port.');
  await verifyArchive(snapshotDir);
  const snapshot=JSON.parse(await fs.readFile(path.join(snapshotDir,'snapshot.json'),'utf8'));
  const profiles=snapshot.data.profiles.filter(row=>(!profileId||row.id===profileId)&&row.active===true&&row.role==='admin');
  if(profiles.length!==1)throw new Error('Eigenes lokales Profil nicht eindeutig.');
  try{await fs.access(root);throw new Error('Der lokale Anwendungsordner besteht bereits; bestehende Daten werden nicht ersetzt.');}catch(error){if(error.code!=='ENOENT')throw error;}
  await privateDirectory(root);
  await privateDirectory(path.join(root,'database'));
  await privateDirectory(path.join(root,'secrets'));
  await copy(snapshotDir,path.join(root,'source-snapshot'));
  const program=path.join(root,'program');
  await privateDirectory(program);
  for(const relative of ['api','frontend/data','deploy/postgres/pre-gematik/schema.sql']) await copy(path.join(sourceRoot,relative),path.join(program,relative));
  // Runtime dependencies are pure JavaScript and pinned by the original API lockfile.
  const originalLock=await fs.readFile(path.join(sourceRoot,'api/package-lock.json'));
  const installedLock=await fs.readFile(path.join(sourceRoot,'api/node_modules/.package-lock.json'));
  const pinnedPackages=JSON.parse(originalLock).packages, installedPackages=JSON.parse(installedLock).packages;
  for(const [name,item] of Object.entries(pinnedPackages))if(name.startsWith('node_modules/')&&installedPackages[name]?.version!==item.version)throw new Error('API-Abhängigkeiten stimmen nicht mit dem Quellstand überein.');
  await copy(path.join(sourceRoot,'api/node_modules'),path.join(program,'node_modules'));
  for(const relative of ['tools/local-app','tools/offline-copy'])await copy(path.join(codeRoot,relative),path.join(program,relative));
  const frontend=await buildFrontend({sourceRoot,outputRoot:program,sourceRevision,gitRepository});
  const instanceId=randomUUID();
  const config={schemaVersion:1,instanceId,projectName:`versorgungs-kompass-lokal-${instanceId.slice(0,8)}`,port,profileId:profiles[0].id,sourceRevision,seededFrom:snapshot.exportedAt,syncEnabled:true,openToken:randomBytes(32).toString('hex')};
  await writePrivate(path.join(root,'config.json'),JSON.stringify(config,null,2)+'\n');
  await writePrivate(path.join(root,'secrets/database-password'),randomBytes(32).toString('hex')+'\n');
  const nodeImage=JSON.parse((await exec('/usr/local/bin/docker',['image','inspect','node:22.23.1-bookworm-slim','--format','{{json .RepoDigests}}'])).stdout)[0];
  const databaseImage=JSON.parse((await exec('/usr/local/bin/docker',['image','inspect','postgres:16-alpine','--format','{{json .RepoDigests}}'])).stdout)[0];
  if(!nodeImage||!databaseImage)throw new Error('Lokale Laufzeit-Images fehlen.');
  const compose={name:'versorgungs-kompass-lokal',services:{database:{image:databaseImage,pull_policy:'never',environment:{POSTGRES_DB:'versorgungs_kompass_local',POSTGRES_USER:'vk_local_admin',POSTGRES_PASSWORD_FILE:'/run/secrets/local-db-password'},secrets:['local-db-password'],volumes:[{type:'bind',source:path.join(root,'database'),target:'/var/lib/postgresql/data'}],networks:['isolated'],healthcheck:{test:['CMD-SHELL','pg_isready -U vk_local_admin -d versorgungs_kompass_local'],interval:'2s',timeout:'3s',retries:30},restart:'unless-stopped',logging:{driver:'json-file',options:{'max-size':'5m','max-file':'2'}}},application:{image:nodeImage,pull_policy:'never',user:`${process.getuid()}:${process.getgid()}`,working_dir:'/program',command:['node','tools/local-app/gateway.mjs'],environment:{LOCAL_DB_HOST:'database',LOCAL_DB_NAME:'versorgungs_kompass_local',LOCAL_DB_USER:'vk_local_admin',LOCAL_DB_PASSWORD_FILE:'/run/secrets/local-db-password',LOCAL_APP_IMPORT_CONFIRMATION:'isolated-local-database'},secrets:['local-db-password'],volumes:[{type:'bind',source:program,target:'/program',read_only:true},{type:'bind',source:path.join(root,'config.json'),target:'/local/config.json',read_only:true},{type:'bind',source:path.join(root,'source-snapshot'),target:'/local/source-snapshot',read_only:true}],ports:[`127.0.0.1:${port}:8080`],networks:['isolated'],depends_on:{database:{condition:'service_healthy'}},read_only:true,tmpfs:['/tmp'],cap_drop:['ALL'],security_opt:['no-new-privileges:true'],restart:'unless-stopped',logging:{driver:'json-file',options:{'max-size':'5m','max-file':'2'}}}},networks:{isolated:{internal:true}},secrets:{'local-db-password':{file:path.join(root,'secrets/database-password')}}};
  compose.services.application.environment.LOCAL_APP_PROFILE_ID=config.profileId;
  compose.name=config.projectName;
  compose.services.backend={...structuredClone(compose.services.application),command:['node','tools/local-app/gateway.mjs','--api-only'],ports:[],networks:['isolated']};
  compose.services.application.networks=['ingress','isolated'];
  compose.services.application.depends_on.backend={condition:'service_started'};
  compose.networks.ingress={};
  await writePrivate(path.join(root,'compose.json'),JSON.stringify(compose,null,2)+'\n');
  await docker(root,['up','-d','--wait','--wait-timeout','90','--pull','never','database']);
  await docker(root,['run','--rm','--no-deps','application','node','tools/local-app/import-snapshot.mjs','--snapshot-dir','/local/source-snapshot','--schema','/program/deploy/postgres/pre-gematik/schema.sql'],{timeout:180000});
  return await finishInstall(root,{frontend,nodeImage,databaseImage,createApplications});
}
export async function finishInstall(root,{frontend,nodeImage,databaseImage,createApplications=true}={}) {
  const config=JSON.parse(await fs.readFile(path.join(root,'config.json'),'utf8'));
  const {sourceRevision,port}=config;
  const snapshot=JSON.parse(await fs.readFile(path.join(root,'source-snapshot/snapshot.json'),'utf8'));
  const compose=JSON.parse(await fs.readFile(path.join(root,'compose.json'),'utf8'));
  frontend ||= JSON.parse(await fs.readFile(path.join(root,'program/web/.local-app-frontend.json'),'utf8'));
  nodeImage ||= compose.services.application.image;
  databaseImage ||= compose.services.database.image;
  await start(root);
  const application=createApplications ? await bundle('Versorgungs-Kompass Lokal',root,'start') : null;
  const stopApplication=createApplications ? await bundle('Versorgungs-Kompass Lokal beenden',root,'stop') : null;
  const autostart=createApplications ? await configureAutostart(root) : null;
  await writePrivate(path.join(root,'LIESMICH.txt'),`Versorgungs-Kompass Lokal\n\nÖffnen: ${application}\nBeenden und Datenbank sichern: ${stopApplication}\n\nDie Originalanwendung läuft vollständig lokal auf diesem Mac. Docker wird beim Öffnen bei Bedarf gestartet. Internet und Anmeldung sind für die installierte Anwendung nicht nötig.\n\nAnfänglicher Datenstand: ${snapshot.exportedAt}\nAnwendungsversion: ${sourceRevision}\nUnter „Abgleich öffnen“ kannst du diesen Mac mit der Live-Anwendung verbinden. Danach wird beim Öffnen und alle 30 Minuten abgeglichen, solange die Anwendung läuft und der Mac wach ist. Offline bleiben Eingaben lokal gespeichert. Bei Konflikten bleiben beide Fassungen erhalten und du entscheidest. Neue Datei-Uploads und externe Kartenkacheln sind deaktiviert.\n\nDie PostgreSQL-Daten liegen im Unterordner database. Die unveränderte Ausgangskopie liegt in source-snapshot. Beim Beenden über die App entsteht zusätzlich eine lokale Datenbanksicherung unter backups. Löschen oder Zurücksetzen dieses Ordners bzw. der Docker-Daten ist kein normaler Bedienvorgang.\n`);
  await writePrivate(path.join(root,'installation.json'),JSON.stringify({createdAt:new Date().toISOString(),sourceRevision,seededFrom:snapshot.exportedAt,frontend,nodeImage,databaseImage,application},null,2)+'\n');
  return {application,stopApplication,autostart,port,sourceRevision,seededFrom:snapshot.exportedAt};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const {values}=parseArgs({options:{root:{type:'string'},snapshot:{type:'string'},source:{type:'string'},revision:{type:'string'},port:{type:'string'},profile:{type:'string'}}});
  console.log(JSON.stringify(await install({root:values.root||path.join(os.homedir(),'Library/Application Support/Versorgungs-Kompass Lokal'),snapshotDir:values.snapshot,sourceRoot:values.source||codeRoot,sourceRevision:values.revision,port:Number(values.port||4188),profileId:values.profile})));
}
