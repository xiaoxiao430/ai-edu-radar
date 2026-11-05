import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const ourteacher = await read('data/ourteacher.json');
const manifest = await read('data/manifest.json');
const tutorials = await read('data/tutorials.json');
const teachingMap = await read('data/teaching-map.json');
const douyinCatalog = await read('data/douyin-catalog.json');
const latestRef = manifest.dates.find(ref => ref.date === manifest.latestDate);
if (!latestRef) throw new Error('manifest缺少latestDate对应的日报，不能制作快照。');
const latestDaily = await read(latestRef.path);
const snapshotNote = `本离线快照仅包含${manifest.latestDate}这一期精选及完整OurTeacher参考库；历史精选请打开在线网站。`;
const snapshotManifest = { ...manifest, dates: [latestRef], snapshotScope: 'latest-edition', message: snapshotNote };
const dailies = [{ ...latestDaily, selectionNote: `${latestDaily.selectionNote || ''}\n${snapshotNote}`.trim() }];
const bundle = { ourteacher, tutorials, teachingMap, douyinCatalog, manifest: snapshotManifest, dailies };
const mimeTypes = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };
const imageCache = new Map();

async function inlineImage(src) {
  if (!src || !/^\.?\/?assets\/images\//.test(src)) return src;
  const rel = src.replace(/^\.\//, '');
  if (rel.split('/').includes('..')) throw new Error(`不安全图片路径：${src}`);
  if (!imageCache.has(rel)) {
    const content = await fs.readFile(path.join(root, rel));
    const mime = mimeTypes[path.extname(rel).toLowerCase()];
    if (!mime) throw new Error(`不支持的图片类型：${src}`);
    imageCache.set(rel, `data:${mime};base64,${content.toString('base64')}`);
  }
  return imageCache.get(rel);
}

async function inlineData(value) {
  if (Array.isArray(value)) return Promise.all(value.map(inlineData));
  if (value && typeof value === 'object') {
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = typeof item === 'string' && (key === 'src' || key === 'icon') ? await inlineImage(item) : await inlineData(item);
    if(typeof value.src==='string' && /^\.?\/?assets\/images\//.test(value.src)) result.originalSrc=value.src;
    return result;
  }
  return value;
}

const embedded = await inlineData(bundle);
let html = await fs.readFile(path.join(root, 'index.html'), 'utf8');
let css = await fs.readFile(path.join(root, 'style.css'), 'utf8');
const js = await fs.readFile(path.join(root, 'app.js'), 'utf8');
css = await replaceAsync(css, /url\((['"]?)(\.?\/?assets\/images\/[^)'"\s]+)\1\)/g, async (_full, _quote, src) => `url("${await inlineImage(src)}")`);
html = await replaceAsync(html, /(<(?:img|link)\b[^>]*\b(?:src|href)=["'])(\.?\/?assets\/images\/[^"']+)(["'])/gi, async (_full, before, src, after) => `${before}${await inlineImage(src)}${after}`);

const stylesheetPattern = /<link\b(?=[^>]*\brel=["']stylesheet["'])(?=[^>]*\bhref=["'](?:\.\/)?style\.css["'])[^>]*>/i;
if (!stylesheetPattern.test(html)) throw new Error('index.html需引用style.css，才能制作离线快照。');
html = html.replace(stylesheetPattern, () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>`);
const appPattern = /<script\b[^>]*\bsrc=["'](?:\.\/)?app\.js["'][^>]*>\s*<\/script\s*>/i;
if (!appPattern.test(html)) throw new Error('index.html需引用app.js，才能制作离线快照。');
const encodedBundle = JSON.stringify(embedded).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const embeddedJs = js.replace(/<\/script/gi, '<\\/script');
html = html.replace(appPattern, () => `<script>window.RADAR_BUNDLE=${encodedBundle};window.RADAR_OFFLINE=true;</script>\n<script>${embeddedJs}</script>`);
html = html.replace(/<html\b/i, '<html data-offline-snapshot="true"');

const downloads = path.join(root, 'downloads');
await fs.mkdir(downloads, { recursive: true });
await fs.writeFile(path.join(downloads, 'ai-edu-radar.html'), html);

// 仅这些网站文件可进入公开产物；研究脚本、测试、个人状态和环境文件不会被打包。
const dist = path.join(root, 'dist');
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });
for (const rel of ['index.html', 'style.css', 'app.js', 'data', 'assets', 'downloads']) {
  await fs.cp(path.join(root, rel), path.join(dist, rel), { recursive: true });
}
await fs.writeFile(path.join(dist, '.nojekyll'), '');
console.log(JSON.stringify({ status: 'ok', snapshot: 'downloads/ai-edu-radar.html', snapshotBytes: Buffer.byteLength(html), inlinedImages: imageCache.size, offlineDailyEditions: dailies.length, onlineDailyEditions: manifest.dates.length, publishDirectory: 'dist' }));

async function replaceAsync(text, pattern, replacer) {
  const matches = [...text.matchAll(pattern)];
  const values = await Promise.all(matches.map(match => replacer(...match)));
  let i = 0;
  return text.replace(pattern, () => values[i++]);
}

