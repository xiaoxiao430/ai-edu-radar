import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

// 临时合成资料检验发布边界，不读取个人选择或修改实际项目数据。
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-edu-validator-'));
const write = (rel, value) => fs.writeFile(path.join(temp, rel), typeof value === 'string' ? value : JSON.stringify(value));
const run = name => spawnSync(process.execPath, [path.join(temp, 'scripts', name)], { encoding: 'utf8' });
const entry = (id, type = 'tool') => ({
  id, type, title: id, summary: '合成测试条目', category: '课堂教学', stages: ['小学'], subjects: ['综合'],
  priority: '建议先试', effort: '低', why: ['对应具体课堂任务'], teaching: '独立作答后订正', existing: '复用已有任务入口',
  mvp: ['一次任务'], acceptance: ['检查订正'], limitations: ['未做课堂实测'], commercial: '课程资源',
  sources: [{ title: '测试资料来源', url: 'https://example.org/', date: '2026-07-01' }],
  images: [{ src: 'assets/images/test.svg', type: '教学用法示意图', caption: '合成测试示意', sourceUrl: 'https://example.org/' }],
  capabilities: ['任务反馈'], dependencies: ['无需后台'], promptNotes: ['先核对实际入口'], reviewStatus: '仅合成资料',
});

try {
  for (const rel of ['scripts', 'assets/images', 'data/daily']) await fs.mkdir(path.join(temp, rel), { recursive: true });
  for (const name of ['validate.mjs', 'build-snapshot.mjs']) await fs.copyFile(path.join(project, 'scripts', name), path.join(temp, 'scripts', name));
  await write('index.html', '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><img src="assets/images/test.svg"><script src="app.js"></script></body></html>');
  await write('style.css', 'body{font-family:"Microsoft YaHei";background:url("assets/images/test.svg")}');
  await write('app.js', 'window.fixture="</script>";');
  await write('README.md', '测试公开说明');
  await write('DAILY_UPDATE.md', '测试更新说明');
  await write('assets/images/test.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>');
  const scenes = Array.from({ length: 62 }, (_, i) => ({ ...entry(`ot-scene-C${i}`, 'scene'), relatedTools: [] }));
  const tools = Array.from({ length: 338 }, (_, i) => ({ ...entry(`ot-tool-A${i}`), relatedScenes: [scenes[i % 62].id] }));
  const data = {
    scenes, tools, supplemental: Array.from({ length: 48 }, (_, i) => entry(`ot-extra-A${i}`)),
    media: Array.from({ length: 34 }, (_, i) => ({ id: `D${i}` })),
    stats: { scenes: 62, mainTools: 338, supplemental: 48, media: 34, excludedTests: 2 },
  };
  await write('data/ourteacher.json', data);
  await write('data/tutorials.json', {verifiedAt:'2026-07-01',scope:'合成公开教程资料',items:[{id:'tutorial-test',title:'合成教程',summary:'合成教学操作画面',url:'https://example.org/tutorial',images:scenes[0].images,relatedToolIds:[tools[0].id],relatedSceneIds:[scenes[0].id]}]});
  await write('data/teaching-map.json', {schemaVersion:1,verifiedAt:'2026-07-01',scope:'合成教学改造建议',stageSubjects:{小学:['英语']},stageProfiles:{小学:{goal:'单词理解',process:'作答反馈',assessment:'独立订正'}},placements:tools.map(r=>({recordId:r.id,stage:'小学',subject:'英语',sceneId:scenes[0].id,basis:'合成改造建议',goal:'课堂任务',teacherAction:'配置任务',studentAction:'独立完成',output:'作答与订正',acceptance:['完成一次样例']}))});
  await write('data/douyin-catalog.json',{schemaVersion:1,verifiedAt:'2026-07-01',scope:'合成作品整理',coverage:{discoveredCount:0,includedCount:0,mergedCount:0,excludedCount:0,complete:false,limitation:'测试夹具未枚举账号',nextStep:'取得作品清单'},items:[]});
  const dates = ['2026-07-01', '2026-08-30', '2026-07-16'];
  const manifest = {
    schemaVersion: 1, lastSuccessAt: '2026-08-30T08:30:00+08:00', latestDate: '2026-08-30', status: 'ok',
    dates: [],
  };
  const daily = date => ({ date, verifiedAt: `${date}T08:30:00+08:00`, selectionNote: '隔离测试', projects: [{ ...entry('repo:example/classroom', 'project'), license: 'MIT' }] });
  for (const date of dates) await write(`data/daily/${date}.json`, daily(date));
  const permutations = dates.flatMap(a => dates.filter(b => b !== a).map(b => [a, b, dates.find(c => c !== a && c !== b)]));
  for (const order of permutations) {
    manifest.dates = order.map(date => ({ date, path: `data/daily/${date}.json`, count: 1 }));
    await write('data/manifest.json', manifest);
    assert.equal(run('validate.mjs').status, 1, `任意顺序都应发现30天内重复：${order}`);
  }
  const updated = daily('2026-07-16');
  Object.assign(updated.projects[0], { isUpdate: true, updateReason: '已核对的实质版本更新' });
  await write('data/daily/2026-07-16.json', updated);
  for (const order of permutations) {
    manifest.dates = order.map(date => ({ date, path: `data/daily/${date}.json`, count: 1 }));
    await write('data/manifest.json', manifest);
    const result = run('validate.mjs');
    assert.equal(result.status, 0, `有更新标记时应通过：${result.stderr}`);
  }
  const falseComplete={schemaVersion:1,verifiedAt:'2026-07-01',scope:'合成作品整理',coverage:{discoveredCount:0,includedCount:0,mergedCount:0,excludedCount:0,complete:true},items:[]};
  await write('data/douyin-catalog.json',falseComplete);assert.equal(run('validate.mjs').status,1,'未取得完整清单不得标为全量完成');
  falseComplete.coverage={...falseComplete.coverage,complete:false,limitation:'测试未取得全量',nextStep:'取得完整作品目录'};
  await write('data/douyin-catalog.json',falseComplete);
  tools[0].summary = ['', 'Users', 'synthetic-user', 'private'].join('/');
  await write('data/ourteacher.json', data);
  assert.equal(run('validate.mjs').status, 1, '应拒绝私人绝对路径');
  tools[0].summary = '合成测试条目';
  tools[0].images = [{ ...tools[0].images[0], src: 'assets/images/missing.png' }];
  await write('data/ourteacher.json', data);
  assert.equal(run('validate.mjs').status, 1, '应拒绝缺失图片');
  tools[0].images = scenes[0].images;
  await write('data/ourteacher.json', data);
  const build = run('build-snapshot.mjs');
  assert.equal(build.status, 0, build.stderr);
  const snapshot = await fs.readFile(path.join(temp, 'downloads/ai-edu-radar.html'), 'utf8');
  assert(snapshot.includes('window.RADAR_BUNDLE='), '快照须包含离线数据');
  const bundleMatch = snapshot.match(/window\.RADAR_BUNDLE=([\s\S]*?);window\.RADAR_OFFLINE/);
  assert(bundleMatch, '快照数据注入位置应完整');
  const offline = JSON.parse(bundleMatch[1]);
  assert.equal(offline.manifest.dates.length, 1, '离线索引仅保留最新一期');
  assert.equal(offline.manifest.dates[0].date, manifest.latestDate, '快照日期须按latestDate定位，不依赖索引排序');
  assert.equal(offline.dailies.length, 1, '离线仅内联一期日报');
  assert.equal(offline.dailies[0].date, manifest.latestDate, '离线内容须为最新一期');
  assert.equal(offline.ourteacher.scenes.length, 62, '离线快照保留完整场景库');
  assert.equal(offline.ourteacher.tools.length, 338, '离线快照保留完整工具库');
  assert.equal(offline.tutorials.items.length, 1, '离线快照保留图文教程');
  assert.equal(offline.teachingMap.placements.length,338,'离线保留教学位置');
  assert.equal(offline.douyinCatalog.coverage.complete,false,'离线明确抖音覆盖范围');
  assert(offline.tutorials.items[0].images[0].src.startsWith('data:image/'), '教程配图内联');
  assert(offline.dailies[0].selectionNote.includes('本离线快照仅包含'), '快照应明确说明本期范围');
  assert(snapshot.includes('data:image/svg+xml;base64,'), '本地图片须内联');
  assert(!snapshot.includes('href="style.css"') && !snapshot.includes('src="app.js"'), '样式和脚本须内联');
  assert(snapshot.includes('<\\/script>'), '脚本终止字串须转义');
  assert.deepEqual((await fs.readdir(path.join(temp, 'dist'))).sort(), ['.nojekyll', 'app.js', 'assets', 'data', 'downloads', 'index.html', 'style.css']);
  const publishedManifest = JSON.parse(await fs.readFile(path.join(temp, 'dist/data/manifest.json'), 'utf8'));
  assert.equal(publishedManifest.dates.length, 3, '在线发布仍保留全部历史索引');
  assert.equal((await fs.readdir(path.join(temp, 'dist/data/daily'))).length, 3, '在线发布仍包含全部历史日报');
  console.log(JSON.stringify({ status: 'ok', dateOrderCases: 12, privatePathRejected: true, missingImageRejected: true, offlineAssetsInlined: true, offlineLatestOnly: true, onlineHistoryRetained: true, publishAllowList: true }));
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
