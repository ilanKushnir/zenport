# AI agents

An AI assistant (a Hermes agent, Claude Code, Codex, or anything that can make HTTP calls and keep a secret) can look after a person's practice for them: say what is planned today, suggest something from their library, log a sit they did elsewhere, mark a plan done or skipped, and keep their streak in view. Each agent acts for one person, with a key of its own.

## Connecting one

1. **Settings → Agents → Connect an agent.** Name it, and choose whether it may use your journal (off unless you turn it on).
2. **Copy the message** ZenPort shows and paste it into the agent's chat, once.
3. The agent does the rest itself:
   - trades the one-time code in the message for its key (`POST /api/agent/connect`),
   - keeps the key in its own secret store as `ZENPORT_API_KEY` (with `ZENPORT_URL`),
   - installs the ZenPort skill from `/api/agent/skill.md` (`hermes skills install <url>`, or `skills/zenport/SKILL.md` for Claude Code and Codex),
   - checks in with `GET /api/agent/me` and tells you it is connected.

The Settings screen turns to _connected_ as soon as the agent has its key.

### Why a code and not a key

The message travels through a chat (Telegram, Slack, a terminal) that keeps its history. So it carries a one-time code, not a key:

- the code is worthless once used: it works once (a retry within 10 minutes is allowed, and mints a fresh key that retires the previous one), and expires after 24 hours;
- the key itself goes from ZenPort straight to the agent over HTTPS and is never shown to anyone;
- ZenPort stores only SHA-256 hashes of codes and keys.

**Reconnect** hands out a new code. The agent's current key keeps working until the new code is used, so a running agent is never cut off by accident. **Remove** cuts it off at once.

## What the key can reach

Only `/api/agent`. The key cannot sign in, see or change the account, other people, AI provider keys, invitations or anything an admin does. `/api/agent` in turn takes no session cookie, so a browser cannot be made to call it. The journal stays closed unless the owner allows it for that agent.

| Endpoint                                          | What it does                                                                           |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/agent/me`                               | the agent, its person (name, timezone), the server version and addresses               |
| `GET /api/agent/today`                            | what is planned today, missed this week, minutes sat today, streak, the last sit       |
| `GET /api/agent/library?q=&creator=&type=&limit=` | search the library; each result links to its page in ZenPort                           |
| `GET /api/agent/items/{id}`                       | one meditation and its parts                                                           |
| `GET /api/agent/history?days=`                    | recent sits                                                                            |
| `GET /api/agent/stats`                            | totals, streaks, the last 30 days against the 30 before, the last 7 days, top teachers |
| `GET /api/agent/plans`                            | the person's plans                                                                     |
| `POST /api/agent/sits`                            | log a sit done outside ZenPort (optionally for a plan)                                 |
| `POST /api/agent/plans/{id}/done` · `/skip`       | mark a plan's day                                                                      |
| `GET` · `POST /api/agent/journal`                 | read and write the journal, when allowed                                               |

The skill served at `/api/agent/skill.md` documents each of these with its exact shapes, for this server's own addresses. It carries ZenPort's version; `GET /me` reports the running one, so an agent knows when to fetch the skill again.

## Addresses

Links an agent sends (to open a meditation) use `ZP_PUBLIC_URL`, or the address the request came in on. If ZenPort sits behind a CDN that turns away non-browser clients (Cloudflare's Bot Fight Mode answers them with 403 "error code: 1010"), set `ZP_AGENT_URL` to a direct address the agents can reach, such as `http://192.168.1.20:8484`: it becomes the agents' base URL, and the public one is given as a fallback. The connect message and the skill both tell agents to send a browser-like `User-Agent` header for the same reason.
