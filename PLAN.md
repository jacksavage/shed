# Family Notes & Flashcards App — Plan

## Overview

A minimal, private web app for note-taking and spaced-repetition flashcard practice.
Self-hosted on a TrueNAS Scale server, exposed to the internet via Cloudflare Tunnel.
Containerized with Docker Compose for portability and simple day-to-day ops.

---

## Goals

- Per-user auth (family members only, invite-only)
- Create/edit/view notes
- Create flashcard decks from notes or manually
- Basic spaced repetition (SM-2 or similar)
- Self-hosted on TrueNAS Scale, no cloud dependencies
- Accessible from anywhere via Cloudflare Tunnel (no open ports)
- PWA-ready later (offline support, installable) — deferred

---

## Proposed Architecture

### Services (Docker Compose)

```
cloudflared  ──►  caddy (reverse proxy)
                    ├──► web   (Nginx serving React SPA)
                    └──► api   (Node.js/Express + TypeScript)
                               └──► db (PostgreSQL 16)
```

| Container    | Image                        | Role                                  |
|--------------|------------------------------|---------------------------------------|
| `db`         | `postgres:16-alpine`         | Primary data store                    |
| `api`        | custom (Node 22 alpine)      | REST API, auth, SRS logic             |
| `web`        | custom (Nginx alpine)        | Serves built React SPA                |
| `caddy`      | `caddy:alpine`               | Reverse proxy, routes `/api` vs `/`   |
| `cloudflared`| `cloudflare/cloudflared`     | Outbound tunnel, no open inbound ports|

---

### Frontend

**React SPA** (Vite + TypeScript), built and served by Nginx.

- Nginx serves the static build output
- All `/api/*` requests proxied by Caddy to the `api` container
- Auth handled client-side via JWT stored in `localStorage`
- No framework-specific auth library needed — plain `fetch` with bearer tokens

---

### Auth

**JWT-based auth built into the API** — no external service.

- Passwords hashed with `bcrypt`
- Login returns a short-lived access token (15 min) + long-lived refresh token (30 days)
- Refresh token stored in an `HttpOnly` cookie; access token in memory/`localStorage`
- Admin creates family accounts via a seed script or a `/admin` route (protected)
- No self-registration endpoint

---

### Backend API

**Node.js 22 + Express + TypeScript**

- Keeps the stack in a single language (TS shared between frontend and backend)
- Deployed as a long-running container — no cold starts, simple ops
- **Database access**: `postgres` (node-postgres) with hand-written SQL — no ORM bloat
- Migrations via `node-pg-migrate` (simple, file-based, no magic)

**Endpoints**:
```
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

GET    /notes
POST   /notes
GET    /notes/:id
PUT    /notes/:id
DELETE /notes/:id

GET    /decks
POST   /decks
GET    /decks/:id
PUT    /decks/:id
DELETE /decks/:id

GET    /decks/:id/cards
POST   /decks/:id/cards
PUT    /decks/:id/cards/:cardId
DELETE /decks/:id/cards/:cardId

POST   /decks/:id/review    # submit result, returns next due card
GET    /decks/:id/due       # cards due today
```

---

### Database

**PostgreSQL 16**

Relational schema — a natural fit for structured notes, decks, and card review state.

```sql
users       (id, email, display_name, password_hash, created_at)
notes       (id, user_id, title, body, created_at, updated_at)
decks       (id, user_id, name, description, created_at)
cards       (id, deck_id, note_id nullable, front, back, created_at)
card_state  (id, card_id, user_id, interval, repetitions, ease_factor, due_date, updated_at)
review_log  (id, card_id, user_id, rating, reviewed_at)
```

Data persisted to a ZFS dataset on TrueNAS, bind-mounted into the `db` container.

---

### Reverse Proxy

**Caddy**

- Routes `/api/*` → `api:3000`, everything else → `web:80`
- Listens on internal port 80 (Cloudflare Tunnel terminates TLS externally)
- Simple, declarative `Caddyfile`; no manual cert management needed

```
:80 {
    handle /api/* {
        reverse_proxy api:3000
    }
    handle {
        reverse_proxy web:80
    }
}
```

---

### Cloudflare Tunnel

**`cloudflare/cloudflared`** container, configured via a tunnel token env var.

- No inbound ports opened on TrueNAS or the home router
- Cloudflare terminates HTTPS and proxies traffic to `caddy:80` inside the stack
- Tunnel created once in the Cloudflare dashboard; token stored in `.env`
- DNS record (`notes.yourdomain.com → tunnel`) managed in Cloudflare dashboard

---

### TrueNAS Scale Deployment

TrueNAS Scale's **Apps** system supports Docker Compose directly.

- Place the repo (or just `docker-compose.yml` + configs) on a dataset
- Persistent data volumes bind-mounted to ZFS datasets (e.g. `/mnt/pool/apps/notes/`)
- Snapshots and replication handled by TrueNAS — no app-level backup logic needed
- Optionally run `docker compose up -d` from TrueNAS shell for full control

**Recommended dataset layout**:
```
/mnt/pool/apps/notes/
  data/
    postgres/    # bind-mounted as /var/lib/postgresql/data
  compose/
    docker-compose.yml
    Caddyfile
    .env         # secrets (postgres password, tunnel token, jwt secret)
```

---

## Repository Layout

```
docker-compose.yml
Caddyfile
.env.example

api/
  src/
    routes/
      auth.ts
      notes.ts
      decks.ts
      cards.ts
      review.ts
    middleware/
      auth.ts
    lib/
      db.ts         # pg pool + query helper
      srs.ts        # SM-2 algorithm
    migrations/     # node-pg-migrate files
  Dockerfile
  tsconfig.json
  package.json

web/
  src/
    pages/
    components/
    lib/
      api.ts        # typed fetch wrappers
  nginx.conf
  Dockerfile        # multi-stage: vite build → nginx
  vite.config.ts
  tsconfig.json
  package.json
```

---

## Spaced Repetition

SM-2 in `api/src/lib/srs.ts`:
- Each `card_state` row stores: `interval` (days), `repetitions`, `ease_factor`, `due_date`
- On review: user rates 0–5, algorithm updates interval and due date
- Frontend fetches cards due today via `GET /decks/:id/due`
- Simple, well-understood, no external dependency

---

## Open Questions / Decisions

1. **Shared types**: Use a small `packages/types` workspace package to share
   request/response types between `api/` and `web/` (npm workspaces).
2. **Markdown notes**: Simple `textarea` + a lightweight preview (e.g. `marked`)
   keeps things portable and avoids heavy editor deps.
3. **Card creation from notes**: Start independent; add "create cards from note"
   shortcut later.
4. **Multiple users reviewing the same deck**: `card_state` is per `(card_id, user_id)`
   so each family member has independent SRS state.
5. **Updates/upgrades**: `docker compose pull && docker compose up -d` — standard
   container ops.

---

## Next Steps

1. Scaffold repo with `docker-compose.yml`, `Caddyfile`, `.env.example`
2. Set up PostgreSQL container + initial schema migration
3. Scaffold Express API with auth (login, refresh, logout)
4. Add notes CRUD endpoints
5. Add decks + cards CRUD endpoints
6. Implement SM-2 review endpoint
7. Scaffold Vite/React frontend with auth flow
8. Build notes UI
9. Build flashcard deck + review UI
10. Create Cloudflare Tunnel in dashboard, wire up `cloudflared` container
11. Deploy on TrueNAS Scale, test end-to-end
12. Harden (error handling, loading states, mobile layout)
13. PWA (service worker, offline, installable) — later
