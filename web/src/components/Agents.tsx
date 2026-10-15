/**
 * Settings → Agents: AI assistants (Hermes, Claude, Codex…) that look after
 * a person's practice for them. Adding one gives a message to paste into
 * the agent's chat. It carries a one-time code, never a key: the agent
 * trades the code for its own key and installs the ZenPort skill itself.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AgentConnectDto, AgentDto } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { ago } from '../social.tsx';
import { Icon, Sheet, Switch } from './ui.tsx';

export function AgentsSection() {
  const agents = useApi<AgentDto[]>('/api/agents');
  const [adding, setAdding] = useState(false);
  const [brief, setBrief] = useState<AgentConnectDto | null>(null);
  const list = agents.data ?? [];
  const reload = agents.reload;

  // While a code waits, watch for the agent to redeem it.
  const waiting = brief !== null || list.some((a) => a.codeExpiresAt);
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => void reload(), 4000);
    return () => window.clearInterval(t);
  }, [waiting, reload]);

  // Connected since this message was made (a reconnect counts only once redeemed).
  const live = brief ? list.find((a) => a.id === brief.agent.id) : undefined;
  const connectedNow = !!live?.connected && live.connectedAt !== brief?.agent.connectedAt;

  return (
    <section className="section" aria-labelledby="s-agents">
      <div className="section-head">
        <h2 id="s-agents">Agents</h2>
      </div>
      <div className="card settings-card agents-card">
        <p className="agents-lede">
          Let your AI assistant see what is planned today, find something in your library, log a sit
          and keep your streak - from its own chat. It gets a key of its own, never your password.
        </p>
        {list.length > 0 && (
          <ul className="agents-list">
            {list.map((a) => (
              <AgentRow
                key={a.id}
                agent={a}
                onChanged={() => void reload()}
                onBrief={(b) => {
                  setBrief(b);
                  void reload();
                }}
              />
            ))}
          </ul>
        )}
        {adding ? (
          <AddAgent
            onCancel={() => setAdding(false)}
            onCreated={(b) => {
              setAdding(false);
              setBrief(b);
              void reload();
            }}
          />
        ) : (
          list.length < 10 && (
            <button className="btn btn-ghost agents-add" onClick={() => setAdding(true)}>
              <Icon name="plug" size={15} /> Connect an agent
            </button>
          )
        )}
      </div>
      {brief && (
        <BriefSheet brief={brief} connected={!!connectedNow} onClose={() => setBrief(null)} />
      )}
    </section>
  );
}

function AgentRow({
  agent,
  onChanged,
  onBrief,
}: {
  agent: AgentDto;
  onChanged: () => void;
  onBrief: (b: AgentConnectDto) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const status = agent.connected
    ? agent.lastSeenAt
      ? `Connected · last here ${ago(agent.lastSeenAt)}`
      : 'Connected'
    : agent.codeExpiresAt
      ? 'Waiting for it to connect'
      : 'Not connected';

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="agent-row">
      <div className="agent-head">
        <span className={`agent-dot${agent.connected ? ' on' : ''}`} aria-hidden="true" />
        <div className="grow">
          <strong>{agent.name}</strong>
          <span className="sub">{status}</span>
        </div>
        <button
          className="btn btn-sm btn-quiet"
          disabled={busy}
          onClick={() =>
            void run(async () =>
              onBrief(await api.post<AgentConnectDto>(`/api/agents/${agent.id}/connect`)),
            )
          }
        >
          {agent.connected ? 'Reconnect' : 'Connect'}
        </button>
      </div>
      <div className="set-switch">
        <div>
          <div className="set-switch-t">Journal</div>
          <div className="set-switch-h">Read and write your journal when you ask it to.</div>
        </div>
        <Switch
          checked={agent.journal}
          label={`${agent.name} may use the journal`}
          onChange={(v) =>
            void run(async () => {
              await api.patch(`/api/agents/${agent.id}`, { journal: v });
              onChanged();
            })
          }
        />
      </div>
      {confirm ? (
        <div className="manage-confirm">
          <p>Remove {agent.name}? Its key stops working at once.</p>
          <div className="rf-actions">
            <button className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Keep
            </button>
            <button
              className="btn btn-danger"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api.del(`/api/agents/${agent.id}`);
                  onChanged();
                })
              }
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-sm btn-quiet agent-remove" onClick={() => setConfirm(true)}>
          Remove
        </button>
      )}
    </li>
  );
}

function AddAgent({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (b: AgentConnectDto) => void;
}) {
  const [name, setName] = useState('');
  const [journal, setJournal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.post<AgentConnectDto>('/api/agents', { name: name.trim(), journal }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
      setBusy(false);
    }
  };
  return (
    <form
      className="agent-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void create();
      }}
    >
      <label className="ai-field">
        <span className="review-label">Its name</span>
        <input
          autoFocus
          maxLength={60}
          placeholder="Hermes, Claude…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="set-switch">
        <div>
          <div className="set-switch-t">Journal</div>
          <div className="set-switch-h">
            Let it read and write your journal when you ask. Off unless you choose it.
          </div>
        </div>
        <Switch checked={journal} onChange={setJournal} label="May use the journal" />
      </div>
      {error && <p className="error-note">{error}</p>}
      <div className="rf-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !name.trim()}>
          {busy ? 'Making…' : 'Get the message'}
        </button>
      </div>
    </form>
  );
}

function BriefSheet({
  brief,
  connected,
  onClose,
}: {
  brief: AgentConnectDto;
  connected: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(brief.brief);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the text stays selectable */
    }
  }, [brief.brief]);
  const until = new Date(brief.expiresAt).toLocaleString(undefined, {
    weekday: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <Sheet title={`Connect ${brief.agent.name}`} onClose={onClose} labelId="agent-brief">
      <div className={`link-art${connected ? ' agent-art-on' : ''}`} aria-hidden="true">
        <Icon name={connected ? 'check' : 'plug'} size={26} />
      </div>
      {connected ? (
        <p className="sit-sheet-lede" role="status">
          {brief.agent.name} is connected. It has its key and the ZenPort skill.
        </p>
      ) : (
        <p className="sit-sheet-lede">
          Paste this into {brief.agent.name}&apos;s chat. It holds a one-time code, not a key: the
          agent uses it to get its own key and the ZenPort skill. It works once, until {until}.
        </p>
      )}
      {!connected && (
        <textarea
          className="link-field agent-brief"
          readOnly
          rows={8}
          value={brief.brief}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Message for your agent"
        />
      )}
      <div className="rf-actions">
        {connected ? (
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => void copy()}>
            <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy message'}
          </button>
        )}
      </div>
      {!connected && (
        <p className="hint agent-wait" role="status">
          This says connected once {brief.agent.name} has its key.
        </p>
      )}
    </Sheet>
  );
}
