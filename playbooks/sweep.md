# Sweep Playbook

Run this on every scheduled wake-up (hourly Routine) or when asked to "run a sweep".
Everything here is executed with Ordinal + Slack MCP tools. Never deviate from the
guardrails in README.md: this is a **propose-only** system.

## 0. Load context

1. Read `config.json` and `state/<workspace>.json` for each pilot workspace
   (create the state file from the schema below if missing).
2. `git pull origin claude/slack-session-flb27i` first — another session may
   have updated state.

## 1. Check for approvals since last sweep (do this FIRST)

1. Read recent messages + thread replies in the Slack channel (`config.slack.channelId`)
   since `state.lastSweepAt`.
2. Look for `approve <proposalId>` / `reject <proposalId>[: reason]` replies from
   RevBoss team members.
3. For each approval → run `playbooks/apply.md`. For each rejection → mark the
   proposal `rejected` (store the reason), do NOT touch Ordinal.

## 2. Find new client feedback

For each pilot workspace:

1. `ordinal_search_content` (list mode) for posts in each status in
   `config.editableStatuses`. Skip posts whose `publishAt` is in the past
   (published = uneditable). Also list the 10 most recently *created* posts
   regardless of status, in case feedback arrives on drafts in other states.
2. For each candidate post, fetch by `postId` with `includeComments: true`.
3. A comment needs handling when ALL of:
   - its `id` is NOT in `state.processedCommentIds`
   - the author's email domain is NOT `config.teamDomain` (client feedback only;
     for Teachable, clients are `@teachable.com`)
   - it is not pure approval/praise with no action ("love it!", "approved") —
     record those as processed with `classification: "praise"`, no proposal.

## 3. Draft proposals

For each post with actionable new comments, create ONE proposal covering all its
open comments (clients often leave several at once):

1. Classify the feedback:
   - `clear-edit` — unambiguous instruction (typo, "change X to Y", "cut the last line",
     "don't use the word 'leverage'")
   - `ambiguous` — subjective or open to interpretation ("make it punchier",
     "this doesn't sound like me") — still draft your best revision, but say what
     you assumed in the rationale and flag alternatives
   - `question` — client is asking something, not requesting an edit → no copy
     change; propose a suggested reply instead
   - `internal` — @-mention chatter between team members → mark processed, skip
2. Write the revised copy (`after`). Rules:
   - Change ONLY what the feedback asks for. Preserve voice, formatting, emojis,
     line breaks, and `@[Name](urn:...)` mention syntax exactly.
   - LinkedIn copy limit ~3000 chars; keep hooks in the first 2 lines.
   - If a comment references something you cannot change (an image, a link,
     scheduling), note it in the rationale and leave the copy unchanged for
     that item.
3. Append the proposal to `state.proposals` using the schema below, and add all
   handled comment IDs to `state.processedCommentIds`.

## 4. Publish

1. Update `state.lastSweepAt`, write the state file.
2. Regenerate the dashboard: `node dashboard/generate.mjs` (produces both
   `dashboard/index.html` and `dashboard/dashboard.md`).
3. Refresh the live review dashboard — a **private Slack Canvas** (client copy is
   confidential, so nothing is published to a public URL; the environment also has
   no tool to push to a `claude.ai/code/artifact` URL). Update it with the contents
   of `dashboard/dashboard.md` using `mcp__Slack__slack_update_canvas`:
   - `canvas_id`: `config.dashboardCanvasId`
   - `action`: `replace` (no `section_id` → replaces the whole canvas body)
   - `content`: the contents of `dashboard/dashboard.md` (drop the leading `# `
     title line — the canvas title is set separately)
4. Post a digest to Slack ONLY if something changed (new proposals, applied
   approvals). Format:
   - one line per new proposal: post title, client author, one-line summary of the
     feedback, proposal ID, link to the Ordinal post
   - the canvas link (`config.dashboardCanvasUrl`)
   - reminder: reply `approve <id>` or `reject <id>` in this thread
   Silent sweeps (nothing new) post nothing — no noise.
5. Commit and push state + dashboard changes:
   `git add -A && git commit -m "sweep: <summary>" && git push -u origin claude/slack-session-flb27i`

## State file schema (`state/<workspace>.json`)

```json
{
  "workspace": "teachable",
  "lastSweepAt": "2026-07-08T15:00:00Z",
  "processedCommentIds": {
    "<commentId>": { "postId": "...", "handledAt": "...", "classification": "clear-edit" }
  },
  "proposals": [
    {
      "id": "prop-<6 hex chars, unique>",
      "workspace": "teachable",
      "postId": "...",
      "postTitle": "...",
      "postUrl": "https://app.tryordinal.com/teachable/posts/...",
      "channel": "LinkedIn",
      "publishDate": "2026-07-15",
      "comments": [
        { "id": "...", "author": "Anna Damico", "email": "anna.damico@teachable.com",
          "createdAt": "...", "message": "..." }
      ],
      "classification": "clear-edit",
      "confidence": "high",
      "before": "<full current copy>",
      "after": "<full proposed copy>",
      "rationale": "What was changed and why; assumptions made for ambiguous asks.",
      "suggestedReply": "Optional reply to post on the client's comment after applying.",
      "status": "pending",
      "createdAt": "...",
      "resolvedAt": null,
      "resolution": null
    }
  ]
}
```

`status` lifecycle: `pending` → `approved` → `applied`, or `pending` → `rejected`.
Keep resolved proposals in the file (history feeds the dashboard's "recent activity").
