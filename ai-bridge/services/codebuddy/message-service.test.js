import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueryOptions, normalizeReasoningEffort } from './message-service.js';

test('normalizes CodeBuddy reasoning effort and preserves max', () => {
  assert.equal(normalizeReasoningEffort(' MAX '), 'max');
  assert.equal(normalizeReasoningEffort('minimal'), 'minimal');
  assert.equal(normalizeReasoningEffort('unsupported'), '');
});

test('buildQueryOptions forwards effort, model and session resume', () => {
  const options = buildQueryOptions({
    cwd: 'C:/project',
    permissionMode: 'bypassPermissions',
    model: 'gpt-5.5',
    sessionId: 'session-1',
    reasoningEffort: 'max',
  });

  assert.equal(options.cwd, 'C:/project');
  assert.equal(options.permissionMode, 'bypassPermissions');
  assert.equal(options.allowDangerouslySkipPermissions, true);
  assert.equal(options.model, 'gpt-5.5');
  assert.equal(options.resume, 'session-1');
  assert.equal(options.effort, 'max');
});

test('omits an invalid reasoning effort instead of sending an invalid SDK option', () => {
  const options = buildQueryOptions({ reasoningEffort: 'xlarge' });
  assert.equal('effort' in options, false);
});
