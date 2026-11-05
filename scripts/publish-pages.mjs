// 使用现有仓库写权限发布，GitHub内置的Pages Actions负责线上构建和部署。
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository='xiaoxiao430/ai-edu-radar';
function run(cmd,args,cwd=root,allowFailure=false,input){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',input,env:{...process.env,GIT_TERMINAL_PROMPT:'0'},timeout:60000,maxBuffer:20*1024*1024});if(r.status!==0&&!allowFailure)throw new Error(`${cmd} ${args[0]} failed: ${r.stderr||r.stdout||r.error}`);return r;}
function api(endpoint,method='GET',payload){return JSON.parse(run('gh',['api',`repos/${repository}/${endpoint}`,'-X',method,...(payload?['--input','-']:[])],root,false,payload?JSON.stringify(payload):undefined).stdout);}
run(process.execPath,['scripts/validate.mjs']);
run(process.execPath,['scripts/test-validator.mjs']);
run(process.execPath,['scripts/build-snapshot.mjs']);
const source=run('git',['rev-parse','HEAD']).stdout.trim();
if(run('git',['status','--porcelain']).stdout.trim())throw new Error('先检查并提交源文件，再发布，避免发布状态与源提交不一致。');
const remoteSource=run('gh',['api',`repos/${repository}/git/ref/heads/main`,'--jq','.object.sha']).stdout.trim();
if(remoteSource!==source)throw new Error('main尚未成功推送或远端已变化。先同步源文件，再发布网站。');
// 采用同一gh授权的Git数据库API传输，避免Git HTTPS链路间歇超时。
const parent=api('git/ref/heads/gh-pages').object.sha;
const parentCommit=api(`git/commits/${parent}`);
const remote=api(`git/trees/${parentCommit.tree.sha}?recursive=1`);
if(remote.truncated)throw new Error('线上文件目录返回不完整，停止发布。');
const existing=new Map(remote.tree.filter(x=>x.type==='blob').map(x=>[x.path,x.sha]));
const local=new Map();
async function walk(dir,prefix=''){for(const f of await fs.readdir(dir,{withFileTypes:true})){const rel=prefix+f.name;if(f.isDirectory())await walk(path.join(dir,f.name),rel+'/');else if(f.isFile()){const content=await fs.readFile(path.join(dir,f.name));const sha=crypto.createHash('sha1').update(Buffer.from(`blob ${content.length}\0`)).update(content).digest('hex');local.set(rel,{content,sha});}else throw new Error('发布目录含非常规文件，停止发布。');}}
await walk(path.join(root,'dist'));
const changes=[];
for(const [name,file]of local){if(existing.get(name)===file.sha)continue;const uploaded=api('git/blobs','POST',{content:file.content.toString('base64'),encoding:'base64'});if(uploaded.sha!==file.sha)throw new Error('上传后的文件摘要不一致');changes.push({path:name,mode:'100644',type:'blob',sha:file.sha});}
for(const name of existing.keys())if(!local.has(name))changes.push({path:name,mode:'100644',type:'blob',sha:null});
let deploymentCommit=parent;
if(changes.length){
 const tree=api('git/trees','POST',{base_tree:parentCommit.tree.sha,tree:changes});
 const commit=api('git/commits','POST',{message:`Publish education radar from ${source.slice(0,8)}`,tree:tree.sha,parents:[parent],author:{name:'AI Education Radar',email:'266919472+xiaoxiao430@users.noreply.github.com'}});
 if(api('git/ref/heads/gh-pages').object.sha!==parent)throw new Error('线上分支已被其他操作更新，保留现状并停止。');
 api('git/refs/heads/gh-pages','PATCH',{sha:commit.sha,force:false});deploymentCommit=commit.sha;
}
const config=api('pages');
if(config.build_type!=='legacy'||config.source?.branch!=='gh-pages')api('pages','PUT',{build_type:'legacy',source:{branch:'gh-pages',path:'/'}});
if(changes.length)api('pages/builds','POST');
console.log(JSON.stringify({status:'pushed',repository,sourceCommit:source,deploymentCommit,url:'https://xiaoxiao430.github.io/ai-edu-radar/',workflow:'pages build and deployment',changed:changes.length>0,changedFiles:changes.length}));
console.log('接下来核对该deploymentCommit对应的GitHub Pages构建成功，再确认网站内容。');
