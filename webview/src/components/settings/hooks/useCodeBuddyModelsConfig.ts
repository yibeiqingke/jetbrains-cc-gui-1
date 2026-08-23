import { useCallback, useEffect, useRef, useState } from 'react';
import type { CodexCustomModel } from '../../../types/provider';
import { sendToJava } from '../../../utils/bridge';

interface CodeBuddyModelsPayload {
  success?: boolean;
  models?: unknown;
  error?: string;
}
let modelsCache: CodexCustomModel[] | null = null;

function normalizeModel(value: unknown): CodexCustomModel | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const model = value as Record<string, unknown>;
  const id = typeof model.id === 'string' ? model.id.trim() : '';
  if (!id) return null;
  const label = typeof model.name === 'string' && model.name.trim()
    ? model.name.trim()
    : typeof model.label === 'string' && model.label.trim()
      ? model.label.trim()
      : id;
  return {
    id,
    label,
    description: typeof model.description === 'string' ? model.description : undefined,
    __ccguiScope: model.__ccguiScope === 'project' ? 'project' : 'user',
    vendor: typeof model.vendor === 'string' ? model.vendor : undefined,
    apiKey: typeof model.apiKey === 'string' ? model.apiKey : undefined,
    maxInputTokens: typeof model.maxInputTokens === 'number' ? model.maxInputTokens : undefined,
    maxOutputTokens: typeof model.maxOutputTokens === 'number' ? model.maxOutputTokens : undefined,
    url: typeof model.url === 'string' ? model.url : undefined,
    temperature: typeof model.temperature === 'number' ? model.temperature : undefined,
    supportsToolCall: typeof model.supportsToolCall === 'boolean' ? model.supportsToolCall : undefined,
    supportsImages: typeof model.supportsImages === 'boolean' ? model.supportsImages : undefined,
    supportsReasoning: typeof model.supportsReasoning === 'boolean' ? model.supportsReasoning : undefined,
    relatedModels: model.relatedModels && typeof model.relatedModels === 'object'
      && !Array.isArray(model.relatedModels)
      ? Object.fromEntries(Object.entries(model.relatedModels)
        .filter(([, value]) => typeof value === 'string' && value.trim())) as Record<string, string>
      : undefined,
  };
}

function normalizeModels(value: unknown): CodexCustomModel[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeModel).filter((model): model is CodexCustomModel => model !== null);
}

function modelKey(model: CodexCustomModel): string {
  return JSON.stringify(model);
}

function withoutScope(model: CodexCustomModel) {
  const { __ccguiScope, label, ...rest } = model;
  return {
    ...rest,
    name: label || model.id,
  };
}

export function useCodeBuddyModelsConfig(enabled: boolean) {
  const [models, setModels] = useState<CodexCustomModel[]>(() => modelsCache ?? []);
  const modelsRef = useRef(models);
  modelsRef.current = models;

  const refresh = useCallback(() => {
    if (!enabled) return;
    sendToJava('get_codebuddy_models_config');
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    const handleModels = (json: string) => {
      try {
        const payload = JSON.parse(json) as CodeBuddyModelsPayload;
        const next = payload.success === false ? [] : normalizeModels(payload.models);
        modelsCache = next;
        setModels(next);
      } catch {
        modelsCache = [];
        setModels([]);
      }
    };

    window.updateCodeBuddyModelsConfig = handleModels;
    refresh();
    window.addEventListener('codebuddy-models-config-refresh', refresh);
    return () => {
      if (window.updateCodeBuddyModelsConfig === handleModels) {
        delete window.updateCodeBuddyModelsConfig;
      }
      window.removeEventListener('codebuddy-models-config-refresh', refresh);
    };
  }, [enabled, refresh]);

  const updateModels = useCallback((nextModels: CodexCustomModel[]) => {
    const previous = modelsRef.current;
    const previousById = new Map(previous.map((model) => [model.id, model]));
    const next = nextModels.map((model) => ({
      ...model,
      __ccguiScope: model.__ccguiScope || previousById.get(model.id)?.__ccguiScope || 'user',
    }));
    const nextById = new Map(next.map((model) => [model.id, model]));
    const changed = next.filter((model) => {
      const old = previousById.get(model.id);
      return !old || modelKey(old) !== modelKey(model);
    });
    const deletedModels = previous
      .filter((model) => !nextById.has(model.id))
      .map((model) => ({ id: model.id, __ccguiScope: model.__ccguiScope }));

    modelsCache = next;
    modelsRef.current = next;
    setModels(next);
    sendToJava(`save_codebuddy_models_config:${JSON.stringify({
      models: changed.map(withoutScope).map((model, index) => ({
        ...model,
        __ccguiScope: changed[index].__ccguiScope,
      })),
      deletedModels,
    })}`);
    window.dispatchEvent(new Event('codebuddy-models-config-changed'));
    sendToJava('get_cli_models', 'codebuddy');
  }, []);

  return { models, updateModels, refresh };
}
