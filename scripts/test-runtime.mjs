import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codec = createRequire(import.meta.url)('../runtime-codec.js');
const read = async rel => JSON.parse(await fs.readFile(path.join(root, rel), 'utf8'));
const repeated = '重复长文字与特殊字符 </script> \\ " \u2028 \u2029';
const fixture = JSON.parse(JSON.stringify({
  title: repeated,
  null: null,
  empty: [[], {}],
  primitives: [false, true, 0, -3, 1.25, '', 9007199254740991],
  items: [{ title: repeated, nested: { title: repeated } }, { title: repeated, nested: { title: repeated } }],
  unusualKeys: JSON.parse('{"__proto__":{"value":"保留原字段"},"constructor":"普通文字","prototype":null}')
}));
const fixtureDecoded = codec.decode(JSON.parse(JSON.stringify(codec.encode(fixture))));
assert.deepEqual(fixtureDecoded, fixture, 'JSON字段和值须精确还原，包括特殊键名与字符');
fixtureDecoded.items[0].nested.title = '只修改第一项';
assert.equal(fixtureDecoded.items[1].nested.title, repeated, '解码不能共享会被详情关联修改的对象');
assert.equal({}.value, undefined, 'JSON字段不能污染对象原型');
assert.throws(() => codec.decode({ ...codec.encode(fixture), schemaVersion: 999 }), /版本/);
const invalidSamples = [
  { strings: [], shapes: [], data: [0, 0] },
  { strings: [], shapes: [['field']], data: [2] },
  { strings: [], shapes: [['field', 'field']], data: [2, 1, 2] },
  { strings: [], shapes: [], data: [-1] },
  { strings: [], shapes: [], data: {} }
];
for (const item of invalidSamples) assert.throws(() => codec.decode({ format: 'ai-edu-radar-runtime', schemaVersion: 1, ...item }), /格式/);

const manifest = await read('data/manifest.json');
const expected = {
  ourteacher: await read('data/ourteacher.json'),
  tutorials: await read('data/tutorials.json'),
  teachingMap: await read('data/teaching-map.json'),
  douyinCatalog: await read('data/douyin-catalog.json'),
  manifest,
  dailies: await Promise.all(manifest.dates.map(ref => read(ref.path)))
};
const payloadText = await fs.readFile(path.join(root, 'data/runtime.json'), 'utf8');
const started = performance.now();
const decoded = codec.decode(JSON.parse(payloadText));
const parseAndDecodeMs = Number((performance.now() - started).toFixed(2));
assert.deepEqual(decoded, expected, '所有日报与参考库的所有字段、顺序、ID和值须与源JSON相同');
assert.notEqual(decoded.ourteacher.scenes[0].images, expected.ourteacher.scenes[0].images);
const seen = new WeakSet();
let uniqueObjects = 0;
function verifyIndependent(value) {
  if (!value || typeof value !== 'object') return;
  assert(!seen.has(value), '运行资料中所有对象和数组必须各自独立');
  seen.add(value);
  uniqueObjects++;
  Object.values(value).forEach(verifyIndependent);
}
verifyIndependent(decoded);
const report = { status: 'ok', allFieldsEqual: true, malformedPayloadCases: invalidSamples.length + 1, noSharedMutableObjects: true, uniqueObjects, parseAndDecodeMs, runtimeBytes: Buffer.byteLength(payloadText), dailyEditions: decoded.dailies.length, uniqueProjects: new Set(decoded.dailies.flatMap(daily => daily.projects.map(project => project.id))).size };
await fs.mkdir(path.join(root, 'qa'), { recursive: true });
await fs.writeFile(path.join(root, 'qa/performance-runtime-tests.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
