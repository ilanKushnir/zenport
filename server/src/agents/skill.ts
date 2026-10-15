/**
 * What an agent reads: the connect brief (pasted into its chat, carrying a
 * one-time code - never a key) and the SKILL.md it installs, which documents
 * /api/agent for this server's own addresses.
 */
import type { FastifyRequest } from 'fastify';
import type { Config } from '../config.js';
import { RETRY_GRACE_MS } from './service.js';

/** A User-Agent CDN bot filters let through; agents are told to send it. */
export const AGENT_USER_AGENT = 'Mozilla/5.0 (compatible; ZenPortAgent/1.0)';

export interface AgentUrls {
  /** Where people open ZenPort (links to meditations point here). */
  appUrl: string;
  /** Where the agent should call /api/agent: the direct address when there is one. */
  baseUrl: string;
  /** /api/agent at the public address. */
  publicBaseUrl: string;
  skillUrl: string;
}

export function agentUrls(config: Config, req: FastifyRequest): AgentUrls {
  const host = req.headers.host ?? `localhost:${config.port}`;
  const appUrl = config.publicUrl ?? `${config.trustHttps ? 'https' : req.protocol}://${host}`;
  const publicBaseUrl = `${appUrl}/api/agent`;
  const baseUrl = config.agentUrl ? `${config.agentUrl}/api/agent` : publicBaseUrl;
  return { appUrl, baseUrl, publicBaseUrl, skillUrl: `${baseUrl}/skill.md` };
}

const minutes = (ms: number) => Math.round(ms / 60_000);

export function buildBrief(o: {
  agentName: string;
  ownerName: string;
  code: string;
  expiresAt: string;
  urls: AgentUrls;
}): string {
  const { baseUrl, publicBaseUrl, skillUrl } = o.urls;
  const expires = o.expiresAt.replace(/\.\d+Z$/, 'Z');
  const fallback =
    publicBaseUrl !== baseUrl
      ? `\n   If ${baseUrl} is out of reach, use ${publicBaseUrl} the same way.`
      : '';
  return `# Connect to ZenPort - ${o.agentName}

${o.ownerName} is connecting you, "${o.agentName}", to ZenPort: their meditation library and practice companion (what they sit with, their plans, streaks and history). They approved this - go ahead, no need to ask.

This message carries a ONE-TIME CONNECT CODE, not a key, so it is fine that it came through chat. Redeeming it gives you your own key directly. The code works once (a retry within ${minutes(RETRY_GRACE_MS)} minutes is fine) and expires at ${expires}.

Connect code: ${o.code}

1. Get your key:
   curl -fsS -X POST ${baseUrl}/connect \\
     -H 'content-type: application/json' -H 'user-agent: ${AGENT_USER_AGENT}' \\
     -d '{"code":"${o.code}"}'
   -> { apiKey, baseUrl, skillUrl, ... }${fallback}

2. Save apiKey as ZENPORT_API_KEY and baseUrl as ZENPORT_URL in your secret store or environment, straight from the response. Never write the key into chat or a log. It is yours alone; ${o.ownerName} can cut it off any time.

3. Install the ZenPort skill (the whole API, kept current):
   ${skillUrl}
   Hermes: hermes skills install ${skillUrl}
   Claude Code / Codex: save it as skills/zenport/SKILL.md

4. Check: GET {ZENPORT_URL}/me with  Authorization: Bearer $ZENPORT_API_KEY
   Then tell ${o.ownerName} in one line that you are connected.

If something fails:
- 401 invalid_code or code_expired: ask ${o.ownerName} for a new code (ZenPort -> Settings -> Agents -> Reconnect).
- 403 "error code: 1010": a CDN bot filter - send the user-agent header above.`;
}

export function buildSkill(o: { version: string; urls: AgentUrls }): string {
  const { baseUrl, publicBaseUrl, appUrl } = o.urls;
  const alt = publicBaseUrl !== baseUrl ? ` (public fallback: \`${publicBaseUrl}\`)` : '';
  return `---
name: zenport
description: The person's meditation practice in ZenPort - what is planned today, their streak and history, finding a meditation in their library, logging a sit, marking a plan done or skipped, and (when allowed) their practice journal. Use whenever they talk about meditating, sitting, breathing practice, their streak, a plan or course they follow, or want a meditation suggested or a reminder to sit.
version: ${o.version}
---

# ZenPort

ZenPort (v${o.version}) is the person's self-hosted meditation library and practice companion. You act for them over a small REST API made for agents. Nothing is pushed to you: ask when you need to know.

## Setup (once)

- Base URL: \`${baseUrl}\`${alt}. Kept as \`ZENPORT_URL\`.
- Key: \`ZENPORT_API_KEY\` from your secret store (you got it by redeeming a connect code). Send \`Authorization: Bearer $ZENPORT_API_KEY\` on every call. Never print or repeat the key.
- Send a normal \`User-Agent\` (e.g. \`${AGENT_USER_AGENT}\`): CDN bot filters answer bare clients with 403 "error code: 1010".
- Call \`GET /me\` once per session. When \`service.version\` differs from this skill's version, re-fetch \`${baseUrl}/skill.md\`.
- 401 \`invalid_key\` means you were disconnected or reconnected elsewhere: ask the person for a new connect code (ZenPort -> Settings -> Agents -> Reconnect). Do not retry in a loop.

## How to help

- Be gentle and brief. This is a contemplative practice: invite, never nag or guilt. One reminder is plenty.
- \`GET /today\` answers most questions ("what should I sit today?", "did I sit?", "my streak?").
- Suggest from their own library (\`GET /library\`) and include the meditation's \`url\` so they can tap it and play it in ZenPort. You cannot play audio for them.
- Log a sit (\`POST /sits\`) only when they tell you they sat outside the app (a sit played in ZenPort is recorded by ZenPort). Pass \`planId\` when it was a planned session.
- The journal is private. Read or write it only when they ask you to, and only if \`/me\` says \`agent.journal: true\`.
- Times are ISO 8601. Dates (\`YYYY-MM-DD\`) are in the person's own timezone (\`/me\` -> \`person.timezone\`).
- Errors are \`{ "error": "...", "code": "..." }\` with the usual statuses (400 bad input, 401 key, 403 not allowed, 404 not found).

## Endpoints

All paths are relative to the base URL.

### GET /me
Who you are and who you act for.
\`\`\`
{ service: { name, version }, agent: { id, name, journal }, person: { name, timezone },
  appUrl, baseUrl, publicBaseUrl, skillUrl }
\`\`\`

### GET /today
\`\`\`
{ date, timezone,
  planned: [ { planId, plan, focus: "practice"|"learning", status: "today"|"completed"|"skipped",
               meditations: [Meditation] } ],
  missed:  [ { planId, plan, date } ],          // the last 7 days, not done or skipped
  sat:     { sessions, minutes },               // today so far
  streak:  { current, longest },                // days in a row with practice
  week:    { minutes, sessions },               // the last 7 days
  lastSit: { at, title, minutes } | null }
\`\`\`

### GET /library?q=&creator=&type=&limit=
Search the library. \`q\` matches title, teacher and series; \`type\` is \`meditation\`, \`soundscape\`, \`course\` or \`talk\`; \`limit\` up to 50 (default 20). With no \`q\`, the newest additions.
\`\`\`
{ total, items: [Meditation] }
Meditation = { id, title, creator, series, type, minutes, parts, url }
\`\`\`
\`minutes\` is the whole length; \`url\` opens it in ZenPort (${appUrl}/m/<id>).

### GET /items/{id}
One meditation with its parts: \`Meditation & { parts: [ { title, minutes } ] }\`.

### GET /history?days=30
Sits, newest first (\`days\` up to 365; at most 200).
\`\`\`
{ sits: [ { id, at, meditationId, title, creator, minutes, completed } ] }
\`\`\`

### GET /stats
\`\`\`
{ timezone, totalMinutes, totalSessions, currentStreak, longestStreak,
  last30Days: { minutes, sessions }, previous30Days: { minutes, sessions },
  days: [ { date, minutes, sessions } ],         // the last 7 days
  topCreators: [ { name, minutes } ],
  learning: { totalMinutes, sessions, lessonsCompleted } }
\`\`\`
Practice (meditations, soundscapes, unguided sits) and learning (courses, talks) are counted apart: study never counts toward a streak.

### GET /plans
\`\`\`
{ plans: [ { id, name, status: "active"|"paused"|"ended", focus, intention,
             days: [0-6],            // 0 = Sunday; empty = every day
             preferredTime, targetMinutes, startDate, endDate,
             meditations: [ { id, title } ] } ] }
\`\`\`

### POST /sits
Log a sit they did outside ZenPort.
\`\`\`
{ "minutes": 20,                       // required, 1-600
  "meditationId": "...",               // optional; omit for an unguided sit
  "endedAt": "2026-10-15T07:30:00Z",   // optional, default now; within the last 60 days
  "planId": 3 }                        // optional: also marks that plan done for the sit's date
-> { sit: { id, at, meditationId, title, creator, minutes, completed } }
\`\`\`

### POST /plans/{id}/done  ·  POST /plans/{id}/skip
\`{ "date": "YYYY-MM-DD" }\` (optional, default today) -> \`{ ok: true }\`

### GET /journal?days=30   (needs agent.journal)
\`\`\`
{ entries: [ { id, at, title, body, mood, tags, meditation: { id, title } | null } ] }
\`\`\`
\`mood\` is 1-5 or null.

### POST /journal   (needs agent.journal)
\`\`\`
{ "body": "...", "title": "...", "mood": 4, "tags": ["morning"], "meditationId": "...", "sitId": 12 }
-> { id }
\`\`\`
Only \`body\` is required. Write what they asked you to write, in their words.
`;
}
