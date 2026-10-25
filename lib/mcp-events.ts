import { isIP } from 'node:net';
import { ApiError, object, only, str, verifyMcpHeaders, type OwnerConfig } from './task-contract';
import { base64url, unbase64url, buffer } from './push-crypto';

/** MCP Events 2026-07-28. Only IDs leave this owner-private Site. */
export const MCP_USER_MESSAGE_EVENT = 'user_message.created';
const encoder = new TextEncoder();
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
const MAX_TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_SUBSCRIPTIONS = 5;
const MAX_ATTEMPTS = 3;
const MAX_RESPONSE_BYTES = 4096;
export type McpEventsConfig = { encryptionKey: Uint8Array; callbackOrigins: ReadonlySet<string> };
type Delivery = { url: string; secret: string; previousSecret?: string; previousSecretUntil?: number };
type Subscription = { id: string; owner_site_user_id: string; event_name: string; task_id: string | null; sealed_delivery: string; expires_at: string; created_at: string; updated_at: string };
type StoredMessage = { id: string; task_id: string; role: string; author_verified: number; author_site_user_id: string | null; historical_summary: number; created_at: string; delivery: string };
export type EventMessage = { id: unknown };
export class McpEventError extends ApiError {
 constructor(public rpcCode: number, message: string, public reason?: string) { super(rpcCode === -32015 ? 502 : 400, message); }
}

export function eventOwner(headers: Headers, config?: OwnerConfig): string {
 return verifyMcpHeaders(headers,config).userId;
}

export function mcpEventsConfig(env: { MCP_EVENTS_ENCRYPTION_KEY?: string; MCP_EVENTS_CALLBACK_ORIGINS?: string }): McpEventsConfig | null {
 try {
  const encryptionKey = unbase64url(env.MCP_EVENTS_ENCRYPTION_KEY ?? '');
  if (encryptionKey.length !== 32) return null;
  const raw: unknown = JSON.parse(env.MCP_EVENTS_CALLBACK_ORIGINS ?? '');
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 8) return null;
  const callbackOrigins = new Set<string>();
  for (const origin of raw) {
   if (typeof origin !== 'string') return null;
   const url = new URL(origin);
   // Deployment-owned exact origins only. Never permit arbitrary third-party destinations.
   if (url.origin !== origin || url.protocol !== 'https:' || url.port || url.username || url.password ||
       !(url.hostname === 'chatgpt.com' || url.hostname.endsWith('.chatgpt.com') || url.hostname === 'openai.com' || url.hostname.endsWith('.openai.com'))) return null;
   callbackOrigins.add(origin);
  }
  return { encryptionKey, callbackOrigins };
 } catch { return null; }
}

/** MCP request metadata is an envelope, never event arguments or authorization. */
function eventParams(input: unknown): Record<string, unknown> {
 const { _meta, ...params } = object(input);
 if (_meta !== undefined) object(_meta);
 return params;
}

export function mcpEventCatalog(input: unknown = {}) {
 const params = eventParams(input ?? {}); only(params, ['cursor']);
 if (params.cursor !== undefined && params.cursor !== null) throw new McpEventError(-32602, 'Unknown event cursor');
 return { events: [{
  name: MCP_USER_MESSAGE_EVENT,
  description: 'A new, authenticated owner message was committed in Task Rooms for Dots. The event contains identifiers only. Read the identified task with get_task_thread and verify the source user message before acting. Assistant replies and historical imports never emit this event.',
  delivery: ['webhook'],
  inputSchema: { type: 'object', properties: { task_id: { type: 'string', maxLength: 160, description: 'Optional exact task ID; omit to monitor all owner messages in this room.' } }, additionalProperties: false },
  payloadSchema: { type: 'object', properties: { task_id: { type: 'string' }, message_id: { type: 'string' } }, required: ['task_id', 'message_id'], additionalProperties: false },
 }] };
}

export function validateCallback(value: unknown, origins: ReadonlySet<string>): string {
 const text = str(value, 'callback URL', 2048);
 let url: URL;
 try { url = new URL(text); } catch { throw new McpEventError(-32015, 'Invalid callback URL', 'invalid_url'); }
 if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || /[\r\n\\]/.test(text)) throw new McpEventError(-32015, 'Invalid callback URL', 'invalid_url');
 if (!origins.has(url.origin)) throw new McpEventError(-32015, `Unapproved callback origin: ${url.origin}`, 'origin_not_approved');
 return url.href;
}

/** Fail closed for private, reserved, mapped and non-global addresses. */
export function isPublicAddress(address: string): boolean {
 if (isIP(address) === 4) {
  const p = address.split('.').map(Number);
  if (p.some(n => n > 255)) return false;
  const [a, b, c] = p;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
 }
 // Accept only globally routed IPv6 2000::/3; exclude transition/documentation ranges.
 if (isIP(address) !== 6) return false;
 const first = parseInt(address.split(':')[0], 16);
 return first >= 0x2000 && first < 0x3fff && !/^2001:(?:0*:|db8:|0*2:|0*10:|0*20:)/i.test(address) && !/^2002:/i.test(address);
}

type DnsResolver = (hostname: string) => Promise<string[]>;
const MAX_DNS_BYTES = 32768;
function dnsFailure(): never { throw new McpEventError(-32015, 'Callback DNS verification failed', 'dns_failed'); }
function dnsName(value: unknown): string {
 if (typeof value !== 'string') return dnsFailure();
 const name = value.toLowerCase().replace(/\.$/, '');
 if (name.length > 253 || !name.includes('.') || name.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return dnsFailure();
 return name;
}
/** Workerd versions can include CNAMEs in resolve4/resolve6. Parse typed DoH records instead. */
export function parseCallbackDnsAnswer(input: unknown, hostname: string, family: 4 | 6): string[] {
 const queryName = dnsName(hostname), type = family === 4 ? 1 : 28;
 const data = input as Record<string, unknown> | null;
 if (!data || typeof data !== 'object' || Array.isArray(data) || data.Status !== 0 || data.TC !== false || !Array.isArray(data.Question) || data.Question.length !== 1) return dnsFailure();
 const question = data.Question[0];
 if (!question || typeof question !== 'object' || question.type !== type || dnsName(question.name) !== queryName) return dnsFailure();
 const answers = data.Answer === undefined ? [] : data.Answer;
 if (!Array.isArray(answers) || answers.length > 64) return dnsFailure();
 const aliases = new Map<string, string>(), addresses: { name: string; address: string }[] = [];
 for (const answer of answers) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return dnsFailure();
  const name = dnsName(answer.name);
  if (answer.type === 5) {
   const target = dnsName(answer.data);
   if (isIP(target) || (aliases.has(name) && aliases.get(name) !== target)) return dnsFailure();
   aliases.set(name, target);
  } else if (answer.type === type) {
   if (typeof answer.data !== 'string' || isIP(answer.data) !== family) return dnsFailure();
   if (!isPublicAddress(answer.data)) throw new McpEventError(-32015, 'Callback has a non-public address', 'non_public_address');
   addresses.push({ name, address: answer.data });
  } else return dnsFailure();
 }
 let terminal = queryName;
 const visited = new Set<string>();
 while (aliases.has(terminal)) {
  if (visited.has(terminal) || visited.size >= 8) return dnsFailure();
  visited.add(terminal); terminal = aliases.get(terminal)!;
 }
 if ([...aliases.keys()].some(name => !visited.has(name)) || addresses.some(address => address.name !== terminal)) return dnsFailure();
 return addresses.map(address => address.address);
}
export async function publicCallbackAddresses(hostname: string, sender: typeof fetch = fetch): Promise<string[]> {
 // The caller first validates the exact deployment-owned callback origin. Only its hostname is queried.
 const name = dnsName(hostname);
 const query = async (family: 4 | 6) => {
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name', name); url.searchParams.set('type', family === 4 ? 'A' : 'AAAA');
  const controller = new AbortController(); const deadline = Date.now() + 3500; const timer = setTimeout(() => controller.abort(), 3500);
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
   const response = await withDeadline(sender(url.href, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/dns-json' } }), 3500);
   if (response.status !== 200 || response.redirected || !/^application\/(?:dns-json|json)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) { await response.body?.cancel().catch(() => {}); return dnsFailure(); }
   reader = response.body?.getReader(); if (!reader) return dnsFailure();
   const chunks: Uint8Array[] = []; let length = 0;
   while (true) {
    const remaining = deadline - Date.now(); if (remaining <= 0) return dnsFailure();
    const { done, value } = await withDeadline(reader.read(), remaining); if (done) break;
    length += value.length; if (length > MAX_DNS_BYTES) return dnsFailure(); chunks.push(value);
   }
   const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
   return parseCallbackDnsAnswer(JSON.parse(new TextDecoder().decode(bytes)), name, family);
  } catch (error) { if (error instanceof McpEventError) throw error; return dnsFailure(); }
  finally { clearTimeout(timer); controller.abort(); await reader?.cancel().catch(() => {}); }
 };
 const results = await Promise.all([query(4), query(6)]);
 const addresses = results.flat();
 if (!addresses.length) throw new McpEventError(-32015, 'Callback has a non-public address', 'non_public_address');
 return addresses;
}

export function signingKey(value: unknown): Uint8Array {
 if (typeof value !== 'string' || !/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new McpEventError(-32602, 'Invalid signing secret');
 try {
  const raw = atob(value.slice(6));
  if (raw.length < 24 || raw.length > 64) throw new Error();
  return Uint8Array.from(raw, c => c.charCodeAt(0));
 } catch { throw new McpEventError(-32602, 'Invalid signing secret'); }
}
export async function standardWebhookSignature(secret: string, eventId: string, timestamp: number, body: string): Promise<string> {
 const key = await crypto.subtle.importKey('raw', buffer(signingKey(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
 const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${eventId}.${timestamp}.${body}`)));
 return 'v1,' + btoa(String.fromCharCode(...signature));
}
async function digest(value: string) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))); }
function fixedEqual(a: string, b: string) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0; }
async function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
 let timer: ReturnType<typeof setTimeout> | undefined;
 try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new McpEventError(-32015, 'Callback operation timed out', 'timeout')), ms); })]); }
 finally { if (timer) clearTimeout(timer); }
}
async function responseJson(response: Response) {
 const reader = response.body?.getReader(); if (!reader) throw new McpEventError(-32015, 'Callback verification failed', 'challenge_failed');
 const chunks: Uint8Array[] = []; let length = 0;
 try { while (true) { const { done, value } = await withDeadline(reader.read(), 2000); if (done) break; length += value.length; if (length > MAX_RESPONSE_BYTES) throw new Error(); chunks.push(value); } }
 catch { await reader.cancel().catch(() => {}); throw new McpEventError(-32015, 'Callback verification failed', 'challenge_failed'); }
 const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
 try { return object(JSON.parse(new TextDecoder().decode(bytes))); } catch { throw new McpEventError(-32015, 'Callback verification failed', 'challenge_failed'); }
}

export class McpEventStore {
 constructor(private db: D1Database, private config: McpEventsConfig | null, private sender: typeof fetch = fetch, private resolve: DnsResolver = publicCallbackAddresses, private sleep: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))) {}
 private stmt(sql: string, ...args: unknown[]) { return this.db.prepare(sql).bind(...args); }
 private ready(): McpEventsConfig { if (!this.config) throw new ApiError(503, 'MCP event security setup is not ready'); return this.config; }
 private async seal(id: string, delivery: Delivery) {
  const key = await crypto.subtle.importKey('raw', buffer(this.ready().encryptionKey), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buffer(iv), additionalData: encoder.encode(id) }, key, encoder.encode(JSON.stringify(delivery))));
  return 'v1.' + base64url(iv) + '.' + base64url(ciphertext);
 }
 private async unseal(id: string, sealed: string): Promise<Delivery> {
  const parts = sealed.split('.'); if (parts.length !== 3 || parts[0] !== 'v1') throw new Error('Invalid sealed delivery');
  const key = await crypto.subtle.importKey('raw', buffer(this.ready().encryptionKey), 'AES-GCM', false, ['decrypt']);
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buffer(unbase64url(parts[1])), additionalData: encoder.encode(id) }, key, buffer(unbase64url(parts[2])));
  const data = object(JSON.parse(new TextDecoder().decode(clear))); signingKey(data.secret);
  return { url: validateCallback(data.url, this.ready().callbackOrigins), secret: data.secret as string,
    ...(typeof data.previousSecret === 'string' && typeof data.previousSecretUntil === 'number' ? { previousSecret: data.previousSecret, previousSecretUntil: data.previousSecretUntil } : {}) };
 }
 private subscriptionArgs(input: unknown, subscribe: boolean) {
  const params = eventParams(input); only(params, subscribe ? ['name', 'arguments', 'delivery', 'cursor', 'ttlMs'] : ['name', 'arguments', 'delivery']);
  if (params.name !== MCP_USER_MESSAGE_EVENT) throw new McpEventError(-32602, 'Unknown event');
  const args = object(params.arguments ?? {}); only(args, ['task_id']);
  const taskId = args.task_id === undefined ? null : str(args.task_id, 'task_id', 160);
  const delivery = object(params.delivery); only(delivery, subscribe ? ['mode', 'url', 'secret'] : ['mode', 'url']);
  if (delivery.mode !== 'webhook') throw new McpEventError(-32602, 'Webhook delivery is required');
  const url = validateCallback(delivery.url, this.ready().callbackOrigins);
  if (subscribe && params.cursor !== undefined && params.cursor !== null) throw new McpEventError(-32602, 'Replay is not supported; read pending messages instead');
  return { params, taskId, delivery, url };
 }
 private async identity(ownerId: string, url: string, taskId: string | null) { return 'sub_' + await digest(JSON.stringify([ownerId, url, MCP_USER_MESSAGE_EVENT, taskId])); }
 private async signedPost(id: string, delivery: Delivery, eventId: string, payload: unknown): Promise<Response> {
  const url = validateCallback(delivery.url, this.ready().callbackOrigins);
  const addresses = await withDeadline(this.resolve(new URL(url).hostname), 4000);
  if (!addresses.length || addresses.some(ip => !isPublicAddress(ip))) throw new McpEventError(-32015, 'Callback has a non-public address', 'non_public_address');
  // Exact deployment-owned OpenAI origin + fresh public-DNS verification, no arbitrary host or redirects.
  // Workers fetch manages TLS and its own DNS connection; never override Host or disable TLS checks.
  const body = JSON.stringify(payload); if (encoder.encode(body).length > 256 * 1024) throw new Error('Event is too large');
  const timestamp = Math.floor(Date.now() / 1000);
  let signature = await standardWebhookSignature(delivery.secret, eventId, timestamp, body);
  if (delivery.previousSecret && (delivery.previousSecretUntil ?? 0) > Date.now()) signature += ' ' + await standardWebhookSignature(delivery.previousSecret, eventId, timestamp, body);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 8000);
  try {
   // Workers does not support redirect:error. manual returns 3xx without following it.
   return await this.sender(url, { method: 'POST', redirect: 'manual', signal: controller.signal,
    headers: { 'Content-Type': 'application/json', 'webhook-id': eventId, 'webhook-timestamp': String(timestamp), 'webhook-signature': signature, 'X-MCP-Subscription-Id': id }, body });
  } finally { clearTimeout(timeout); }
 }
 async subscribe(ownerId: string, input: unknown) {
  const { params, taskId, delivery: raw, url } = this.subscriptionArgs(input, true);
  signingKey(raw.secret);
  if (taskId && !await this.stmt('SELECT id FROM tasks WHERE id=?', taskId).first()) throw new ApiError(404, 'Task not found');
  let ttl = DEFAULT_TTL;
  if (params.ttlMs !== undefined && params.ttlMs !== null) { if (!Number.isSafeInteger(params.ttlMs) || (params.ttlMs as number) <= 0) throw new McpEventError(-32602, 'Invalid subscription lifetime'); ttl = Math.min(params.ttlMs as number, MAX_TTL); }
  const id = await this.identity(ownerId, url, taskId), now = new Date().toISOString();
  const existing = await this.stmt('SELECT * FROM mcp_event_subscriptions WHERE id=? AND owner_site_user_id=?', id, ownerId).first<Subscription>();
  if (!existing) { const count = await this.stmt('SELECT COUNT(*) n FROM mcp_event_subscriptions WHERE owner_site_user_id=? AND expires_at>?', ownerId, now).first<{n: number}>(); if ((count?.n ?? 0) >= MAX_SUBSCRIPTIONS) throw new ApiError(409, 'At most 5 event subscriptions'); }
  const delivery: Delivery = { url, secret: raw.secret as string };
  if (existing) {
   try { const prior = await this.unseal(id, existing.sealed_delivery); if (prior.secret !== delivery.secret) { delivery.previousSecret = prior.secret; delivery.previousSecretUntil = Date.now() + 60000; } }
   catch { throw new ApiError(503, 'Stored subscription requires security-key recovery'); }
  }
  const challenge = base64url(crypto.getRandomValues(new Uint8Array(32)));
  let response: Response;
  try { response = await this.signedPost(id, delivery, 'verify_' + crypto.randomUUID(), { type: 'verification', challenge }); }
  catch (error) { if (error instanceof McpEventError) throw error; throw new McpEventError(-32015, 'Callback verification failed', 'connection_failed'); }
  if (!response.ok) { await response.body?.cancel().catch(() => {}); throw new McpEventError(-32015, 'Callback verification failed', response.status >= 300 && response.status < 400 ? 'redirect_rejected' : 'challenge_failed'); }
  const result = await responseJson(response);
  if (typeof result.challenge !== 'string' || !fixedEqual(result.challenge, challenge)) throw new McpEventError(-32015, 'Callback verification failed', 'challenge_failed');
  const expiresAt = new Date(Date.now() + ttl).toISOString();
  const sealed = await this.seal(id, delivery);
  await this.stmt('INSERT INTO mcp_event_subscriptions(id,owner_site_user_id,event_name,task_id,sealed_delivery,expires_at,created_at,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM mcp_event_subscriptions WHERE owner_site_user_id=? AND expires_at>?)<? OR EXISTS(SELECT 1 FROM mcp_event_subscriptions WHERE id=? AND owner_site_user_id=?) ON CONFLICT(id) DO UPDATE SET sealed_delivery=excluded.sealed_delivery,expires_at=excluded.expires_at,updated_at=excluded.updated_at WHERE mcp_event_subscriptions.owner_site_user_id=excluded.owner_site_user_id', id, ownerId, MCP_USER_MESSAGE_EVENT, taskId, sealed, expiresAt, now, now, ownerId, now, MAX_SUBSCRIPTIONS, id, ownerId).run();
  if (!await this.stmt('SELECT id FROM mcp_event_subscriptions WHERE id=? AND owner_site_user_id=?', id, ownerId).first()) throw new ApiError(409, 'At most 5 event subscriptions');
  return { id, refreshBefore: expiresAt, cursor: null, truncated: false };
 }
 async unsubscribe(ownerId: string, input: unknown) {
  const { taskId, url } = this.subscriptionArgs(input, false); const id = await this.identity(ownerId, url, taskId);
  await this.stmt('DELETE FROM mcp_event_subscriptions WHERE id=? AND owner_site_user_id=?', id, ownerId).run();
  return {};
 }
 async deliver(message: EventMessage) {
  if (!this.config || typeof message.id !== 'string') return;
  // Re-read trusted committed state; never trust a caller-supplied role, author, body or IDs.
  const row = await this.stmt('SELECT id,task_id,role,author_verified,author_site_user_id,historical_summary,created_at,delivery FROM messages WHERE id=?', message.id).first<StoredMessage>();
  if (!row || row.role !== 'user' || row.author_verified !== 1 || row.historical_summary !== 0 || !row.author_site_user_id || row.delivery !== 'pending') return;
  const now = new Date().toISOString();
  const subscriptions = (await this.stmt('SELECT * FROM mcp_event_subscriptions WHERE owner_site_user_id=? AND event_name=? AND expires_at>? AND (task_id IS NULL OR task_id=?) ORDER BY created_at ASC LIMIT ?', row.author_site_user_id, MCP_USER_MESSAGE_EVENT, now, row.task_id, MAX_SUBSCRIPTIONS).all<Subscription>()).results;
  await Promise.all(subscriptions.map(sub => this.deliverOne(sub, row)));
 }
 private async deliverOne(sub: Subscription, message: StoredMessage) {
  const eventId = 'evt_' + message.id; const claim = crypto.randomUUID();
  try {
   await this.stmt("INSERT OR IGNORE INTO mcp_event_deliveries(message_id,subscription_id,event_id,claim_id,status,attempts,created_at,updated_at) VALUES(?,?,?,?,'sending',0,?,?)", message.id, sub.id, eventId, claim, new Date().toISOString(), new Date().toISOString()).run();
   const claimed = await this.stmt('SELECT claim_id FROM mcp_event_deliveries WHERE message_id=? AND subscription_id=?', message.id, sub.id).first<{claim_id: string}>();
   if (claimed?.claim_id !== claim) return;
   const payload = { eventId, name: MCP_USER_MESSAGE_EVENT, timestamp: message.created_at, data: { task_id: message.task_id, message_id: message.id }, cursor: null };
   for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) await this.sleep(attempt === 2 ? 250 : 1000);
    const fresh = await this.stmt('SELECT * FROM mcp_event_subscriptions WHERE id=? AND owner_site_user_id=? AND expires_at>?', sub.id, message.author_site_user_id, new Date().toISOString()).first<Subscription>();
    const pending = await this.stmt("SELECT id FROM messages WHERE id=? AND delivery='pending' AND role='user' AND author_verified=1 AND historical_summary=0", message.id).first();
    if (!fresh || !pending) { await this.setDelivery(claim, 'canceled', attempt - 1); return; }
    let status = 0;
    try { const response = await this.signedPost(sub.id, await this.unseal(sub.id, fresh.sealed_delivery), eventId, payload); status = response.status; await response.body?.cancel().catch(() => {}); }
    catch { /* No endpoint, keys, response bodies, message text, or image metadata are logged. */ }
    if (status >= 200 && status < 300) { await this.setDelivery(claim, 'accepted', attempt); return; }
    if (status === 410) await this.stmt('DELETE FROM mcp_event_subscriptions WHERE id=? AND owner_site_user_id=?', sub.id, message.author_site_user_id).run();
    if (status !== 0 && status !== 408 && status !== 429 && status < 500) { await this.setDelivery(claim, 'rejected', attempt); return; }
    await this.setDelivery(claim, attempt === MAX_ATTEMPTS ? 'failed' : 'sending', attempt);
   }
  } catch { try { await this.setDelivery(claim, 'failed', 0); } catch { /* Fallback polling retains the original pending message. */ } }
 }
 private async setDelivery(claim: string, status: string, attempts: number) { await this.stmt('UPDATE mcp_event_deliveries SET status=?,attempts=?,updated_at=? WHERE claim_id=?', status, attempts, new Date().toISOString(), claim).run(); }
}
