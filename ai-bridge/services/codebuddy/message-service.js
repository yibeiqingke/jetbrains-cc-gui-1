/**
 * CodeBuddy Agent SDK streaming adapter.
 * The adapter deliberately emits the same marker protocol used by the other
 * providers so Java and the webview do not need a provider-specific renderer.
 */
import { loadCodeBuddySdk, requireSdk } from '../../utils/sdk-loader.js';
import { resolveCodeBuddyCliPath } from '../../utils/cli-path.js';

const VALID_PERMISSION_MODES = new Set(['default', 'acceptEdits', 'bypassPermissions', 'plan']);
const VALID_REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

function log(...args) {
  console.error('[CodeBuddy]', ...args);
}

function asText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (typeof value.text === 'string') return value.text;
  if (typeof value.thinking === 'string') return value.thinking;
  if (Array.isArray(value.content)) return value.content.map(asText).filter(Boolean).join('');
  return '';
}

function emitMessage(message) {
  process.stdout.write(`[MESSAGE] ${JSON.stringify(message)}\n`);
}

function emitDelta(marker, value) {
  if (value) process.stdout.write(`[${marker}] ${JSON.stringify(value)}\n`);
}

function getStreamEventText(event) {
  const delta = event?.delta || event?.content_block || event?.data;
  if (!delta) return { text: '', thinking: '' };
  if (delta.type === 'text_delta' || delta.type === 'text') {
    return { text: asText(delta), thinking: '' };
  }
  if (delta.type === 'thinking_delta' || delta.type === 'thinking') {
    return { text: '', thinking: asText(delta) };
  }
  return { text: '', thinking: '' };
}

function normalizePermissionMode(value) {
  return VALID_PERMISSION_MODES.has(value) ? value : 'default';
}

export function normalizeReasoningEffort(value) {
  const effort = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return VALID_REASONING_EFFORTS.has(effort) ? effort : '';
}

export function buildQueryOptions({ cwd, permissionMode, model, sessionId, reasoningEffort }) {
  const mode = normalizePermissionMode(permissionMode);
  const options = {
    cwd: cwd && cwd.trim() ? cwd : process.cwd(),
    permissionMode: mode,
    allowDangerouslySkipPermissions: mode === 'bypassPermissions',
    settingSources: ['user', 'project', 'local'],
    includePartialMessages: true,
    persistSession: true,
    maxTurns: 1000,
  };
  const effort = normalizeReasoningEffort(reasoningEffort);
  if (effort) options.effort = effort;
  if (model && model.trim()) options.model = model.trim();
  if (sessionId && sessionId.trim()) options.resume = sessionId.trim();
  return options;
}

export async function sendMessage(
  message,
  sessionId = '',
  cwd = '',
  permissionMode = 'default',
  model = '',
  reasoningEffort = '',
) {
  let streamStarted = false;
  try {
    requireSdk('codebuddy');
    const sdk = await loadCodeBuddySdk();
    const query = sdk?.query
      || (typeof sdk?.default === 'function' ? sdk.default : sdk?.default?.query);
    if (typeof query !== 'function') {
      throw new Error('CodeBuddy Agent SDK query function not available. Please reinstall dependencies.');
    }

    const workingDirectory = cwd && cwd.trim() ? cwd : process.cwd();
    const codeBuddyCliPath = resolveCodeBuddyCliPath();
    const options = buildQueryOptions({
      cwd: workingDirectory,
      permissionMode,
      model,
      sessionId,
      reasoningEffort,
    });
    if (codeBuddyCliPath) options.pathToCodebuddyCode = codeBuddyCliPath;
    if (sessionId && sessionId.trim()) {
      log('resuming session', sessionId.trim());
    }

    process.stdout.write('[MESSAGE_START]\n[STREAM_START]\n');
    streamStarted = true;
    let currentSessionId = sessionId || '';
    let assistantText = '';

    for await (const rawMessage of query({ prompt: message || '', options })) {
      const msg = rawMessage || {};
      if (msg.type === 'system' && msg.session_id) {
        currentSessionId = msg.session_id;
        process.stdout.write(`[SESSION_ID] ${msg.session_id}\n`);
      }

      if (msg.type === 'stream_event' || msg.type === 'partial') {
        const delta = getStreamEventText(msg.event || msg);
        if (delta.text) {
          assistantText += delta.text;
          emitDelta('CONTENT_DELTA', delta.text);
        }
        if (delta.thinking) emitDelta('THINKING_DELTA', delta.thinking);
        continue;
      }

      // Preserve tool calls and tool results for the transcript. Plain text
      // assistant snapshots are already represented by CONTENT_DELTA.
      const content = msg.message?.content ?? msg.content;
      const hasToolBlock = Array.isArray(content)
        && content.some(block => block?.type === 'tool_use' || block?.type === 'tool_result');
      if (msg.type !== 'assistant' || hasToolBlock) emitMessage(msg);

      if (msg.type === 'assistant' && !hasToolBlock) {
        const text = asText(content);
        if (text && !assistantText) {
          assistantText = text;
          emitDelta('CONTENT_DELTA', text);
        }
      }

      if (msg.type === 'result') {
        const usage = msg.usage || msg.modelUsage;
        if (usage) process.stdout.write(`[USAGE] ${JSON.stringify(usage)}\n`);
      }
    }

    if (!assistantText) log('completed without a text response; tool messages were preserved');
    if (streamStarted) process.stdout.write('[STREAM_END]\n');
    process.stdout.write('[MESSAGE_END]\n');
    process.stdout.write(`${JSON.stringify({ success: true, sessionId: currentSessionId })}\n`);
  } catch (error) {
    if (streamStarted) process.stdout.write('[STREAM_END]\n');
    const payload = { success: false, error: error?.message || String(error) };
    console.error('[SEND_ERROR]', JSON.stringify(payload));
    process.stdout.write(`[SEND_ERROR] ${JSON.stringify(payload)}\n`);
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  }
}
