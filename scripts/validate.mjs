import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const assert = (condition, message) => { if (!condition) fail(message); };
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const stages = new Set(['幼儿园', '小学', '初中', '高中', '职教大学']);
const priorities = new Set(['已有补强', '建议先试', '第二批', '暂缓', '待核后排']);
const efforts = new Set(['低', '中', '高', '待核']);
const forbidden = [
  [/\/Users\/[^\s"'<>]+/g, '私人用户目录'],
  [/\/var\/folders\/[^\s"'<>]+/g, '临时文件目录'],
  [/\/private\/tmp\/[^\s"'<>]+/g, '私有临时目录'],
  [/\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g, 'GitHub令牌'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, 'GitHub令牌'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/g, 'API密钥'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '私钥'],
];

function scan(text, label) {
  for (const [pattern, description] of forbidden) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) fail(`${label} 含${description}；请移出公开数据。`);
  }
}

async function readJson(rel) {
  if (typeof rel !== 'string' || path.isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) {
    fail('JSON路径必须位于项目目录中');
    return null;
  }
  const file = path.join(root, rel);
  let text;
  try { text = await fs.readFile(file, 'utf8'); }
  catch { fail(`缺少文件：${rel}`); return null; }
  scan(text, rel);
  try { return JSON.parse(text); }
  catch (error) { fail(`${rel} 不是有效JSON：${error.message}`); return null; }
}

function sourceUrl(source) {
  if (typeof source === 'string') return source;
  return source?.url || source?.sourceUrl || '';
}

async function validateImage(image, label) {
  assert(image && isText(image.src), `${label} 缺少图片src`);
  assert(isText(image?.type), `${label} 缺少图片类型`);
  assert(isText(image?.caption), `${label} 缺少图片说明`);
  const src = image?.src;
  if (!isText(src)) return;
  if (/^https?:\/\//.test(src)) {
    assert(/^https?:\/\//.test(image.sourceUrl || ''), `${label} 远程图片缺少来源URL`);
    warnings.push(`${label} 使用远程图片，离线快照可能无法离线显示该图。`);
    return;
  }
  if (src.startsWith('data:image/')) return;
  assert(!src.startsWith('/') && !src.split('/').includes('..'), `${label} 必须使用安全的项目相对图片路径`);
  assert(src.startsWith('assets/images/'), `${label} 本地图片应放入assets/images/`);
  try {
    const stat = await fs.stat(path.join(root, src));
    assert(stat.isFile() && stat.size > 0, `${label} 图片为空`);
  } catch { fail(`${label} 图片不存在：${src}`); }
}

async function validateEntry(entry, label, ids) {
  assert(isText(entry?.id), `${label} 缺少稳定ID`);
  if (!entry) return;
  if (ids.has(entry.id)) fail(`${label} 出现重复ID：${entry.id}`);
  ids.add(entry.id);
  for (const key of ['title', 'summary', 'category', 'teaching', 'existing', 'commercial', 'reviewStatus']) {
    assert(isText(entry[key]), `${label} 缺少${key}`);
  }
  for (const key of ['why', 'mvp', 'acceptance', 'limitations', 'capabilities', 'dependencies', 'promptNotes']) {
    assert(Array.isArray(entry[key]) && entry[key].length > 0 && entry[key].every(isText), `${label} 的${key}应为非空文本数组`);
  }
  assert(Array.isArray(entry.stages) && (entry.stages.length > 0 || entry.priority === '待核后排') && entry.stages.every(s => stages.has(s)), `${label} 学段标签未标准化；仅待核条目允许空学段`);
  assert(Array.isArray(entry.subjects) && entry.subjects.length > 0, `${label} 缺少学科标签`);
  assert(priorities.has(entry.priority), `${label} 推荐次序不正确：${entry.priority}`);
  assert(efforts.has(entry.effort), `${label} 投入标签不正确：${entry.effort}`);
  assert(Array.isArray(entry.sources) && entry.sources.length > 0, `${label} 缺少原始来源`);
  for (const [i, source] of (entry.sources || []).entries()) {
    assert(/^https?:\/\//.test(sourceUrl(source)), `${label} 来源${i + 1}缺少公开URL`);
    assert(typeof source === 'object' && isText(source.title), `${label} 来源${i + 1}缺少标题`);
  }
  assert(Array.isArray(entry.images) && entry.images.length > 0, `${label} 缺少配图`);
  for (const [i, image] of (entry.images || []).entries()) await validateImage(image, `${label} 图片${i + 1}`);
}

const ourteacher = await readJson('data/ourteacher.json');
const manifest = await readJson('data/manifest.json');
const ids = new Set();
if (ourteacher) {
  const { scenes = [], tools = [], supplemental = [], media = [], stats = {} } = ourteacher;
  assert(scenes.length === 62, `教育场景应为62类，实际${scenes.length}`);
  assert(tools.length === 338, `主目录应为338项，实际${tools.length}`);
  assert(supplemental.length === 48, `繁体补充应为48项，实际${supplemental.length}`);
  assert(media.length === 34, `抖音资料应为34条，实际${media.length}`);
  for (const [key, expected] of Object.entries({ scenes: 62, mainTools: 338, supplemental: 48, media: 34, excludedTests: 2 })) {
    assert(stats[key] === expected, `stats.${key}应为${expected}，实际${stats[key]}`);
  }
  const sceneIds = new Set(scenes.map(x => x.id));
  const toolIds = new Set(tools.map(x => x.id));
  for (const entry of [...scenes, ...tools, ...supplemental]) {
    await validateEntry(entry, `OurTeacher ${entry.id || entry.title || '未知条目'}`, ids);
    assert(!/^test\d*$/i.test(entry.title || ''), `测试项${entry.title}不应出现在可选择清单`);
  }
  for (const tool of tools) {
    assert(Array.isArray(tool.relatedScenes) && tool.relatedScenes.length > 0, `${tool.id}尚未关联教育场景`);
    for (const id of tool.relatedScenes || []) assert(sceneIds.has(id), `${tool.id}引用了不存在的场景${id}`);
  }
  for (const scene of scenes) for (const id of scene.relatedTools || []) assert(toolIds.has(id), `${scene.id}引用了不存在的工具${id}`);
}

let dailyCount = 0;
if (manifest) {
  assert(manifest.schemaVersion === 1, 'manifest.schemaVersion应为1');
  assert(/^\d{4}-\d{2}-\d{2}$/.test(manifest.latestDate || ''), 'manifest.latestDate格式错误');
  assert(!Number.isNaN(Date.parse(manifest.lastSuccessAt)), 'manifest.lastSuccessAt应为带时区时间');
  assert(manifest.status === 'ok' || manifest.status === 'partial', 'manifest.status应为ok或partial');
  assert(Array.isArray(manifest.dates) && manifest.dates.length > 0, 'manifest.dates不可为空');
  const dates = new Set();
  const seenProjects = new Map();
  for (const ref of manifest.dates || []) {
    assert(/^\d{4}-\d{2}-\d{2}$/.test(ref.date || ''), '日报索引日期格式错误');
    assert(!dates.has(ref.date), `日报索引日期重复：${ref.date}`);
    dates.add(ref.date);
    assert(ref.path === `data/daily/${ref.date}.json`, `${ref.date}日报路径应为data/daily/${ref.date}.json`);
    const daily = await readJson(ref.path);
    if (!daily) continue;
    assert(daily.date === ref.date, `${ref.path}日期与索引不一致`);
    assert(isText(daily.verifiedAt), `${ref.path}缺少核对时间`);
    assert(isText(daily.selectionNote), `${ref.path}缺少选取说明`);
    assert(Array.isArray(daily.projects), `${ref.path}缺少projects数组`);
    const projects = daily.projects || [];
    assert(projects.length <= 10, `${ref.path}超过每日10项上限`);
    assert(ref.count === projects.length, `${ref.path}数量与索引不一致`);
    const dateIds = new Set();
    for (const entry of projects) {
      await validateEntry(entry, `${ref.date} ${entry.id || '未知项目'}`, dateIds);
      assert(entry.type === 'project', `${entry.id} type应为project`);
      assert(isText(entry.license), `${entry.id}缺少许可核对状态`);
      assert(/^repo:[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(entry.id || '') || /^web:[a-z0-9_.:-]+$/.test(entry.id || ''), `${entry.id}项目ID应使用repo:owner/name或稳定web:编号`);
      const appearances = seenProjects.get(entry.id) || [];
      appearances.push({ date: ref.date, entry });
      seenProjects.set(entry.id, appearances);
    }
    dailyCount += projects.length;
  }
  assert(dates.has(manifest.latestDate), 'latestDate未出现在dates索引中');
  // 按真实日期检查，而不依赖manifest的展示顺序；重复标记属于较新的那次推荐。
  for (const [id, appearances] of seenProjects) {
    appearances.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    for (let i = 1; i < appearances.length; i++) {
      const recent = appearances.slice(0, i).some(previous => (Date.parse(appearances[i].date) - Date.parse(previous.date)) / 86400000 < 30);
      if (recent) assert(appearances[i].entry.isUpdate === true && isText(appearances[i].entry.updateReason), `${id}在${appearances[i].date}的30天内重复，须标注isUpdate与updateReason`);
    }
  }
}

for (const rel of ['index.html', 'style.css', 'app.js', 'README.md', 'DAILY_UPDATE.md']) {
  try { scan(await fs.readFile(path.join(root, rel), 'utf8'), rel); }
  catch { fail(`缺少文件：${rel}`); }
}

if (errors.length) {
  console.error(`检查未通过（${errors.length}项）：\n${errors.map(e => `- ${e}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: 'ok', scenes: 62, mainTools: 338, supplemental: 48, media: 34, excludedTests: 2, dailyProjects: dailyCount, warningCount: warnings.length }));
}
if (warnings.length) console.log([...new Set(warnings)].slice(0, 12).map(x => `提示：${x}`).join('\n'));

