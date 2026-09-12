# EasyTaka API

Node + Express 5 + Mongoose 9 backend for the EasyTaka SMM operations client (`../client`).

## Quick start

```bash
cd server
npm install
cp .env.example .env      # then fill in MONGODB_URI, JWT_SECRET, Cloudinary keys
npm run seed              # ⚠ wipes the database and loads demo data (see below)
npm run dev               # http://localhost:5000/api  (auto-restarts on change)
```

`npm run seed` deletes **every** collection it manages. If the database already has
users or brands it refuses to run; use `npm run seed -- --force` to replace them anyway.
Point `MONGODB_URI` at a separate database (e.g. `/easytaka_dev`) if you want demo data
next to your real data.

`npm start` runs without file watching (production).

### Seeded logins

All passwords come from `SEED_ADMIN_PASSWORD` / `SEED_SMM_PASSWORD` (default `pass123`).

| Role     | Email                   | Notes                                           |
| -------- | ----------------------- | ----------------------------------------------- |
| ADMIN    | `admin@easytaka.com`    | Platform admin (not tied to a brand)            |
| MANAGER  | `manager@milkimom.com`  | Brand manager for Milkimom                      |
| REVIEWER | `reviewer@milkimom.com` | Reviews enrichment stages and submissions       |
| SMM      | `rafi@easytaka.com`     | Rafi Islam: 20 IDs, 16 eligible, not yet a Job Holder |

## Architecture

```
src/
  server.js            boot: connect DB, start HTTP, graceful shutdown
  app.js               express app: helmet, CORS allow-list, rate limit, routes, errors
  config/              env validation (zod), db, cloudinary, default enrichment template
  lib/mongoose.js      configured mongoose (global toJSON: _id -> id, no __v)
  models/              User, Brand, Product, Smm, SocialAccount, Mission, Submission,
                       Transaction, Notification, Conversation, Message, RewardItem, Redemption
  services/            business rules (enrichment, missions, wallet, progression, stats)
  controllers/         request handlers (thin; call services)
  routes/              routers + zod request schemas
  middleware/          auth (JWT), validate, upload (multer), error handler
  seed/                demo data mirroring client/src/data/mockData.ts
```

All responses are JSON. Documents expose `id` (string) instead of `_id`. Errors look like
`{ "message": "...", "code"?: "...", "details"?: [{ "path", "message" }] }`.

Authenticate with `Authorization: Bearer <token>` (from `/api/auth/login`).

## Business rules

- **Enrichment pipeline.** Each brand configures weighted stages (`stg1`…`stg8` by default, and the active weights must add up to 100). A new social ID copies the brand's stages at creation. Stage 1 starts `Available` and the rest `Locked`.
  - **Submit** (SMM): only `Available`/`Revision Required` stages, with every checklist item confirmed. Some stages also have requirements: `stg4` needs the persona 100% complete, `stg5` needs 10 content entries, `stg7` needs 5 notes.
  - **Review** (staff):
    - *Approve* awards the stage XP and unlocks the next stage.
    - *Revision* sends the stage back with a note.
    - *Reject* resets the stage to `Available`.
  - At 100% the ID becomes `Eligible` and the SMM gets the one-time full-enrichment reward (default ৳20).
  - Concurrent reviews of the same account are rejected with `409`.
- **Job Holder.** At `jobHolderThreshold` eligible IDs (default 20) the SMM can claim the bonus (default ৳100 + 200 XP). Claiming unlocks missions, rapid tasks and weekly salary.
- **Missions / rapid tasks** share one model (`isRapid`).
  - An SMM *starts* a mission with one eligible ID, or *accepts* a rapid task with `requiredIds` IDs.
  - They then submit proof. Staff approve, request a revision, or reject.
  - Approval pays the cash reward and XP exactly once. Every payment is an idempotent `Transaction` with a unique `reference`.
  - `targetCompletions` is the number of slots per period: per day for Daily, per ISO week for Weekly, and in total for One-time and rapid tasks.
- **Levels** = `floor(lifetimeXp / 200) + 1`, max 10. **Quality score** = approval rate over all reviews. **Streak** counts consecutive business days with submissions.
- **Division policy.** An SMM's working division must differ from their NID division.
- **Products per SMM.** Enforced by the brand setting `productsPerSmm` (default 4).
- **Wallet.**
  - Withdrawals debit the balance immediately as `Pending`. Staff approve them, or reject them, which refunds the money.
  - `POST /brands/:id/payroll/run` credits the weekly base salary to Job Holders. It is safe to run more than once a week.
- **Credentials** for social IDs are encrypted with AES-256-GCM. Only the owning SMM or a manager can reveal them.
- Days and weeks use the business timezone (`TZ_OFFSET_MINUTES`, default Asia/Dhaka).

## Endpoints (all under `/api`)

Roles: **S** = SMM, **R** = reviewer, **M** = manager, **A** = admin. Staff = R/M/A.

### Auth
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | SMM self-signup (`ALLOW_PUBLIC_REGISTER` + Cloudinary). **multipart**: name, email, password, phone?, brandId, nidNumber (10/13/17 digits), nidDivision, assignedWorkingDivision?, files `nidFront` + `nidBack`. The SMM starts with NID verification `Pending` |
| POST | `/auth/login` | public | → `{ token, user, smm, brand, impersonating }` |
| GET | `/auth/me` | any | current user + SMM profile + brand (also allowed while NID is unverified) |
| POST | `/auth/impersonate` | platform A | `{ brandId }` → 8h token acting as that brand's admin. Keep the admin token client-side to switch back |
| PATCH | `/auth/me` | any | name, phone, avatar (not while impersonating) |
| POST | `/auth/change-password` | any | currentPassword, newPassword → new token (not while impersonating) |

**NID verification.** A self-registered SMM can log in, but every API call outside `/auth/*` returns
`403 { code: "NID_NOT_VERIFIED" }` until a platform admin approves the NID. NID photos are stored as
Cloudinary `authenticated` assets and only exposed as short-lived signed URLs. Seeded and invited SMMs are `Verified`.

**Logging in as a brand.** The impersonation token keeps the admin's identity (`sub`) and adds
`actAsBrand`. Requests made with it are scoped to that brand exactly like a brand admin's, and platform-only
endpoints (`/users`, `POST /brands`) are refused.

### Users (platform admin only)
| Method | Path | Notes |
| --- | --- | --- |
| GET | `/users` | `?role`, `?brand`, `?status`, `?verification=Pending\|Verified\|Rejected`, `?q`; SMMs include `smm.verification` |
| POST | `/users` | create `ADMIN`, `MANAGER` (Brand Admin) or `REVIEWER`; `brandId` required except for ADMIN |
| PATCH | `/users/:id` | name, phone, status (`Active`/`Suspended`; you cannot suspend yourself) |
| GET | `/users/:id/nid` | NID number, divisions, signed `frontUrl` / `backUrl`, verification |
| POST | `/users/:id/verification` | `{ action: Approve\|Reject, note? }` (note required to reject) |

### Brands & products
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/brands/public` | public | active brands (for registration) |
| GET / POST | `/brands` | any / platform A | platform admins also get `smmCount`, `staffCount`, `pendingVerifications` |
| GET / PATCH | `/brands/:id` | any / M,A | `settings` may be partial |
| PUT | `/brands/:id/enrichment-stages` | M,A | `{ stages: [...] }`; active weights must equal 100 |
| GET | `/brands/:id/overview` | staff | stat cards, 7-day chart, needs attention, payroll estimate |
| POST | `/brands/:id/payroll/run` | M,A | weekly base salary for Job Holders |
| GET / POST | `/products` | any / M,A | `?status`, `?q`, `?mine=true` (SMM); includes `assignedSmmCount` |
| GET / PATCH / DELETE | `/products/:id` | any / M,A / M,A | |
| POST / DELETE | `/products/:id/assign[/:smmId]` | M,A | body `{ smmId }` |

### Workforce (SMMs)
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/smms/me` | S | profile + `weeklyEarnings`, `jobHolder` progress, home `summary` |
| GET | `/smms/me/career` | S | level progress + badges |
| POST | `/smms/me/job-holder/claim` | S | |
| GET / POST | `/smms` | staff / M,A | `?division`, `?status`, `?q`, `?sort=quality\|level\|progress\|newest`; POST = invite |
| GET / PATCH | `/smms/:id` | staff / M,A | |
| PUT | `/smms/:id/products` | M,A | `{ productIds }` |

### Social accounts (Hub)
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/accounts` | any | SMM: own; staff: brand (`?smm=`). `?status`, `?platform`, `?q`, `?view=summary`, paginated |
| POST | `/accounts` | S | Add New ID: name, email, platform, profileUrl, password?, twoFactorEnabled? |
| GET / PATCH / DELETE | `/accounts/:id` | any / owner or M,A / M,A | PATCH `status: Locked\|Unlocked` is M,A only |
| PUT | `/accounts/:id/persona` | S (owner) | partial persona; `completeness` is computed |
| POST / PATCH / DELETE | `/accounts/:id/notes[/:noteId]` | S (owner) | |
| POST / DELETE | `/accounts/:id/content[/:entryId]` | S (owner) | |
| PUT | `/accounts/:id/credentials` | S (owner) | password, twoFactorEnabled, twoFactorMethod |
| POST | `/accounts/:id/credentials/reveal` | owner, M,A | → `{ password }` |
| POST | `/accounts/:id/stages/:stageId/submit` | S (owner) | checklistConfirmed, profileUrl, notes, screenshots[] |
| POST | `/accounts/:id/stages/:stageId/review` | staff | `{ action: Approve\|Revision\|Reject, note? }` |

### Missions, rapid tasks, submissions, reviews
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET / POST | `/missions` | any / M,A | SMM view needs Job Holder; includes `progress`, `slotsLeft`, `mySubmissions` |
| GET / PATCH / DELETE | `/missions/:id` | any / M,A / M,A | DELETE archives |
| POST | `/missions/:id/start` | S | `{ accountIds: [oneEligibleId] }` → submission |
| GET / POST | `/rapid-tasks` | any / M,A | create with `timeLimitHours`, `requiredIds`; `timeLeft` virtual |
| GET / PATCH / DELETE | `/rapid-tasks/:id` | any / M,A / M,A | |
| POST | `/rapid-tasks/:id/accept` | S | `{ accountIds }` (≥ requiredIds) |
| GET | `/submissions/mine` | S | `?status`, `?type=mission\|rapid` |
| GET | `/submissions/:id` | owner, staff | |
| POST | `/submissions/:id/submit` | S | `{ url?, screenshots?, notes? }` |
| POST | `/submissions/:id/review` | staff | `{ action, note? }` |
| GET | `/reviews/summary` | staff | pending counts per category |
| GET | `/reviews/enrichment` | staff | stages under review with progress/reward preview |
| GET | `/reviews/submissions` | staff | `?type=mission\|rapid&status=Submitted` |

### Wallet, rewards, notifications, messages, uploads
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| GET | `/wallet` | S | balance, weeklyEarnings, pending withdrawals, last 10 transactions |
| GET | `/wallet/transactions` | S, M,A | paginated; `?type`, `?category`, `?status`, `?smm` |
| POST | `/wallet/withdrawals` | S | `{ amount, method: bKash\|Nagad\|Rocket\|Bank, accountNumber }` |
| GET / PATCH | `/wallet/withdrawals[/:id]` | M,A | `{ action: approve\|reject, note? }` |
| GET / POST | `/rewards` | any / M,A | store items + `canAfford` for SMMs |
| PATCH | `/rewards/:id` | M,A | |
| POST | `/rewards/:id/redeem` | S | deducts redeemable XP |
| GET / PATCH | `/rewards/redemptions[/:id]` | any / M,A | `{ status: Fulfilled\|Cancelled }` (cancel refunds) |
| GET | `/notifications` | any | paginated + `unreadCount`; `?unread=true` |
| PATCH / DELETE | `/notifications/:id[/read]` | any | |
| POST | `/notifications/read-all` | any | |
| GET | `/conversations/contacts` | any | people you are allowed to message |
| GET / POST | `/conversations` | any | list with `unreadCount`; POST `{ participantId, message, topic?, relatedAccountId? }` |
| GET / POST | `/conversations/:id/messages` | participant | GET marks read; `?before=<iso>&limit=` |
| POST | `/uploads?folder=proofs` | any | multipart `files` (≤5 images, 5 MB each) → Cloudinary URLs |

### Demo controls (only when `DEMO_MODE=true`, off by default)
| Method | Path | Who | Notes |
| --- | --- | --- | --- |
| POST | `/demo/reset` | A | re-runs the seed (wipes the DB) |
| POST | `/demo/approved-ids` | S (or staff with `smmId`) | `{ count }`: first N IDs fully approved |
| POST | `/demo/xp` | S (or staff with `smmId`) | `{ amount }` |

## Wiring up the client

The client currently runs on `SMMContext` + `mockData.ts`. When you switch it to this API:

- Stage ids are `stg1`…`stg8`, which the Hub already uses for its stg4, stg5 and stg7 checks. They replace the mock's `st1`…`st5`, which had no `weight`.
- The SMM title is `designation` (the mock used `role`). The SMM `name` and `avatar` come from the linked user.
- Missions use `title`, `reward`, `targetCompletions`, `recurrence` and `progress.{completed,total}` in place of the mock's mixed `name`, `title`, `completed` and `total` fields. Rapid tasks also have `timeLeft`.
- Transactions have a numeric `amount` plus a display string `amountLabel` (`+৳750`).
- Dates are ISO strings.
