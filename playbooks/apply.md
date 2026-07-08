# Apply Playbook

Run for a proposal that a human has explicitly approved (Slack reply or direct
instruction). Never run this without an approval.

## Steps

1. Load the proposal from `state/<workspace>.json`. Verify `status` is `pending`
   or `approved` — never re-apply an `applied` proposal.
2. **Re-fetch the post** by ID (`ordinal_search_content` with `postId`).
   - If the post has been published since the proposal was drafted → mark the
     proposal `rejected` with resolution `"post already published"`, tell the
     approver in Slack, stop.
   - If the copy changed since `before` was captured (someone edited manually),
     do NOT blind-overwrite: re-derive `after` by applying the same feedback to
     the current copy. If that isn't safely possible, flag in Slack and stop.
   - If new client comments appeared since the sweep, surface them (they may
     supersede the proposal).
3. Apply the edit: `ordinal_manage_post` action `update` with the channel copy
   set to `after` (e.g. `linkedIn: { copy: ... }`).
4. Reply to the client's comment thread with `ordinal_manage_comments` action
   `create` — short and human, e.g.:
   > Thanks for the feedback! Updated the post — [one line on what changed].
   Use `suggestedReply` from the proposal if present. No AI-speak, no mention of
   automation.
5. Set post status per `config.onApproval.setStatus` (default `ForReview`) with
   `ordinal_manage_post` action `update` so the client knows to re-check it.
6. Update the proposal: `status: "applied"`, `resolvedAt`, `resolution: "applied"`.
7. Regenerate + republish the dashboard, confirm in the Slack thread
   (`✅ prop-xxxxxx applied to "<post title>"`), commit and push state.

## Rejections

For `reject <id>[: reason]`: set `status: "rejected"`, store the reason in
`resolution`, add the comment IDs to processed (so they aren't re-proposed),
refresh dashboard, commit. Do not touch Ordinal or reply to the client.
