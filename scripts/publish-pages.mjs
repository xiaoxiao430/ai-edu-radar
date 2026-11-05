// 使用现有仓库写权限发布，GitHub内置的Pages Actions负责线上构建和部署。
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repository='xiaoxiao430/ai-edu-radar';
function run(cmd,args,cwd=root,allowFailure=false){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',env:process.env});if(r.status!==0&&!allowFailure)throw new Error(`${cmd} ${args[0]} failed: ${r.stderr||r.stdout||r.error}`);return r;}
run(process.execPath,['scripts/validate.mjs']);
run(process.execPath,['scripts/test-validator.mjs']);
run(process.execPath,['scripts/build-snapshot.mjs']);
const source=run('git',['rev-parse','HEAD']).stdout.trim();
if(run('git',['status','--porcelain']).stdout.trim())throw new Error('先检查并提交源文件，再发布，避免发布状态与源提交不一致。');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'ai-edu-pages-'));
try{
 await fs.cp(path.join(root,'dist'),temp,{recursive:true});
 run('git',['init','-b','gh-pages'],temp);
 run('git',['config','user.name','AI Education Radar'],temp);
 run('git',['config','user.email','266919472+xiaoxiao430@users.noreply.github.com'],temp);
 run('git',['remote','add','origin',`https://github.com/${repository}.git`],temp);
 const exists=run('git',['ls-remote','--heads','origin','gh-pages'],temp).stdout.trim();
 if(exists){run('git',['fetch','--depth=1','origin','gh-pages'],temp);run('git',['reset','--soft','FETCH_HEAD'],temp);}
 run('git',['add','-A'],temp);
 const changed=run('git',['diff','--cached','--quiet'],temp,true).status!==0;
 if(changed){run('git',['commit','-m',`Publish education radar from ${source.slice(0,8)}`],temp);run('git',['push','origin','HEAD:gh-pages'],temp);}
 const deploymentCommit=run('git',['rev-parse','HEAD'],temp).stdout.trim();
 const p=run('gh',['api',`repos/${repository}/pages`]);const config=JSON.parse(p.stdout);
 if(config.build_type!=='legacy'||config.source?.branch!=='gh-pages')run('gh',['api',`repos/${repository}/pages`,'-X','PUT','-f','build_type=legacy','-f','source[branch]=gh-pages','-f','source[path]=/']);
 console.log(JSON.stringify({status:'pushed',repository,sourceCommit:source,deploymentCommit,url:'https://xiaoxiao430.github.io/ai-edu-radar/',workflow:'pages build and deployment',changed}));
 console.log('接下来核对该deploymentCommit对应的GitHub Pages构建成功，再确认网站内容。');
}finally{await fs.rm(temp,{recursive:true,force:true});}
