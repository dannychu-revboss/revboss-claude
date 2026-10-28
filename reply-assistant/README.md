# RevBoss Reply Assistant

A chat assistant for RevBoss clients. A prospect replies to LinkedIn or email outreach that
RevBoss set up, and the client asks the assistant how to answer. The assistant reads the
thread, classifies the reply against that client's **follow-up matrix**, and drafts 2-3
ready-to-send options. Each option is built from the client's templates and recommends a
specific one sheet, lead magnet, tear sheet or case study.

```
 client's browser                     server (Node)                        services
┌───────────────────┐  SSE stream  ┌───────────────────────────┐
│ chat + voice      │◄────────────►│ Claude agent loop          │──► Claude API (claude-opus-5-5)
│ "Needs a reply"   │              │  tools:                    │──► HeyReach: inbox, threads, send
│ option cards      │              │   heyreach_*  drive_*      │──► Google Drive: search, read
│ (copy / send)     │              │   present_reply_options    │
└───────────────────┘              │ per-client config + chats  │──► data/ (JSON files)
┌───────────────────┐              └───────────────────────────┘
│ admin (RevBoss)   │  matrix, templates, assets, transcripts, integrations
└───────────────────┘
```

## What's in it

| Feature | How it works |
|---|---|
| **Follow-up matrix** | Per-client scenarios: *if the reply looks like X* (example phrases, intent) → *goal* → options. Each option links a template and assets. The whole matrix goes into the system prompt, and the model must name the scenario it matched (or `none`). |
| **Templates & assets** | Per-client template library (LinkedIn/email) and asset library (one sheets, lead magnets, tear sheets, case studies). The assistant may only attach assets from the library; unknown asset ids are rejected by the server. |
| **HeyReach** | Sidebar "Needs a reply" lists threads where the prospect spoke last. The assistant can search the inbox and read full threads, including voice-note transcripts. Sending is optional per client, LinkedIn-only, and always needs a click plus a confirm. The model can't send. |
| **Google Drive** | A service account reads each client's shared collateral folders (and their subfolders). The assistant can search them and read Docs, Slides, Sheets, text files and PDFs. Admins can add Drive files to the asset library from the admin UI. |
| **Voice** | Dictation (mic button) and read-aloud. "Voice mode" sends when you stop talking and reads the answer back. Uses the browser's built-in Web Speech API (Chrome, Safari, Edge), with no extra service. |
| **Transcripts** | Every chat is saved per client, can be reopened and continued, and exports to Markdown. Admins can also upload **call transcripts** / notes / FAQs as background knowledge for a client. |
| **Access** | Each client gets a private link (`/?client=<id>#token=…`) that opens only their assistant. RevBoss admins use `ADMIN_TOKEN` at `/admin.html`. Links can be rotated. |

## Run it

Requires Node 22.18+ (it runs the TypeScript directly, with no build step).

```bash
cd reply-assistant
npm install
cp .env.example .env   # fill in ANTHROPIC_API_KEY and ADMIN_TOKEN at minimum
node --env-file=.env src/server.ts
```

- Admin: http://localhost:3000/admin.html (sign in with `ADMIN_TOKEN`)
- Demo client chat: http://localhost:3000/?client=demo#token=demo-token-change-me-0000000000

`npm test` runs the unit tests; `npm run typecheck` runs `tsc`.

## Setting up a client

1. **Admin → New client.** Fill in *Profile & integrations*: offer, audience, voice rules, calendar link, signature.
2. **HeyReach:** turn it on, then set the env var it names (e.g. `HEYREACH_KEY_ACME`) to that client's HeyReach API key and restart. Optionally limit it to specific sender account IDs.
3. **Drive:** share the client's collateral folder with the service account email (Viewer), then paste the folder link.
4. **Assets:** add one sheets, lead magnets and tear sheets (or search Drive and click *Add as asset*). Write *when to use* for each one, because the assistant relies on it.
5. **Templates**, then the **Follow-up matrix**: one scenario per reply type, each with 1-3 options pointing at a template and assets. Use the demo client's matrix as a starting point (copy it via the JSON tab).
6. **Knowledge & transcripts:** upload sales-call transcripts or pricing/FAQ notes.
7. Copy the client chat link and send it to the client.

Matrix edits apply to **new** chats. Each chat keeps the prompt it started with, so resuming
an old chat never invalidates its history.

## Notes for production

- **Storage** is JSON files in `data/` (git-ignored except the demo). `src/store.ts` is the only module that touches it, so it can be swapped for Postgres or Airtable without other changes. Put `DATA_DIR` on a persistent volume.
- **Secrets:** HeyReach keys and Google credentials live only in env vars; client config files store env var *names*.
- **Costs:** the system prompt (matrix + templates + assets + knowledge) is cached between turns. Large knowledge uploads raise the per-chat cost, so keep transcripts to the relevant ones.
- **Model:** `claude-opus-5-5` at `medium` effort with adaptive thinking (`CLAUDE_MODEL`, `CLAUDE_EFFORT`). Server-side refusal fallback (`fallbacks: "default"`) is on.
- Deploy behind HTTPS (the mic only works on HTTPS or localhost).
