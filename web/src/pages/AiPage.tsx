/**
 * AI in ZenPort: one place for the connection (which provider, which model),
 * the person's intentions, and every feature that uses them. Nothing is sent
 * to any provider until someone asks for something.
 *
 * /ai            the hub: your AI, your intentions, the features
 * /ai/setup      connect or switch a provider; ?return=… goes back after
 * /ai/intentions why you practise - read by every feature
 */
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { AiSettingsDto, IntentionsDto } from '@zenport/shared';
import { INTENTION_REASONS } from '@zenport/shared';
import { api } from '../api.ts';
import { useAuth } from '../App.tsx';
import { useApi } from '../hooks.ts';
import {
  ModelPicker,
  ProviderConnect,
  ProviderMark,
  providerInfo,
} from '../components/AiConnect.tsx';
import { IntentionsForm } from '../components/IntentionsForm.tsx';
import { ErrorNote, Icon, Switch } from '../components/ui.tsx';
import { ago } from '../social.tsx';

/** Where to go once set up: only somewhere inside the app. */
const safeReturn = (r: string | null) => (r && r.startsWith('/') && !r.startsWith('//') ? r : null);

interface Feature {
  to: string;
  icon: string;
  title: string;
  hint: string;
  admin?: boolean;
}

const FEATURES: Feature[] = [
  {
    to: '/plans?ai=1',
    icon: 'plans',
    title: 'Plan with AI',
    hint: 'A path of practice and study from your library, around your time.',
  },
];

export function AiPage() {
  const ai = useApi<AiSettingsDto>('/api/ai/settings');
  const intentions = useApi<IntentionsDto | null>('/api/me/intentions');
  const { user } = useAuth();
  const s = ai.data;
  const i = intentions.data;
  const features = FEATURES.filter((f) => !f.admin || user?.role === 'admin');

  const share = async (enabled: boolean) => {
    await api.put('/api/ai/sharing', { enabled }).catch(() => {});
    ai.reload();
  };

  return (
    <>
      <div className="page-head ai-head">
        <span className="admin-kicker">
          <Icon name="sparkle" size={14} /> AI
        </span>
        <h1>Your AI companion</h1>
        <p className="lede">
          Your own AI, working with your library, your practice and what matters to you. Nothing is
          sent anywhere until you ask for something.
        </p>
      </div>

      {ai.error && <ErrorNote message={ai.error} onRetry={ai.reload} />}

      <section className="ai-cards" aria-label="Your AI and intentions">
        <div className="ai-card">
          <div className="ai-card-head">
            {s?.provider ? (
              <ProviderMark provider={s.provider} />
            ) : (
              <span className="ai-mark p-none">
                <Icon name="sparkle" size={18} />
              </span>
            )}
            <div className="grow">
              <h2>Your AI</h2>
              <p className="sub">
                {!s
                  ? 'Checking…'
                  : s.provider
                    ? `${providerInfo(s.provider).label} · ${s.model}`
                    : s.sharedBy
                      ? `Using ${s.sharedBy}'s, shared with everyone here`
                      : 'Not set up yet'}
              </p>
            </div>
          </div>
          {s && !s.canUse && (
            <p className="ai-card-body">
              Connect OpenAI, Anthropic, Google Gemini, OpenRouter - or your own AI server - with
              your own key. It stays encrypted on this server.
            </p>
          )}
          {s?.configured && <ModelPicker settings={s} onChanged={() => ai.reload()} />}
          {s?.sharing !== undefined && s.configured && (
            <div className="ai-share">
              <div className="grow">
                <strong>Everyone here can use it</strong>
                <span className="sub">
                  People you invited use AI without a key of their own. They never see the key; you
                  pay for what they ask.
                </span>
              </div>
              <Switch
                checked={s.sharing}
                onChange={(v) => void share(v)}
                label="Share with everyone here"
              />
            </div>
          )}
          <Link className={`btn ${s?.canUse ? 'btn-quiet' : 'btn-primary'}`} to="/ai/setup">
            {s?.configured ? 'Change provider' : s?.sharedBy ? 'Use your own key' : 'Set up AI'}
          </Link>
        </div>

        <div className="ai-card">
          <div className="ai-card-head">
            <span className="ai-mark p-intent">
              <Icon name="heart" size={18} />
            </span>
            <div className="grow">
              <h2>Your intentions</h2>
              <p className="sub">
                {i ? `Updated ${ago(i.updatedAt ?? '')}` : 'Why you practise - a minute to answer'}
              </p>
            </div>
          </div>
          <p className="ai-card-body">
            {i && i.reasons.length > 0
              ? `For ${i.reasons
                  .map((r) => INTENTION_REASONS.find((x) => x.id === r)?.label.toLowerCase())
                  .filter(Boolean)
                  .join(', ')}.${i.hope ? ` “${i.hope}”` : ''}`
              : 'A few short answers - what brings you, what you hope for, your time. Every AI feature reads them, so its help fits you.'}
          </p>
          <Link className={`btn ${i ? 'btn-quiet' : 'btn-primary'}`} to="/ai/intentions">
            {i ? 'Edit' : 'Answer'}
          </Link>
        </div>
      </section>

      <section className="section" aria-labelledby="sec-ai-features">
        <div className="section-head">
          <h2 id="sec-ai-features">With your AI</h2>
        </div>
        <div className="ai-features">
          {features.map((f) => (
            <Link
              key={f.to}
              className="ai-feature"
              to={s?.canUse ? f.to : `/ai/setup?return=${encodeURIComponent(f.to)}`}
            >
              <span className="ai-feature-ic">
                <Icon name={f.icon} size={20} />
              </span>
              <span className="grow">
                <span className="ai-feature-t">{f.title}</span>
                <span className="sub">{f.hint}</span>
              </span>
              <Icon name="chevron-right" size={16} />
            </Link>
          ))}
        </div>
      </section>

      <p className="ai-privacy">
        <Icon name="shield" size={14} /> Each feature says what it sends before it sends it. Your
        journal is shared only when you say so, each time.
      </p>
    </>
  );
}

export function AiSetupPage() {
  const ai = useApi<AiSettingsDto>('/api/ai/settings');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const back = safeReturn(params.get('return'));
  const s = ai.data;

  const remove = async (provider: string) => {
    await api.del(`/api/ai/connections/${provider}`).catch(() => {});
    ai.reload();
  };

  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/ai">AI</Link>
        <span className="sep">/</span>
        <span aria-current="page">Set up</span>
      </nav>
      <div className="page-head">
        <h1>{s?.configured ? 'Your AI provider' : 'Set up AI'}</h1>
        <p className="lede">
          Choose a provider and paste a key from your account there. ZenPort checks it, keeps it
          encrypted on this server, and uses it only when you ask for something.
        </p>
      </div>

      {s && (
        <ProviderConnect
          settings={s}
          onConnected={(next) => {
            ai.reload();
            if (back && next.canUse) navigate(back);
          }}
        />
      )}

      {s?.configured && (
        <section className="section" aria-labelledby="sec-model">
          <div className="section-head">
            <h2 id="sec-model">Model</h2>
          </div>
          <div className="ai-card slim">
            <ModelPicker settings={s} onChanged={() => ai.reload()} />
            <p className="hint">
              The first is recommended for this provider. A larger model thinks more carefully; a
              smaller one answers faster and costs less.
            </p>
            {back ? (
              <button className="btn btn-primary" onClick={() => navigate(back)}>
                Continue
              </button>
            ) : (
              <Link className="btn btn-quiet" to="/ai">
                Done
              </Link>
            )}
          </div>
        </section>
      )}

      {s && s.connections.length > 0 && (
        <section className="section" aria-labelledby="sec-conns">
          <div className="section-head">
            <h2 id="sec-conns">Connected</h2>
          </div>
          <ul className="ai-conns">
            {s.connections.map((c) => (
              <li key={c.provider} className="ai-conn">
                <ProviderMark provider={c.provider} size={30} />
                <span className="grow">
                  <strong>{providerInfo(c.provider).label}</strong>
                  <span className="sub">
                    {c.model}
                    {c.keyHint ? ` · key ${c.keyHint}` : ''}
                    {c.baseUrl ? ` · ${c.baseUrl}` : ''}
                  </span>
                </span>
                {c.active ? (
                  <span className="ai-conn-on">In use</span>
                ) : (
                  <button
                    className="btn btn-sm btn-quiet"
                    onClick={() =>
                      void api
                        .put('/api/ai/settings', { provider: c.provider })
                        .then(() => ai.reload())
                    }
                  >
                    Use
                  </button>
                )}
                <button
                  className="icon-btn"
                  aria-label={`Remove ${providerInfo(c.provider).label}`}
                  title="Remove this key from ZenPort"
                  onClick={() => void remove(c.provider)}
                >
                  <Icon name="trash" size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function IntentionsPage() {
  const intentions = useApi<IntentionsDto | null>('/api/me/intentions');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const back = safeReturn(params.get('return'));
  return (
    <>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link to="/ai">AI</Link>
        <span className="sep">/</span>
        <span aria-current="page">Your intentions</span>
      </nav>
      <div className="page-head">
        <h1>Your intentions</h1>
        <p className="lede">
          Why you practise, and what you hope for. Plans, reviews and suggestions all start from
          here - change it whenever it changes.
        </p>
      </div>
      {intentions.loading && !intentions.data ? (
        <div className="skeleton" style={{ height: 420 }} />
      ) : (
        <div className="ai-card intent-card">
          <IntentionsForm
            key={intentions.data?.updatedAt ?? 'new'}
            initial={intentions.data ?? null}
            onSaved={() => {
              intentions.reload();
              navigate(back ?? '/ai');
            }}
          />
        </div>
      )}
    </>
  );
}
