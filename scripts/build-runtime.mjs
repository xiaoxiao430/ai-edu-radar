import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codec = createRequire(import.meta.url)('../runtime-codec.js');
const sourceFiles = ['data/ourteacher.json', 'data/tutorials.json', 'data/teaching-map.json', 'data/douyin-catalog.json', 'data/manifest.json'];

export async function buildRuntime() {
  const sources = await Promise.all(sourceFiles.map(async rel => {
    const text = await fs.readFile(path.join(root, rel), 'utf8');
    return { rel, text, data: JSON.parse(text) };
  }));
  const [ourteacher, tutorials, teachingMap, douyinCatalog, manifest] = sources.map(source => source.data);
  if (!manifest.dates?.length || !manifest.dates.some(ref => ref.date === manifest.latestDate)) throw new Error('manifest缺少latestDate对应的日报，不能制作运行资料。');
  const dailySources = await Promise.all(manifest.dates.map(async ref => {
    if (typeof ref.path !== 'string' || !/^data\/daily\/[\w-]+\.json$/.test(ref.path)) throw new Error('日报路径格式无效。');
    const text = await fs.readFile(path.join(root, ref.path), 'utf8');
    const data = JSON.parse(text);
    if (data.date !== ref.date || !Array.isArray(data.projects)) throw new Error(`日报与日期索引不一致：${ref.path}`);
    return { rel: ref.path, text, data };
  }));
  const bundle = { ourteacher, tutorials, teachingMap, douyinCatalog, manifest, dailies: dailySources.map(source => source.data) };
  const packed = codec.encode(bundle);
  if (!isDeepStrictEqual(codec.decode(packed), bundle)) throw new Error('运行资料解码与源JSON不一致，停止构建。');
  const allSources = [...sources, ...dailySources];
  const revision = createHash('sha256').update(JSON.stringify(bundle)).digest('hex').slice(0, 16);
  const payload = { ...packed, revision };
  const output = JSON.stringify(payload) + '\n';
  const runtimePath = path.join(root, 'data/runtime.json');
  // Rename after a complete write so the local preview never reads a partial bundle.
  await fs.writeFile(runtimePath + '.tmp', output);
  await fs.rename(runtimePath + '.tmp', runtimePath);
  const sourceBytes = allSources.reduce((sum, source) => sum + Buffer.byteLength(source.text), 0);
  const report = {
    sourceBytes,
    sourceGzipBytes: allSources.reduce((sum, source) => sum + gzipSync(source.text).length, 0),
    runtimeBytes: Buffer.byteLength(output),
    runtimeGzipBytes: gzipSync(output).length,
    savedPercent: Number((100 * (1 - Buffer.byteLength(output) / sourceBytes)).toFixed(2)),
    revision,
    sourceRequests: allSources.length,
    runtimeRequests: 1,
    dailyEditions: bundle.dailies.length,
    uniqueProjects: new Set(bundle.dailies.flatMap(daily => daily.projects.map(project => project.id))).size,
    scenes: ourteacher.scenes.length,
    tools: ourteacher.tools.length,
    supplemental: ourteacher.supplemental.length,
    media: ourteacher.media.length,
    placements: teachingMap.placements.length,
    strings: packed.strings.length,
    shapes: packed.shapes.length,
    losslessRoundtrip: true
  };
  await fs.mkdir(path.join(root, 'qa'), { recursive: true });
  await fs.writeFile(path.join(root, 'qa/performance-runtime.json'), JSON.stringify(report, null, 2) + '\n');
  return { bundle, payload, report };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { report } = await buildRuntime();
  console.log(JSON.stringify({ status: 'ok', runtime: 'data/runtime.json', ...report }));
}
