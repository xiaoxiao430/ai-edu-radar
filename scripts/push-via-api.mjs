#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 使用gh既有认证与Git数据库API传送正常快进提交；不读取凭据、不使用git网络、不force。
export function parseIdentity(value) {
  const match = value.match(/^(.*) <([^<>]*)> (-?\d+) ([+-])(\d{2})(\d{2})$/);
  if (!match) throw new Error('提交作者或提交者格式不受支持。');
  const [, name, email, seconds, sign, hh, mm] = match;
  const offset = (Number(hh) * 60 + Number(mm)) * (sign === '+' ? 1 : -1);
  const wallTime = new Date(Number(seconds) * 1000 + offset * 60000).toISOString().slice(0, 19);
  return { name, email, date: `${wallTime}${sign}${hh}:${mm}` };
}

export function parseCommit(buffer) {
  const text = buffer.toString('utf8');
  if (!Buffer.from(text).equals(buffer)) throw new Error('仅支持UTF-8提交信息。');
  const split = text.indexOf('\n\n');
  if (split < 0) throw new Error('提交对象格式错误。');
  const result = { parents: [], message: text.slice(split + 2) };
  for (const line of text.slice(0, split).split('\n')) {
    const space = line.indexOf(' '), key = line.slice(0, space), value = line.slice(space + 1);
    if (key === 'parent') result.parents.push(value);
    else if (key === 'tree') result.tree = value;
    else if (key === 'author' || key === 'committer') result[key] = parseIdentity(value);
    else throw new Error(`提交含不支持的扩展头${key || 'continuation'}；为保证SHA不变停止。`);
  }
  if (!result.tree || !result.author || !result.committer) throw new Error('提交缺少必要元数据。');
  return result;
}

export async function pushViaApi(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const repo = options.repo || 'xiaoxiao430/ai-edu-radar';
  const branch = options.branch || 'main';
  const localRef = options.localRef || 'HEAD';
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('repo应为owner/name。');
  const stats = { blobs: 0, trees: 0, commits: 0 };
  const run = (command, args, input) => new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [], err = [];
    let size = 0, ended = false;
    const timer = setTimeout(() => child.kill('SIGTERM'), 60000);
    child.stdout.on('data', value => { size += value.length; if (size > 150 * 1024 * 1024) child.kill('SIGTERM'); else out.push(value); });
    child.stderr.on('data', value => err.push(value));
    child.on('error', error => { if (ended) return; ended = true; clearTimeout(timer); reject(new Error(`${command}执行失败：${error.message}`)); });
    child.on('close', (code, signal) => {
      if (ended) return; ended = true; clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${command}执行未完成${signal ? `（${signal}）` : ''}：${Buffer.concat(err).toString('utf8').slice(0, 1400)}`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
  const gitBuffer = (args) => run('git', args);
  const git = async (args) => (await gitBuffer(args)).toString('utf8').trim();
  const api = async (method, endpoint, body) => {
    const args = ['api', '--hostname', 'github.com', '--method', method, '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2026-03-10', endpoint];
    if (body !== undefined) args.push('--input', '-');
    const data = await run('gh', args, body === undefined ? undefined : JSON.stringify(body));
    return JSON.parse(data.toString('utf8'));
  };
  await git(['check-ref-format', `refs/heads/${branch}`]);
  if (await git(['rev-parse', '--show-object-format']) !== 'sha1') throw new Error('GitHub Git数据库API需要SHA-1仓库。');
  const target = await git(['rev-parse', '--verify', '--end-of-options', `${localRef}^{commit}`]);
  const refEndpoint = `repos/${repo}/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
  const updateEndpoint = `repos/${repo}/git/refs/heads/${branch.split('/').map(encodeURIComponent).join('/')}`;
  const remote = (await api('GET', refEndpoint)).object?.sha;
  if (!/^[0-9a-f]{40}$/.test(remote || '')) throw new Error('远端分支不存在或不是有效提交。');
  if (remote === target) return { status: 'up-to-date', repo, branch, sha: target, ...stats };
  try { await git(['cat-file', '-e', `${remote}^{commit}`]); }
  catch { throw new Error('当前本地仓库缺少远端祖先对象；请使用保留该历史的--cwd，不会尝试git网络或强制覆盖。'); }
  try { await git(['merge-base', '--is-ancestor', remote, target]); }
  catch { throw new Error('远端不是本地目标的祖先，禁止非快进或force更新。'); }
  const commits = (await git(['rev-list', '--reverse', '--topo-order', `${remote}..${target}`])).split('\n').filter(Boolean);
  const parsed = new Map();
  // 所有提交先预检；签名、非UTF-8或扩展头在任何写API之前停止。
  for (const sha of commits) parsed.set(sha, parseCommit(await gitBuffer(['cat-file', 'commit', sha])));
  if (options.dryRun) return { status: 'dry-run', repo, branch, remoteSha: remote, targetSha: target, pendingCommits: commits.length, metadata: commits.map(sha => ({ sha, tree: parsed.get(sha).tree, parents: parsed.get(sha).parents, author: parsed.get(sha).author, committer: parsed.get(sha).committer })) };

  const treeCache = new Map(), uploadedBlobs = new Map(), uploadedTrees = new Map();
  const listTree = async sha => {
    if (!sha) return new Map();
    if (treeCache.has(sha)) return treeCache.get(sha);
    const raw = await gitBuffer(['ls-tree', '-z', sha]);
    const text = raw.toString('utf8');
    if (!Buffer.from(text).equals(raw)) throw new Error('API不支持非UTF-8文件名。');
    const entries = new Map();
    for (const line of text.split('\0').filter(Boolean)) {
      const m = line.match(/^([0-7]{6}) (blob|tree|commit) ([0-9a-f]{40})\t([\s\S]+)$/);
      if (!m) throw new Error('无法读取本地tree对象。');
      entries.set(m[4], { mode: m[1], type: m[2], sha: m[3] });
    }
    treeCache.set(sha, entries); return entries;
  };
  const ensureBlob = async sha => {
    if (!uploadedBlobs.has(sha)) uploadedBlobs.set(sha, (async () => {
      const content = await gitBuffer(['cat-file', 'blob', sha]);
      // 文本按原字节无损转UTF-8，缩小请求；二进制继续使用Base64。
      const utf8 = content.toString('utf8');
      const payload = Buffer.from(utf8).equals(content) ? { content: utf8, encoding: 'utf-8' } : { content: content.toString('base64'), encoding: 'base64' };
      const result = await api('POST', `repos/${repo}/git/blobs`, payload);
      if (result.sha !== sha) throw new Error(`blob SHA不一致：${sha}`);
      stats.blobs++; return sha;
    })());
    return uploadedBlobs.get(sha);
  };
  const ensureTree = async (sha, base) => {
    if (sha === base) return sha;
    if (uploadedTrees.has(sha)) return uploadedTrees.get(sha);
    const pending = (async () => {
      const current = await listTree(sha), previous = await listTree(base), entries = [];
      // 逐层处理目录替换、删除与文件模式，避免扁平path的文件/目录冲突。
      for (const [name, value] of current) {
        const before = previous.get(name);
        if (before?.sha === value.sha && before.mode === value.mode && before.type === value.type) continue;
        if (value.type === 'blob') await ensureBlob(value.sha);
        if (value.type === 'tree') await ensureTree(value.sha, before?.type === 'tree' ? before.sha : undefined);
        entries.push({ path: name, ...value });
      }
      for (const [name, value] of previous) if (!current.has(name)) entries.push({ path: name, mode: value.mode, type: value.type, sha: null });
      const result = await api('POST', `repos/${repo}/git/trees`, { ...(base ? { base_tree: base } : {}), tree: entries });
      if (result.sha !== sha) throw new Error(`tree SHA不一致：预期${sha}，实际${result.sha}；未更新分支。`);
      stats.trees++; return sha;
    })();
    uploadedTrees.set(sha, pending); return pending;
  };
  for (const sha of commits) {
    const commit = parsed.get(sha);
    const parentTree = commit.parents.length ? await git(['rev-parse', `${commit.parents[0]}^{tree}`]) : undefined;
    await ensureTree(commit.tree, parentTree);
    const result = await api('POST', `repos/${repo}/git/commits`, commit);
    if (result.sha !== sha) throw new Error(`commit SHA不一致：预期${sha}，实际${result.sha}；未更新分支。`);
    stats.commits++;
  }
  const beforeUpdate = (await api('GET', refEndpoint)).object.sha;
  if (beforeUpdate !== remote) throw new Error('上传期间远端分支已变化，停止更新；请重新核对后再试。');
  await api('PATCH', updateEndpoint, { sha: target, force: false });
  const after = (await api('GET', refEndpoint)).object.sha;
  if (after !== target) throw new Error('远端分支未保持在目标提交；请核对并发更新。');
  return { status: 'pushed', repo, branch, previousSha: remote, sha: target, ...stats };
}

function cliOptions(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') { result.dryRun = true; continue; }
    if (arg === '--help' || arg === '-h') { result.help = true; continue; }
    const names = { '--repo': 'repo', '--branch': 'branch', '--local-ref': 'localRef', '--localRef': 'localRef', '--cwd': 'cwd' };
    if (!names[arg] || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`未知或缺少参数：${arg}`);
    result[names[arg]] = args[++i];
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = cliOptions(process.argv.slice(2));
    if (options.help) console.log('node scripts/push-via-api.mjs [--repo owner/name] [--branch main] [--local-ref HEAD] [--cwd git-directory] [--dry-run]\n使用gh既有认证；仅正常快进；不读取token、不force、不使用git网络。');
    else console.log(JSON.stringify(await pushViaApi(options)));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
