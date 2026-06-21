---
name: redraft-review
description: Review, answer, and resolve open ReDraft proposal comments in local mode. Use this whenever the user wants to walk through unresolved proposal feedback, draft replies to comment threads, resolve local review threads, or review proposal discussion stored in `.comments.json` sidecars. Also use it for direct `/redraft-review` requests and for any request to process proposal feedback from a local ReDraft server.
---

# ReDraft Review

Use this skill to work through open proposal comments in a local ReDraft workspace.

## What this skill is for

ReDraft has two different data paths:
- **Proposal markdown** lives on disk under `proposals/*.md`
- **Comment threads** live in sidecar files under `proposals/*.comments.json`

For local ReDraft workflows, read proposal and comment files directly from disk, but write comment mutations through the local ReDraft server so SHA locking and browser updates stay correct.

## Preconditions

1. Confirm the user is working in a ReDraft repo with a `proposals/` directory.
2. Check whether the local ReDraft server is available at `http://127.0.0.1:4200/api/github/user`.
3. If the server is not running, ask the user to start it with:
   - `npm run build`
   - `npm run serve -- ./proposals`
4. If the user is using a non-default port, ask for it before continuing.

## Core workflow

### 1. Collect unresolved comment threads

- Find every `*.comments.json` file under `proposals/`
- Read each file and parse `{ version: 1, comments: CommentThread[] }`
- Keep only threads where `resolved !== true`
- Group by proposal file
- Present the list as a review queue: proposal path, quoted text, comment body, existing replies

### 2. Walk the queue with the user

For each unresolved thread, present:
- proposal path
- quoted text
- original comment
- existing replies
- whether the quote still appears in the current proposal text

Then offer three actions:
1. **Draft a reply**
2. **Skip for now**
3. **Resolve without reply**

Be terse and progress one thread at a time.

### 3. Drafting a reply

When the user wants a draft:
- Read the current proposal markdown from disk for context
- Draft a concrete reply that addresses the feedback directly
- Show the draft before writing it
- If the user accepts, write the reply through the local ReDraft API

## Writing comments through the local API

Never write `.comments.json` files directly when mutating threads. Use the local ReDraft API instead.

### Read the current comment file

Fetch the current API representation of the sidecar file:
- `GET /api/github/repos/local/proposals/contents/proposals/<name>.comments.json`

Decode the base64 content, modify the JSON, then write it back with the returned `sha`.

### Reply mutation

To add a reply:
- append a new reply object to the matching thread's `replies` array
- preserve existing thread ids and reply ids
- create a new reply id when adding a reply
- set `createdAt` to the current ISO timestamp
- keep `author` explicit

### Resolve mutation

To resolve or reopen a thread:
- toggle the thread's `resolved` boolean
- preserve all other fields unchanged

### Write back

Write the full updated comment file via:
- `PUT /api/github/repos/local/proposals/contents/proposals/<name>.comments.json`

Include:
- `message`
- `sha`
- `content` (base64-encoded JSON)

If the API returns a conflict, tell the user another process modified the comment file and restart from the latest version.

## Markdown revision workflow

If the user asks you to revise the proposal itself while reviewing comments:
- edit the `.md` file on disk directly
- keep comments in the sidecar file unchanged unless the user also wants threads resolved
- rely on the local ReDraft watcher to refresh the browser UI

## Output style

Use this structure while walking comments:

### Thread N — `<proposal path>`
- Quote: `...`
- Comment: `...`
- Existing replies: none | bullet list
- Suggested action: reply | resolve | skip

If drafting a reply, label it clearly:
- **Draft reply:** `...`

## Guardrails

- Do not mutate comments by editing `.comments.json` on disk directly
- Do not resolve a thread silently after revising markdown unless the user explicitly wants that
- Do not assume the local server is on a custom port without evidence
- Do not invent missing comment fields; preserve the existing schema exactly
- If a thread quote no longer matches the proposal text, call that out before drafting a reply

## Common requests this skill should handle

- "Walk me through open proposal comments"
- "Help me answer all unresolved review threads"
- "Review feedback on the local ReDraft workspace"
- "/redraft-review"
- "Draft replies to the comments in proposals/auth-overhaul.comments.json"
