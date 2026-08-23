import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCodeBuddyModels } from './models-service.js';

test('normalizes CodeBuddy model credits and reasoning capabilities', () => {
  const models = normalizeCodeBuddyModels([
    {
      id: 'gpt-5.5',
      name: 'GPT-5.5',
      credits: 'x0.79 credits',
      supportsReasoning: true,
      reasoning: {
        supportedEfforts: ['low', { id: 'max' }, 'unsupported'],
        defaultEffort: 'high',
      },
    },
  ]);

  assert.deepEqual(models, [{
    id: 'gpt-5.5',
    label: 'GPT-5.5',
    description: undefined,
    credits: 'x0.79 credits',
    reasoningSupported: true,
    supportedEfforts: ['low', 'max'],
    defaultEffort: 'high',
  }]);
});

test('drops invalid model rows', () => {
  assert.deepEqual(normalizeCodeBuddyModels([null, {}, { id: '  ' }, { id: 'valid' }]), [{
    id: 'valid',
    label: 'valid',
    description: undefined,
    credits: undefined,
  }]);
});
