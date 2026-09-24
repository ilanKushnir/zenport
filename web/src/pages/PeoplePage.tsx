/**
 * People (admins only): who can use this ZenPort, and how new people get in.
 *
 * There is no public sign-up. An admin makes an invitation link - for one
 * person, working once, for a few days - and sends it however they like; the
 * link is shown only at that moment (the server keeps only its hash). The
 * same kind of link resets a forgotten password.
 */
import { useState } from 'react';
import type { AdminUserDto, InviteCreatedDto, InviteDto, Role } from '@zenport/shared';
import { api } from '../api.ts';
import { useApi } from '../hooks.ts';
import { useAuth } from '../App.tsx';
import { Avatar, ErrorNote, Icon, Sheet, Switch } from '../components/ui.tsx';
import { ago } from '../social.tsx';
import { AdminCrumb } from './AdminPage.tsx';

const linkFor = (token: string) => `${window.location.origin}/join/${token}`;

function until(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) {
    const h = Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000));
    return `${h} h left`;
  }
  return days === 1 ? '1 day left' : `${days} days left`;
}

export function PeoplePage() {
  const { user } = useAuth();
  const users = useApi<AdminUserDto[]>('/api/users');
  const invites = useApi<InviteDto[]>('/api/invites');
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState<{ title: string; token: string; expiresAt: string } | null>(
    null,
  );
  const [managing, setManaging] = useState<AdminUserDto | null>(null);

  if (user?.role !== 'admin') {
    return <ErrorNote message="Only an admin can manage people." onRetry={() => {}} />;
  }
  const open = (invites.data ?? []).filter((i) => i.status === 'open');

  return (
    <>
      <AdminCrumb here="People" />
      <div className="page-head plans-head">
        <div>
          <h1>People</h1>
          <p className="lede">
            Who practises here. Nobody can sign up on their own - send someone an invitation link.
          </p>
        </div>
        <div className="plans-head-actions">
          <button className="btn btn-primary" onClick={() => setInviting(true)}>
            <Icon name="user-plus" size={16} /> Invite someone
          </button>
        </div>
      </div>

      {open.length > 0 && (
        <section className="section" aria-labelledby="sec-open">
          <div className="section-head">
            <h2 id="sec-open">Open invitations</h2>
          </div>
          <div className="rowlist card" style={{ padding: '4px 16px' }}>
            {open.map((i) => (
              <div className="row" key={i.id}>
                <span className="invite-ic">
                  <Icon name={i.kind === 'reset' ? 'key' : 'link'} size={16} />
                </span>
                <div className="grow">
                  <div>
                    {i.kind === 'reset'
                      ? `Password reset for ${i.forUser ?? 'someone'}`
                      : (i.note ?? 'An invitation')}
                    {i.role === 'admin' && <span className="badge badge-accent">admin</span>}
                  </div>
                  <div className="sub">
                    {until(i.expiresAt)} · made {ago(i.createdAt)}
                  </div>
                </div>
                <button
                  className="btn btn-sm btn-quiet"
                  onClick={() => void api.del(`/api/invites/${i.id}`).then(invites.reload)}
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section" aria-labelledby="sec-people">
        <div className="section-head">
          <h2 id="sec-people">Everyone here</h2>
        </div>
        {users.error && <ErrorNote message={users.error} onRetry={users.reload} />}
        <div className="people-list">
          {(users.data ?? []).map((u) => (
            <button key={u.id} className="person-card" onClick={() => setManaging(u)}>
              <Avatar name={u.displayName ?? u.username} avatar={u.avatar} id={u.id} size={44} />
              <span className="grow">
                <span className="person-name">
                  {u.displayName ?? u.username}
                  {u.id === user.id && <span className="you">you</span>}
                </span>
                <span className="sub">
                  @{u.username} · joined{' '}
                  {new Date(u.createdAt).toLocaleDateString(undefined, {
                    month: 'short',
                    year: 'numeric',
                  })}
                  {u.lastActiveAt ? ` · active ${ago(u.lastActiveAt)}` : ''}
                </span>
              </span>
              <span className={`badge ${u.role === 'admin' ? 'badge-accent' : ''}`}>{u.role}</span>
            </button>
          ))}
        </div>
      </section>

      {inviting && (
        <InviteSheet
          onClose={() => setInviting(false)}
          onCreated={(c) => {
            setInviting(false);
            invites.reload();
            setLink({
              title: c.invite.note ?? 'Your invitation',
              token: c.token,
              expiresAt: c.invite.expiresAt,
            });
          }}
        />
      )}
      {link && (
        <LinkSheet
          title={link.title}
          url={linkFor(link.token)}
          expiresAt={link.expiresAt}
          onClose={() => setLink(null)}
        />
      )}
      {managing && (
        <ManageSheet
          person={managing}
          me={user.id}
          onClose={() => setManaging(null)}
          onChanged={() => {
            users.reload();
            invites.reload();
          }}
          onLink={(c) => {
            setManaging(null);
            setLink({
              title: `New password for ${managing.displayName ?? managing.username}`,
              token: c.token,
              expiresAt: c.invite.expiresAt,
            });
          }}
        />
      )}
    </>
  );
}

function InviteSheet({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: InviteCreatedDto) => void;
}) {
  const [note, setNote] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [days, setDays] = useState(7);
  const [befriend, setBefriend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const c = await api.post<InviteCreatedDto>('/api/invites', {
        note: note.trim() ? `For ${note.trim()}` : null,
        role,
        days,
        befriend,
      });
      onCreated(c);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'could not make the link');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Invite someone" onClose={onClose} labelId="invite">
      <p className="sit-sheet-lede">
        You get a link to send them. It works once, and only until it expires.
      </p>
      <div className="field">
        <label htmlFor="inv-note">Who is it for?</label>
        <input
          id="inv-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="A name, just for you to recognise it"
          maxLength={60}
        />
      </div>
      <div className="field">
        <label>They will be</label>
        <div className="seg" role="radiogroup" aria-label="Role">
          {(['member', 'admin'] as const).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={role === r}
              className={`seg-opt${role === r ? ' on' : ''}`}
              onClick={() => setRole(r)}
            >
              {r === 'member' ? 'A member' : 'An admin'}
            </button>
          ))}
        </div>
        <p className="hint">
          {role === 'member'
            ? 'Members practise, study, plan, journal and make friends. They cannot change the library or invite people.'
            : 'Admins can also change the library, types and folders, and manage people.'}
        </p>
      </div>
      <div className="field">
        <label>The link works for</label>
        <div className="seg" role="radiogroup" aria-label="Expires after">
          {[1, 7, 30].map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={days === d}
              className={`seg-opt${days === d ? ' on' : ''}`}
              onClick={() => setDays(d)}
            >
              {d === 1 ? 'A day' : d === 7 ? 'A week' : 'A month'}
            </button>
          ))}
        </div>
      </div>
      <div className="set-switch sit-switch">
        <div>
          <div className="set-switch-t">Become friends when they join</div>
          <div className="set-switch-h">You will see each other on the Friends page.</div>
        </div>
        <Switch checked={befriend} onChange={setBefriend} label="Become friends when they join" />
      </div>
      {error && <p className="error-note">{error}</p>}
      <div className="rf-actions">
        <button className="btn btn-quiet" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void create()} disabled={busy}>
          <Icon name="link" size={15} /> {busy ? 'Making…' : 'Make the link'}
        </button>
      </div>
    </Sheet>
  );
}

function LinkSheet({
  title,
  url,
  expiresAt,
  onClose,
}: {
  title: string;
  url: string;
  expiresAt: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* the field stays selectable */
    }
  };
  const share = () =>
    void navigator
      .share({ title: 'Join me on ZenPort', text: 'A quiet place to practise together:', url })
      .catch(() => {});
  return (
    <Sheet title={title} onClose={onClose} labelId="invite-link">
      <div className="link-art" aria-hidden="true">
        <Icon name="link" size={26} />
      </div>
      <p className="sit-sheet-lede">
        Send this link. It works once and until{' '}
        {new Date(expiresAt).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })}
        . It is shown only now - if it gets lost, make a new one.
      </p>
      <input
        className="link-field"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Invitation link"
      />
      <div className="rf-actions">
        {canShare && (
          <button className="btn btn-ghost" onClick={share}>
            <Icon name="share" size={15} /> Share
          </button>
        )}
        <button className="btn btn-primary" onClick={() => void copy()}>
          <Icon name={copied ? 'check' : 'copy'} size={15} /> {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
    </Sheet>
  );
}

function ManageSheet({
  person,
  me,
  onClose,
  onChanged,
  onLink,
}: {
  person: AdminUserDto;
  me: number;
  onClose: () => void;
  onChanged: () => void;
  onLink: (c: InviteCreatedDto) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const name = person.displayName ?? person.username;
  const self = person.id === me;
  const run = async (fn: () => Promise<unknown>, close = true) => {
    setError(null);
    try {
      await fn();
      onChanged();
      if (close) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'that did not work');
    }
  };
  return (
    <Sheet title={name} onClose={onClose} labelId="manage-person">
      <div className="manage-head">
        <Avatar name={name} avatar={person.avatar} id={person.id} size={56} />
        <div>
          <div className="person-name">@{person.username}</div>
          <div className="sub">
            {person.role === 'admin' ? 'Admin' : 'Member'}
            {person.lastActiveAt ? ` · active ${ago(person.lastActiveAt)}` : ''}
          </div>
        </div>
      </div>
      <div className="manage-actions">
        <button
          className="manage-row"
          onClick={() =>
            void run(() =>
              api.patch(`/api/users/${person.id}`, {
                role: person.role === 'admin' ? 'member' : 'admin',
              }),
            )
          }
        >
          <Icon name="settings" size={18} />
          <span className="grow">
            {person.role === 'admin' ? 'Make a member' : 'Make an admin'}
            <span className="sub">
              {person.role === 'admin'
                ? 'Keeps practising; stops managing the library and people.'
                : 'Can change the library and manage people.'}
            </span>
          </span>
        </button>
        {!self && (
          <button
            className="manage-row"
            onClick={() =>
              void run(async () => {
                const c = await api.post<InviteCreatedDto>(`/api/users/${person.id}/reset-link`);
                onLink(c);
              }, false)
            }
          >
            <Icon name="key" size={18} />
            <span className="grow">
              Password reset link
              <span className="sub">
                For when they forgot it. Works once, for two days; signs them out everywhere.
              </span>
            </span>
          </button>
        )}
        {!self &&
          (confirmRemove ? (
            <div className="manage-confirm">
              <p>
                Remove {name}? Their practice history, plans and journal are deleted with the
                account. This cannot be undone.
              </p>
              <div className="rf-actions">
                <button className="btn btn-quiet" onClick={() => setConfirmRemove(false)}>
                  Keep
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => void run(() => api.del(`/api/users/${person.id}`))}
                >
                  Remove {name}
                </button>
              </div>
            </div>
          ) : (
            <button className="manage-row danger" onClick={() => setConfirmRemove(true)}>
              <Icon name="trash" size={18} />
              <span className="grow">
                Remove from ZenPort
                <span className="sub">Deletes the account and everything in it.</span>
              </span>
            </button>
          ))}
      </div>
      {error && <p className="error-note">{error}</p>}
    </Sheet>
  );
}
