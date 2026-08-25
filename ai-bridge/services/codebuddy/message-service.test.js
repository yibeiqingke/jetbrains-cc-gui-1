import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQueryOptions,
  buildPromptWithAttachments,
  computeAssistantSnapshotDelta,
  normalizeReasoningEffort,
} from './message-service.js';

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

test('recovers each assistant snapshot turn without duplicating cumulative text', () => {
  assert.equal(computeAssistantSnapshotDelta('hello', '', ''), 'hello');
  assert.equal(computeAssistantSnapshotDelta('hello world', 'hello', 'hello'), ' world');
  assert.equal(computeAssistantSnapshotDelta('hello world', 'hello world', 'hello world'), '');
  assert.equal(computeAssistantSnapshotDelta('same', '', 'same'), '');
  assert.equal(computeAssistantSnapshotDelta('same', '', 'same', true), 'same');
  assert.equal(computeAssistantSnapshotDelta('hello world', '', 'hello'), ' world');
  assert.equal(computeAssistantSnapshotDelta('hello', 'hello world', 'hello world'), '');
});

test('keeps CodeBuddy attachments in the prompt instead of dropping them', () => {
  const prompt = buildPromptWithAttachments('inspect this', [{
    fileName: 'diagram.png',
    mediaType: 'image/png',
    data: 'aGVsbG8=',
  }]);
  assert.match(prompt, /diagram\.png/);
  assert.match(prompt, /data:image\/png;base64,aGVsbG8=/);
});
