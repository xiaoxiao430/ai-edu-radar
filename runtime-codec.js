/* JSON-only runtime format: shared strings and object field names, with lossless decoding. */
(function (root, factory) {
  const codec = factory();
  if (typeof module === 'object' && module.exports) module.exports = codec;
  else root.RADAR_RUNTIME_CODEC = codec;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'ai-edu-radar-runtime';
  const SCHEMA_VERSION = 1;
  const MAX_DEPTH = 256;

  function encode(value) {
    const frequencies = new Map();
    function count(item, depth) {
      if (depth > MAX_DEPTH) throw new Error('运行资料层级过深。');
      if (typeof item === 'string') frequencies.set(item, (frequencies.get(item) || 0) + 1);
      else if (Array.isArray(item)) for (const child of item) count(child, depth + 1);
      else if (item && typeof item === 'object') for (const child of Object.values(item)) count(child, depth + 1);
      else if (item !== null && typeof item !== 'boolean' && !(typeof item === 'number' && Number.isFinite(item))) throw new Error('运行资料只能包含JSON值。');
    }
    count(value, 0);
    const strings = [], stringIds = new Map(), shapes = [], shapeIds = new Map();
    for (const [text, occurrences] of frequencies) {
      const literalLength = JSON.stringify(text).length;
      const referenceLength = String(strings.length).length + 4;
      if (occurrences > 1 && (literalLength - referenceLength) * occurrences > literalLength + 1) {
        stringIds.set(text, strings.length);
        strings.push(text);
      }
    }
    function pack(item) {
      if (typeof item === 'string') return stringIds.has(item) ? [0, stringIds.get(item)] : item;
      if (Array.isArray(item)) return [1, ...item.map(pack)];
      if (item && typeof item === 'object') {
        const keys = Object.keys(item), signature = JSON.stringify(keys);
        if (!shapeIds.has(signature)) {
          shapeIds.set(signature, shapes.length);
          shapes.push(keys);
        }
        return [shapeIds.get(signature) + 2, ...keys.map(key => pack(item[key]))];
      }
      return item;
    }
    const data = pack(value);
    return { format: FORMAT, schemaVersion: SCHEMA_VERSION, strings, shapes, data };
  }

  function decode(payload) {
    const invalid = () => { throw new Error('运行资料格式无效，请重新读取公开资料。'); };
    if (!payload || payload.format !== FORMAT || payload.schemaVersion !== SCHEMA_VERSION) throw new Error('运行资料版本不受支持，请刷新页面。');
    const { strings, shapes } = payload;
    if (!Array.isArray(strings) || !strings.every(item => typeof item === 'string') || !Array.isArray(shapes)) invalid();
    for (const keys of shapes) {
      if (!Array.isArray(keys) || !keys.every(key => typeof key === 'string') || new Set(keys).size !== keys.length) invalid();
    }
    function unpack(item, depth) {
      if (depth > MAX_DEPTH) invalid();
      if (!Array.isArray(item)) {
        if (item === null || typeof item === 'string' || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) return item;
        return invalid();
      }
      const tag = item[0];
      if (!Number.isSafeInteger(tag) || tag < 0) invalid();
      if (tag === 0) {
        const index = item[1];
        if (item.length !== 2 || !Number.isSafeInteger(index) || index < 0 || index >= strings.length) invalid();
        return strings[index];
      }
      if (tag === 1) return item.slice(1).map(child => unpack(child, depth + 1));
      const keys = shapes[tag - 2];
      if (!keys || item.length !== keys.length + 1) invalid();
      const result = {};
      keys.forEach((key, index) => {
        const value = unpack(item[index + 1], depth + 1);
        // Preserve even a JSON "__proto__" key as data, without changing prototypes.
        if (key === '__proto__') Object.defineProperty(result, key, { value, enumerable: true, writable: true, configurable: true });
        else result[key] = value;
      });
      return result;
    }
    return unpack(payload.data, 0);
  }

  return Object.freeze({ schemaVersion: SCHEMA_VERSION, encode, decode });
});
