/** Bounded operational diagnostics. Never log event bodies, credentials or identities. */
const METHODS = new Set(['events/list', 'events/subscribe', 'events/unsubscribe']);
const REASONS = new Set(['invalid_url', 'origin_not_approved', 'dns_failed', 'non_public_address', 'timeout', 'challenge_failed', 'connection_failed', 'redirect_rejected']);
const MESSAGE_REASONS: Readonly<Record<string, string>> = {
 'Unknown event': 'unknown_event',
 'Unknown event cursor': 'unknown_cursor',
 'Webhook delivery is required': 'invalid_delivery_mode',
 'Invalid signing secret': 'invalid_signing_secret',
 'Invalid subscription lifetime': 'invalid_ttl',
 'Replay is not supported; read pending messages instead': 'replay_not_supported',
 'Unknown field': 'unknown_parameter',
 'Object required': 'invalid_object',
 'Task not found': 'task_not_found',
 'At most 5 event subscriptions': 'subscription_limit',
 'MCP event security setup is not ready': 'security_setup_unavailable',
 'Stored subscription requires security-key recovery': 'security_key_recovery_required',
 'Authenticated owner identity is required for events': 'owner_identity_required',
 'Owner access required': 'owner_access_required',
};
const PARAM_FIELDS = ['name', 'arguments', 'delivery', 'cursor', 'ttlMs', '_meta'];
const DELIVERY_FIELDS = ['mode', 'url', 'secret'];
// Exact known platform origins; short readable OpenAI-owned subdomains are also safe to identify.
const LOGGABLE_ORIGINS = new Set(['https://chatgpt.com', 'https://openai.com', 'https://api.openai.com']);
function readableManagedOrigin(url: URL): boolean {
 const suffix = url.hostname.endsWith('.chatgpt.com') ? '.chatgpt.com' : url.hostname.endsWith('.openai.com') ? '.openai.com' : null;
 if (!suffix || url.origin.length > 128) return false;
 const labels = url.hostname.slice(0, -suffix.length).split('.');
 return labels.length <= 3 && labels.every(label =>
  /^[a-z][a-z0-9-]{0,23}$/.test(label) && !label.endsWith('-') && !label.startsWith('xn--') &&
  !/^[a-f0-9]{12,}$/.test(label) && !(label.length >= 16 && /[0-9]/.test(label)) && label.length < 20);
}
function record(value: unknown): Record<string, unknown> | null {
 return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function fields(value: unknown, allowed: readonly string[]) {
 const data = record(value);
 if (!data) return { fields: [], unknown_count: 0 };
 const keys = Object.keys(data);
 return { fields: allowed.filter(key => Object.prototype.hasOwnProperty.call(data, key)), unknown_count: keys.filter(key => !allowed.includes(key)).length };
}
function callbackOrigin(value: unknown): Record<string, string> {
 if (typeof value !== 'string') return { callback_origin_class: 'invalid' };
 try {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return { callback_origin_class: 'invalid' };
  if (LOGGABLE_ORIGINS.has(url.origin)) return { callback_origin_class: 'known_openai', callback_origin: url.origin };
  const managed = url.hostname.endsWith('.chatgpt.com') || url.hostname.endsWith('.openai.com');
  if (managed && readableManagedOrigin(url)) return { callback_origin_class: 'openai_subdomain', callback_origin: url.origin };
  return { callback_origin_class: managed ? 'redacted_openai_subdomain' : 'unrecognized' };
 } catch { return { callback_origin_class: 'invalid' }; }
}
export function mcpEventDiagnostic(method: unknown, input: unknown, error?: unknown): Record<string, unknown> | null {
 if (typeof method !== 'string' || !METHODS.has(method)) return null;
 const base = { diagnostic: 'mcp_event_result', method };
 if (error === undefined) return { ...base, outcome: 'ok' };
 const err = record(error);
 const explicit = typeof err?.reason === 'string' && REASONS.has(err.reason) ? err.reason : undefined;
 const message = typeof err?.message === 'string' ? err.message : '';
 const reason = explicit ?? (Object.prototype.hasOwnProperty.call(MESSAGE_REASONS, message) ? MESSAGE_REASONS[message] : 'unclassified_error');
 const rpcCode = typeof err?.rpcCode === 'number' && [-32602, -32015].includes(err.rpcCode) ? err.rpcCode : -32600;
 const params = record(input), delivery = record(params?.delivery);
 const paramFields = fields(input, PARAM_FIELDS), deliveryFields = fields(delivery, DELIVERY_FIELDS), argumentFields = fields(params?.arguments, ['task_id']);
 return { ...base, outcome: 'error', rpc_code: rpcCode, reason,
  param_fields: paramFields.fields, param_unknown_count: paramFields.unknown_count,
  delivery_fields: deliveryFields.fields, delivery_unknown_count: deliveryFields.unknown_count,
  argument_fields: argumentFields.fields, argument_unknown_count: argumentFields.unknown_count,
  ...(delivery ? callbackOrigin(delivery.url) : {}),
 };
}
export function logMcpEventResult(method: unknown, input: unknown, error?: unknown): void {
 try {
  const diagnostic = mcpEventDiagnostic(method, input, error);
  if (diagnostic) console.warn(JSON.stringify(diagnostic));
 } catch { /* Diagnostics must never change the MCP result. */ }
}
