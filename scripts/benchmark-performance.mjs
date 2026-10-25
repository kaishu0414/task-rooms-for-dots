/**
 * Local, synthetic microbenchmark. Never connects to a Site or loads a real DB.
 * Run only after source/dependency review: node scripts/benchmark-performance.mjs
 * Timings are NOT hosted API, browser, network, mobile or concurrent-user SLOs.
 */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, cpus, availableParallelism, platform, arch } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { deflateSync } from 'node:zlib';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const modules = ['task-activity', 'task-progress', 'attachment-store', 'image-upload', 'task-contract', 'task-store'];
const temporary = mkdtempSync(join(tmpdir(), 'taskrooms-synthetic-benchmark-'));
const samples = 25;
const round = value => Number(value.toFixed(3));
const scenarios = [
  { name: 'small', tasks: 20, otherMessages: 10, focusMessages: 10, focusCharacters: 256 },
  { name: 'medium', tasks: 100, otherMessages: 100, focusMessages: 100, focusCharacters: 256 },
  { name: 'larger-board', tasks: 500, otherMessages: 100, focusMessages: 100, focusCharacters: 256 },
  { name: 'long-board-previews', tasks: 500, otherMessages: 10, focusMessages: 10, focusCharacters: 256, latestCharacters: 12000, latestFill: 'あ' },
  { name: 'long-thread', tasks: 100, otherMessages: 20, focusMessages: 1000, focusCharacters: 256 },
  { name: 'long-text-thread', tasks: 20, otherMessages: 10, focusMessages: 1000, focusCharacters: 12000 },
  { name: 'long-japanese-thread', tasks: 20, otherMessages: 10, focusMessages: 1000, focusCharacters: 12000, fillCharacter: 'あ' },
];

function createDatabase(TaskStore, scenario) {
  const sql = new DatabaseSync(':memory:');
  sql.exec('PRAGMA foreign_keys=ON');
  for (const file of readdirSync(new URL('drizzle/', root)).filter(f => f.endsWith('.sql')).sort()) {
    sql.exec(readFileSync(new URL('drizzle/' + file, root), 'utf8'));
  }
  const task = sql.prepare('INSERT INTO tasks(id,client_id,title,status,summary,category,updated_at,links,last_viewed_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const message = sql.prepare('INSERT INTO messages(id,task_id,client_id,role,text,created_at,delivery,author_verified,author_site_user_id,historical_summary) VALUES(?,?,?,?,?,?,?,?,?,0)');
  const base = Date.parse('2026-01-01T00:00:00.000Z');
  let messageCount = 0;
  let pendingCount = 0;
  let unreadCount = 0;
  sql.exec('BEGIN');
  try {
    for (let t = 0; t < scenario.tasks; t++) {
      const taskId = `synthetic-task-${t}`;
      const count = t === 0 ? scenario.focusMessages : scenario.otherMessages;
      const lastTime = new Date(base + count * 1000).toISOString();
      task.run(taskId, `synthetic-client-${t}`, `Fictional topic ${t}`, ['waiting', 'working', 'backlog', 'done'][t % 4], 'Synthetic benchmark only.', 'Sample', lastTime, '[]', new Date(base + Math.floor(count / 2) * 1000).toISOString());
      for (let m = 0; m < count; m++) {
        const role = m % 2 === 0 ? 'user' : 'assistant';
        const pending = role === 'user' && m === count - 2;
        const longLatest = scenario.latestCharacters && m === count - 1;
        const text = `Synthetic message ${m}. `.padEnd(longLatest ? scenario.latestCharacters : t === 0 ? scenario.focusCharacters : 256, longLatest ? scenario.latestFill : t === 0 ? scenario.fillCharacter ?? 'x' : 'x');
        message.run(`synthetic-message-${t}-${m}`, taskId, `synthetic-message-key-${t}-${m}`, role, text, new Date(base + m * 1000).toISOString(), pending ? 'pending' : 'read', role === 'user' ? 1 : 0, role === 'user' ? 'synthetic-owner' : null);
        messageCount++;
        if (pending) pendingCount++;
        if (role === 'assistant' && m > Math.floor(count / 2)) unreadCount++;
      }
    }
    sql.exec('COMMIT');
  } catch (error) { sql.exec('ROLLBACK'); sql.close(); throw error; }
  let queries = [];
  const d1 = {
    prepare(query) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { queries.push({ query, args }); return sql.prepare(query).get(...args) ?? null; },
        async all() { queries.push({ query, args }); return { results: sql.prepare(query).all(...args) }; },
        async run() { throw new Error('Benchmark read unexpectedly attempted a write'); },
      };
    },
    async batch() { throw new Error('Benchmark read unexpectedly attempted a write batch'); },
  };
  return { sql, store: new TaskStore(d1), messageCount, pendingCount, unreadCount, reset() { queries = []; }, queries() { return queries; } };
}

async function measure(database, run, validate) {
  const times = [];
  let byteCount = 0;
  let queryCount = 0;
  let plan = [];
  let rowsReturned;
  for (let iteration = 0; iteration <= samples; iteration++) {
    database.reset();
    const start = performance.now();
    const value = await run();
    const serialized = JSON.stringify(value);
    const elapsed = performance.now() - start;
    validate(value);
    rowsReturned = Array.isArray(value?.messages) ? value.messages.length : Array.isArray(value?.tasks) ? value.tasks.length : undefined;
    byteCount = Buffer.byteLength(serialized, 'utf8');
    if (iteration === 0) {
      queryCount = database.queries().length;
      plan = database.queries().map(({ query, args }) => ({ sql: query, plan: database.sql.prepare('EXPLAIN QUERY PLAN ' + query).all(...args).map(row => row.detail) }));
    } else assert.equal(database.queries().length, queryCount);
    times.push(elapsed);
  }
  const warm = times.slice(1).sort((a, b) => a - b);
  return {
    firstReadMs: round(times[0]),
    warmMedianMs: round(warm[Math.floor(warm.length / 2)]),
    warmP95Ms: round(warm[Math.ceil(warm.length * 0.95) - 1]),
    jsonBytes: byteCount,
    d1CallsPerRead: queryCount,
    ...(rowsReturned === undefined ? {} : { rowsReturned }),
    queryPlans: plan,
  };
}

function syntheticPng(side) {
  // Deterministic noise, generated only in memory. No downloaded/user image.
  const pixels = Buffer.alloc((side * 4 + 1) * side);
  let state = 0x12345678;
  for (let y = 0; y < side; y++) for (let x = 0; x < side * 4; x++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    pixels[y * (side * 4 + 1) + x + 1] = state & 255;
  }
  function chunk(type, data) {
    const encoded = Buffer.concat([Buffer.from(type), data]);
    let crc = 0xffffffff;
    for (const byte of encoded) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, encoded, checksum]);
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(side, 0); header.writeUInt32BE(side, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
}

function measureImage(run) {
  const times = [];
  for (let i = 0; i <= samples; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  const warm = times.slice(1).sort((a, b) => a - b);
  return { firstCallMs: round(times[0]), warmMedianMs: round(warm[Math.floor(warm.length / 2)]), warmP95Ms: round(warm[Math.ceil(warm.length * 0.95) - 1]) };
}

try {
  for (const name of modules) {
    let source = readFileSync(new URL('lib/' + name + '.ts', root), 'utf8');
    for (const dependency of modules) source = source.replaceAll(`'./${dependency}'`, `'./${dependency}.mjs'`);
    writeFileSync(join(temporary, name + '.mjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  }
  const { TaskStore } = await import(pathToFileURL(join(temporary, 'task-store.mjs')).href);
  const { inspectImage } = await import(pathToFileURL(join(temporary, 'image-upload.mjs')).href);
  const { assistantImageBytes } = await import(pathToFileURL(join(temporary, 'attachment-store.mjs')).href);
  const results = [];
  let sqliteVersion;
  for (const scenario of scenarios) {
    const db = createDatabase(TaskStore, scenario);
    try {
      sqliteVersion = db.sql.prepare('SELECT sqlite_version() version').get().version;
      const board = await measure(db, async () => ({ tasks: await db.store.listTasks(), ...await db.store.mode() }), value => assert.equal(value.tasks.length, scenario.tasks));
      const validatePage = value => {
        assert.equal(value.page.limit, 100);
        assert(value.messages.length > 0 && value.messages.length <= Math.min(100, scenario.focusMessages));
        assert(Buffer.byteLength(JSON.stringify(value.messages), 'utf8') <= value.page.messageByteBudget);
        assert.equal(value.page.hasMore, !!value.page.olderCursor);
      };
      const thread = await measure(db, () => db.store.thread('synthetic-task-0'), value => {
        validatePage(value);
        assert.equal(value.messages.at(-1).id, `synthetic-message-0-${scenario.focusMessages - 1}`);
      });
      // Untimed correctness check: pagination must not silently drop history.
      const seen = new Set();
      let page = await db.store.thread('synthetic-task-0'), pageCount = 0, largestPageBytes = 0;
      while (true) {
        validatePage(page);
        pageCount++;
        largestPageBytes = Math.max(largestPageBytes, Buffer.byteLength(JSON.stringify(page), 'utf8'));
        for (const item of page.messages) { assert(!seen.has(item.id)); seen.add(item.id); }
        if (!page.page.hasMore) break;
        assert(pageCount <= scenario.focusMessages);
        page = await db.store.thread('synthetic-task-0', { before: page.page.olderCursor });
        assert.equal(page.page.isLatest, false);
      }
      assert.equal(seen.size, scenario.focusMessages);
      const pending = await measure(db, async () => ({ messages: await db.store.pending() }), value => assert.equal(value.messages.length, Math.min(200, db.pendingCount)));
      const unread = await measure(db, () => db.store.unreadCount(), value => assert.equal(value, db.unreadCount));
      results.push({ ...scenario, totalMessages: db.messageCount, totalPendingMessages: db.pendingCount, board, thread, pending, unread,
        untimedHistoryTraversal: { pages: pageCount, uniqueMessages: seen.size, largestPageJsonBytes: largestPageBytes },
        idealizedUncompressedPollingBytesPerMinute: {
          boardAt15Seconds: board.jsonBytes * 4,
          threadAt1Second: thread.jsonBytes * 60,
          threadAt5Seconds: thread.jsonBytes * 12,
        },
      });
    } finally { db.sql.close(); }
  }
  const images = [64, 1023].map(side => {
    const png = syntheticPng(side), base64 = png.toString('base64');
    assert(png.length < 4 * 1024 * 1024);
    return { side, pngBytes: png.length, base64Characters: base64.length,
      headerAndCrcValidation: measureImage(() => { const result = inspectImage(png, 'image/png'); assert.equal(result.width, side); }),
      assistantBase64DecodeAndCanonicalCheck: measureImage(() => assert.equal(assistantImageBytes(base64).length, png.length)),
    };
  });
  console.log(JSON.stringify({
    benchmark: 'Task Rooms bounded synthetic store-read benchmark',
    date: new Date().toISOString().slice(0, 10),
    runtime: { node: process.version, sqlite: sqliteVersion, platform: platform(), architecture: arch(), cpuModel: cpus()[0]?.model ?? 'unknown', availableParallelism: availableParallelism() },
    conditions: { samplesPerOperation: samples, database: 'new in-memory SQLite per scenario', fixtureData: 'generated fictional text (ASCII unless fillCharacter is set), no attachment bodies', timed: 'actual TaskStore read + row mapping + JSON.stringify', firstRead: 'first method read after in-memory seeding, NOT process/Worker cold start', network: false, remoteServices: false, concurrentClients: false, browserRendering: false, diskPersistence: false, compression: false },
    results, images,
  }, null, 2));
} finally { rmSync(temporary, { recursive: true, force: true }); }
