# Chat Module — Implementation Plan

_Grilled and finalized: 2026-06-30_

## Confirmed Requirements

| # | Decision |
|---|----------|
| Message types | Text, rich text (bold/italic), images, files (PDF/XLSX/etc.), voice notes, emoji reactions, code snippets |
| Real-time | Supabase Realtime |
| Directory | Fully open — any employee can DM any other employee |
| History | Rolling 1-year window (expires per message, not per conversation) |
| Deactivated users | Conversations archived, not deleted |
| Edit | Yes — 15-minute window; previous versions visible in edit history |
| Delete | Yes — delete for everyone (soft delete, shows "[Message deleted]") |
| Read receipts | All three ticks: sent → delivered → read |
| Presence | None |
| Notifications | In-app badge only (unread count on nav item) |
| Encryption | Postgres at-rest only (no E2E) |
| HR/Admin access | None — conversations are fully private |
| File storage | Same Supabase bucket as expense receipts, `chat/` prefix |

---

## Database Schema

```sql
-- One row per unique pair; enforce sorted UUIDs so (A,B) == (B,A)
CREATE TABLE conversations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a uuid NOT NULL REFERENCES users(id),  -- smaller UUID
  participant_b uuid NOT NULL REFERENCES users(id),  -- larger UUID
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_a, participant_b)
);

CREATE TYPE message_type AS ENUM ('text','rich_text','image','file','voice','code');

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id),
  type            message_type NOT NULL,
  content         text,                  -- null for image/file/voice
  metadata        jsonb,                 -- { url, filename, size_bytes, mime_type, duration_ms }
  is_deleted      boolean NOT NULL DEFAULT false,
  edited_at       timestamptz,           -- null = never edited
  expires_at      timestamptz NOT NULL,  -- created_at + interval '1 year'
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (conversation_id, created_at DESC);
CREATE INDEX ON messages (expires_at);   -- for nightly expiry job

CREATE TABLE message_edits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id  uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  old_content text NOT NULL,
  edited_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE message_receipts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id),
  delivered_at timestamptz,
  read_at      timestamptz,
  UNIQUE (message_id, recipient_id)
);

CREATE TABLE message_reactions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id),
  emoji      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
```

---

## RLS Policies

| Table | Rule |
|-------|------|
| `conversations` | SELECT/INSERT only if `auth.uid()` is `participant_a` or `participant_b` |
| `messages` | SELECT only if user is a participant in `conversation_id` |
| `messages` | INSERT only when `sender_id = auth.uid()` |
| `messages` | UPDATE (edit) only when `sender_id = auth.uid()` AND `created_at > now() - interval '15 minutes'` AND `is_deleted = false` |
| `messages` | UPDATE (delete) only when `sender_id = auth.uid()` (sets `is_deleted = true`) |
| `message_edits` | SELECT for any participant of the parent conversation |
| `message_receipts` | UPDATE own row (recipient sets delivered_at / read_at); SELECT for conversation participants |
| `message_reactions` | INSERT/DELETE own rows; SELECT for all conversation participants |

---

## Server Actions (`src/server/chat/`)

```
getOrCreateConversation(otherUserId)        → conversation
listConversations()                         → conversation[] with last message + unread count
listMessages(conversationId, cursor?)       → message[] paginated (50/page, filter expires_at > now())
sendMessage(conversationId, type, content, metadata?)  → message
editMessage(messageId, newContent)          → message  (enforces 15-min window server-side too)
deleteMessage(messageId)                    → void     (sets is_deleted = true for both sides)
markDelivered(messageId)                    → void
markRead(conversationId)                    → void     (bulk-updates all unread for recipient)
addReaction(messageId, emoji)               → reaction
removeReaction(messageId, emoji)            → void
getUnreadCount()                            → number   (for nav badge)
listUsers()                                 → user[]   (for new DM user-picker, excludes self)
```

---

## Real-time Architecture (Supabase Realtime)

Three channel subscriptions, all client-side in the active conversation view:

1. **`messages:{conversationId}`** — INSERT → append bubble; UPDATE → patch bubble (edit/delete)
2. **`receipts:{conversationId}`** — UPDATE → update tick icons
3. **`reactions:{conversationId}`** — INSERT/DELETE → update reaction counts

Unread badge: subscribe to `conversations` table filtered to `participant_a/b = me` — count unread on each message INSERT.

---

## File & Voice Storage

- **Bucket:** `documents` (existing), prefix `chat/{conversationId}/{messageId}/`
- **Signed URLs:** generated at send time, TTL = 1 year (matches message expiry)
- **Voice notes:** recorded in-browser via `MediaRecorder` API → `audio/webm` blob → upload → signed URL stored in `metadata.url`
- **Images:** generate a 400px thumbnail server-side (or via Supabase image transform) for the preview bubble; full-res on click
- **Files:** show filename + size + mime icon; download via signed URL

---

## Message Expiry

- `expires_at = created_at + interval '1 year'` set at INSERT time
- Supabase **pg_cron** job (nightly at 02:00): `DELETE FROM messages WHERE expires_at < now();` — cascades to edits, receipts, reactions
- Query layer: `WHERE expires_at > now()` as a safety filter on all `listMessages` calls
- Archived conversations (deactivated user): conversation row stays; messages expire naturally

---

## UI Architecture

### Routes
```
/chat                     → ChatLayout with empty right panel ("Select a conversation")
/chat/[conversationId]    → ChatLayout with MessagePanel open
```

### Component Tree
```
ChatLayout
├── ConversationSidebar
│   ├── NewDmButton → UserPickerModal
│   ├── SearchInput (filter by name)
│   └── ConversationItem[] (avatar, name, last message preview, unread badge, timestamp)
└── MessagePanel  (empty state or active conversation)
    ├── PanelHeader (avatar, name, "15 messages")
    ├── MessageList (virtualized, infinite scroll upward)
    │   └── MessageBubble[]
    │       ├── TextBubble / RichTextBubble / CodeBubble
    │       ├── ImageBubble (thumbnail + lightbox)
    │       ├── FileBubble (icon + filename + download)
    │       ├── VoiceBubble (waveform + play/pause + duration)
    │       ├── DeletedBubble ("[Message deleted]")
    │       ├── ReactionBar (emoji + count, click to toggle)
    │       ├── EditedLabel ("edited" + history popover)
    │       └── ReceiptTicks (sent / delivered / read)
    └── MessageComposer
        ├── RichTextInput (contenteditable, bold/italic/code toolbar)
        ├── AttachmentButton → file picker
        ├── VoiceButton → hold-to-record
        ├── EmojiPickerButton
        └── SendButton
```

### Navigation Integration
- Add `{ label: 'Chat', href: '/chat', icon: MessageSquare }` to `NAV_SECTIONS` in `src/server/users.ts` — visible to all roles
- Unread badge rendered on the nav item via a real-time count query

---

## Sprint Breakdown

### Sprint 1 — Foundation
| Ticket | Scope |
|--------|-------|
| KAN-50 | DB schema + Drizzle migration + RLS policies |
| KAN-51 | Server actions: `getOrCreateConversation`, `sendMessage`, `listConversations`, `listMessages` |
| KAN-52 | Route setup `/chat` + `/chat/[conversationId]` + `ChatLayout` shell |
| KAN-53 | `ConversationSidebar` — list, search, `UserPickerModal` for new DM |

### Sprint 2 — Core Messaging
| Ticket | Scope |
|--------|-------|
| KAN-54 | `MessageBubble` — text + rich text + code rendering |
| KAN-55 | `MessageComposer` — text, rich text toolbar, send action |
| KAN-56 | Supabase Realtime subscription — live message delivery |
| KAN-57 | File + image messages — upload, signed URL, `FileBubble`, `ImageBubble` |

### Sprint 3 — Rich Features
| Ticket | Scope |
|--------|-------|
| KAN-58 | Voice notes — `MediaRecorder` recording, `VoiceBubble` playback |
| KAN-59 | Emoji reactions — `ReactionBar`, add/remove server actions |
| KAN-60 | Read receipts — `ReceiptTicks`, `markDelivered`/`markRead`, Realtime subscription |
| KAN-61 | Edit message — 15-min window enforcement, `EditHistory` popover |
| KAN-62 | Delete for everyone — soft delete, `DeletedBubble` |

### Sprint 4 — Polish + Infrastructure
| Ticket | Scope |
|--------|-------|
| KAN-63 | In-app badge — unread count, Realtime-driven nav badge |
| KAN-64 | Cursor-based pagination — infinite scroll upward in `MessageList` |
| KAN-65 | Message expiry — pg_cron job + query-layer filter + archived conversation handling |
| KAN-66 | E2E tests — send message, receipt ticks, edit, delete, file upload, unread badge |

---

## Open Decisions (resolve before KAN-50)

- **Rolling window per conversation vs per message**: plan assumes per-message (each message expires 1 year after it was sent). If you want the whole conversation to vanish 1 year after the _last_ message, that requires a different expiry strategy.
- **Image thumbnails**: use Supabase image transforms (free on Pro plan) or skip and show full-res at max-width. Decide before KAN-57.
- **Rich text format**: store as Markdown (simpler, portable) or as Tiptap/ProseMirror JSON (richer but ties you to the editor). Decide before KAN-55.
