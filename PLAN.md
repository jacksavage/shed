# Family Notes & Flashcards App — Plan

## Overview

A minimal, private web app for note-taking and spaced-repetition flashcard practice.
Built for a small family, prioritizing low cost, simplicity, and portability.

---

## Goals

- Per-user auth (family members only)
- Create/edit/view notes
- Create flashcard decks from notes or manually
- Basic spaced repetition (SM-2 or similar)
- AWS free tier, serverless where possible
- Infrastructure as code via Pulumi (TypeScript)
- Portable, idiomatic tech choices
- PWA-ready later (offline support, installable) — deferred

---

## Proposed Architecture

### Frontend

**React SPA** (Vite + TypeScript) hosted on **S3 + CloudFront**

- S3 static hosting is effectively free at this scale
- CloudFront free tier: 1 TB data transfer + 10M requests/month
- Custom domain via Route 53 (optional, ~$0.50/mo for hosted zone)
- Auth handled client-side via AWS Amplify Auth (wraps Cognito)

**Why React/Vite?**
- Ubiquitous, easy to find help/libraries
- Vite is fast and minimal
- No server-side rendering needed for a private family app

---

### Auth

**Amazon Cognito User Pool**

- Free tier: 50,000 MAUs (more than enough)
- Handles sign-up, sign-in, JWT tokens, password reset
- Supports invite-only flow: disable self-signup, admin creates users
- Amplify Auth SDK on the frontend for easy integration
- JWT tokens passed to API Gateway for authorization

**User management**: Admin creates accounts manually via AWS console or a small
Pulumi-provisioned user list. No public registration.

---

### Backend API

**AWS Lambda + API Gateway (HTTP API)**

- Lambda free tier: 1M requests/month + 400,000 GB-seconds compute
- API Gateway HTTP API free tier: 1M requests/month (first 12 months)
- After 12 months, HTTP API costs ~$1/million requests — negligible at family scale
- JWT authorizer on API Gateway validates Cognito tokens (no Lambda needed for auth)

**Runtime**: Node.js (TypeScript compiled) — stays in the JS ecosystem, easy to
share types with the frontend via a shared package if desired.

**Endpoints (rough)**:
```
GET    /notes
POST   /notes
GET    /notes/{id}
PUT    /notes/{id}
DELETE /notes/{id}

GET    /decks
POST   /decks
GET    /decks/{id}
PUT    /decks/{id}
DELETE /decks/{id}

GET    /decks/{id}/cards
POST   /decks/{id}/cards
PUT    /decks/{id}/cards/{cardId}   # update card + SRS state
DELETE /decks/{id}/cards/{cardId}

POST   /decks/{id}/review            # submit review result, returns next card
```

---

### Database

**DynamoDB (On-Demand)**

- Free tier: 25 GB storage + 25 WCU/RCU provisioned (more than enough)
- On-demand mode preferred: pay per request, $0 at near-zero traffic
- Single-table design: partition by `userId`, sort key by entity type + id
- Easy to evolve schema for notes, decks, cards, review history

**Rough single-table schema**:
```
PK              | SK                        | Data
----------------|---------------------------|-------------------------------
USER#<userId>   | PROFILE                   | name, email, settings
USER#<userId>   | NOTE#<noteId>             | title, body, tags, timestamps
USER#<userId>   | DECK#<deckId>             | name, description, timestamps
USER#<userId>   | CARD#<deckId>#<cardId>    | front, back, SRS state (interval, due, ease)
USER#<userId>   | REVIEW#<cardId>#<ts>      | result, elapsed (optional log)
```

GSI if needed for querying cards due for review across decks.

---

### Infrastructure Diagram

```
Browser
  │
  ├── CloudFront ──► S3 (React SPA)
  │
  └── API Gateway (HTTP API + Cognito JWT Authorizer)
        │
        └── Lambda (Node.js handler)
              │
              └── DynamoDB (single table)

Auth flow:
  Browser ──► Cognito (login) ──► JWT ──► API Gateway ──► Lambda
```

---

## Pulumi Layout

```
infra/
  index.ts          # root stack, wires everything together
  cognito.ts        # User Pool, User Pool Client, invite-only config
  dynamodb.ts       # single table definition + GSIs
  lambda.ts         # Lambda function + IAM role
  api.ts            # API Gateway HTTP API + routes + JWT authorizer
  cdn.ts            # S3 bucket + CloudFront distribution + OAC
  dns.ts            # Route 53 records (optional)
  Pulumi.yaml
  Pulumi.<env>.yaml

src/                # Lambda source (TypeScript)
  handlers/
    notes.ts
    decks.ts
    cards.ts
    review.ts
  lib/
    db.ts           # DynamoDB client + helpers
    srs.ts          # SM-2 spaced repetition logic

web/                # React frontend (Vite)
  src/
    pages/
    components/
    lib/
```

---

## Cost Estimate (family of ~5, low usage)

| Service          | Free Tier                        | Likely cost   |
|------------------|----------------------------------|---------------|
| S3               | 5 GB, 20K PUT, 200K GET          | $0            |
| CloudFront       | 1 TB transfer, 10M requests      | $0            |
| Cognito          | 50,000 MAUs                      | $0            |
| Lambda           | 1M req, 400K GB-sec              | $0            |
| API Gateway      | 1M req (12 mo free), then ~$1/M  | ~$0           |
| DynamoDB         | 25 GB, 25 WCU/RCU                | $0            |
| Route 53         | $0.50/mo per hosted zone         | ~$0.50/mo     |
| **Total**        |                                  | **~$0.50/mo** |

---

## Spaced Repetition

Implement SM-2 (SuperMemo 2) in `src/lib/srs.ts`:
- Each card stores: `interval` (days), `repetitions`, `easeFactor`, `dueDate`
- On review: user rates 0–5, algorithm updates interval and due date
- Frontend fetches cards due today and presents them in sequence
- Simple, well-understood, no external dependency

---

## Open Questions / Decisions

1. **Monorepo or separate repos?** Monorepo (one repo, `web/`, `src/`, `infra/`) is
   simpler for a solo/family project.
2. **Custom domain?** Optional. Can use CloudFront default domain to start.
3. **Rich text notes or Markdown?** Markdown + a lightweight editor (e.g.
   CodeMirror or simple textarea) keeps things simple and portable.
4. **Card creation from notes**: Link cards to a note ID or keep them
   independent? Start independent, add linking later.
5. **Environments**: Single `prod` stack to start. Add `dev` if needed.
6. **CI/CD**: GitHub Actions deploying frontend to S3 + invalidating CloudFront,
   and running `pulumi up` for infra changes. Deferred initially.

---

## Next Steps

1. Initialize Pulumi project in `infra/`
2. Define Cognito User Pool (invite-only) + create family users
3. Define DynamoDB table
4. Scaffold Lambda handlers with basic CRUD
5. Wire API Gateway with JWT authorizer
6. Scaffold Vite/React frontend with Amplify Auth
7. Build notes UI
8. Build flashcard deck + review UI (SM-2)
9. Deploy and test end-to-end
10. Harden (error handling, loading states, mobile layout)
11. PWA (service worker, offline, installable) — later
