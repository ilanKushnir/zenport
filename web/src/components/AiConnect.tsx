/**
 * Connecting an AI provider: pick one, paste its key (or, for your own
 * server, its address), and ZenPort checks it with the provider before
 * keeping it - sealed on this server, never shown again. A provider already
 * connected can be switched to without pasting its key a second time.
 */
import { useState } from 'react';
import {
  AI_PROVIDERS,
  type AiProvider,
  type AiProviderInfo,
  type AiSettingsDto,
} from '@zenport/shared';
import { api } from '../api.ts';
import { useAuth } from '../App.tsx';
import { Icon } from './ui.tsx';

export const providerInfo = (p: AiProvider): AiProviderInfo =>
  AI_PROVIDERS.find((x) => x.id === p)!;

/** A small mark per provider, in the app's own colours - never their logos. */
export function ProviderMark({ provider, size = 36 }: { provider: AiProvider; size?: number }) {
  const letter = { openai: 'O', anthropic: 'A', gemini: 'G', openrouter: 'R', compatible: '' }[
    provider
  ];
  return (
    <span
      className={`ai-mark p-${provider}`}
      style={{ inlineSize: size, blockSize: size }}
      aria-hidden="true"
    >
      {provider === 'compatible' ? <Icon name="plug" size={size * 0.5} /> : letter}
    </span>
  );
}

export function ProviderConnect({
  settings,
  onConnected,
  compact = false,
}: {
  settings: AiSettingsDto | null;
  onConnected: (s: AiSettingsDto) => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const providers = AI_PROVIDERS.filter((p) => !p.adminOnly || isAdmin);
  const [provider, setProvider] = useState<AiProvider>(settings?.provider ?? 'openai');
  const [key, setKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = providerInfo(provider);
  const existing = settings?.connections.find((c) => c.provider === provider) ?? null;

  const connect = async (useSaved = false) => {
    setBusy(true);
    setError(null);
    try {
      const s = useSaved
        ? await api.put<AiSettingsDto>('/api/ai/settings', { provider })
        : await api.post<AiSettingsDto>('/api/ai/connect', {
            provider,
            ...(key.trim() ? { apiKey: key.trim() } : {}),
            ...(info.needsBaseUrl ? { baseUrl: baseUrl.trim() || existing?.baseUrl || '' } : {}),
          });
      setKey('');
      onConnected(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not connect.');
    } finally {
      setBusy(false);
    }
  };

  const ready = info.needsBaseUrl
    ? (baseUrl.trim() || existing?.baseUrl || '').length > 8
    : key.trim().length >= 16;

  return (
    <div className={`ai-connect${compact ? ' compact' : ''}`}>
      <div className="ai-providers" role="radiogroup" aria-label="Provider">
        {providers.map((p) => {
          const connected = settings?.connections.find((c) => c.provider === p.id);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={provider === p.id}
              className={`ai-provider${provider === p.id ? ' on' : ''}`}
              onClick={() => {
                setProvider(p.id);
                setError(null);
              }}
            >
              <ProviderMark provider={p.id} size={compact ? 30 : 36} />
              <span className="ai-provider-text">
                <span className="ai-provider-name">
                  {p.label}
                  {connected && (
                    <span className="ai-provider-on" title="Connected">
                      <Icon name="check" size={12} />
                    </span>
                  )}
                </span>
                {!compact && <span className="sub">{p.blurb}</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="ai-connect-form">
        {existing && (
          <div className="ai-saved">
            <span>
              {info.label} is connected{existing.keyHint ? ` (key ${existing.keyHint})` : ''}.
            </span>
            {!existing.active && (
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={busy}
                onClick={() => void connect(true)}
              >
                Use {info.label}
              </button>
            )}
          </div>
        )}
        {info.needsBaseUrl && (
          <label className="ai-field">
            <span className="review-label">Server address</span>
            <input
              type="url"
              inputMode="url"
              spellCheck={false}
              placeholder={existing?.baseUrl ?? 'http://ollama.lan:11434/v1'}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <span className="hint">
              Its OpenAI-compatible address, usually ending in /v1. Ollama: port 11434. LM Studio:
              port 1234.
            </span>
          </label>
        )}
        <label className="ai-field">
          <span className="review-label">
            {existing ? 'Replace the key' : info.needsKey ? 'API key' : 'API key (if it needs one)'}
          </span>
          <span className="ai-key-row">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={existing?.keyHint ? `Saved ${existing.keyHint}` : 'Paste your key'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-label={`${info.label} API key`}
            />
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !(ready || (info.needsBaseUrl && !info.needsKey))}
              onClick={() => void connect()}
            >
              {busy ? 'Checking…' : existing ? 'Reconnect' : 'Connect'}
            </button>
          </span>
        </label>
        {error && <p className="error-note">{error}</p>}
        {!compact && (
          <p className="hint">
            {info.keyUrl ? (
              <>
                Get a key at{' '}
                <a href={info.keyUrl} target="_blank" rel="noreferrer">
                  {new URL(info.keyUrl).host}
                </a>
                . It is checked with {info.label}, kept encrypted on this server and never shown
                again. Using it costs a little on your {info.label} account, only when you ask for
                something.
              </>
            ) : (
              'Nothing leaves your network: ZenPort talks only to the address you give.'
            )}
          </p>
        )}
      </div>
    </div>
  );
}

/** The model in use: a list where the provider has one, free text where it is open-ended. */
export function ModelPicker({
  settings,
  onChanged,
}: {
  settings: AiSettingsDto;
  onChanged: (s: AiSettingsDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const open = settings.provider === 'openrouter' || settings.provider === 'compatible';
  const set = async (model: string) => {
    if (!model.trim()) return;
    setBusy(true);
    try {
      onChanged(await api.put<AiSettingsDto>('/api/ai/settings', { model: model.trim() }));
      setCustom('');
    } finally {
      setBusy(false);
    }
  };
  const list = settings.models.length ? settings.models : [settings.model ?? ''];
  return (
    <div className="ai-model">
      <label className="ai-field">
        <span className="review-label">Model</span>
        <select
          value={settings.model ?? ''}
          disabled={busy}
          onChange={(e) => void set(e.target.value)}
        >
          {list.map((m, i) => (
            <option key={m} value={m}>
              {m}
              {i === 0 ? ' - recommended' : ''}
            </option>
          ))}
        </select>
      </label>
      {settings.lightModel && (
        <p className="hint ai-light">
          To spend less, simple jobs - levels, fixes, finding pictures, today&apos;s pick - run on{' '}
          <strong>{settings.lightModel}</strong>. Writing, plans and the guide use {settings.model}.
        </p>
      )}
      {open && (
        <span className="ai-key-row">
          <input
            placeholder="Or type a model name"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Model name"
          />
          <button
            type="button"
            className="btn btn-sm btn-quiet"
            disabled={busy || !custom.trim()}
            onClick={() => void set(custom)}
          >
            Use
          </button>
        </span>
      )}
    </div>
  );
}
