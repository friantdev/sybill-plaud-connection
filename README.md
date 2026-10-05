# PLAUD-to-Sybill Serverless Integration

Production-ready, serverless integration service that receives PLAUD transcript-ready webhook events via Zapier, enforces verified sales identity mappings, stores meetings and transcripts with deduplication and drift protection, and safely delivers them to Sybill with exponential backoff and atomic concurrency locking.

---

## Architecture Overview

```
[PLAUD] 
   │ (Transcript Ready)
   ▼
[Zapier Webhook Action]
   │ POST /api/v1/webhooks/plaud
   ▼
[API Gateway] ──► [api (Express.js)]
                            │
                            ├── 1. Verify Webhook Secret/Signature & Timestamp
                            ├── 2. Store Meeting, Transcript & Summary in MongoDB
                            └── 3. Dispatch Sybill Delivery (Atomic Claim)
                                   ├─ 2xx: Status -> SUBMITTED
                                   ├─ 429/5xx: Status -> RETRY_PENDING (Backoff + Jitter)
                                   └─ 4xx: Status -> FAILED
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### 1. Webhooks
- **`POST /api/v1/webhooks/plaud`**
  - **Headers**:
    - `Content-Type: application/json`
    - `x-webhook-secret: <WEBHOOK_SECRET>` (or `x-plaud-signature: sha256=<HMAC>`)
    - `x-timestamp: <ISO8601>`
  - **Body**:
    ```json
    {
      "user": {
        "name": "name",
        "email": "email",
    },
    "plaud_data": {
      "title": "title",
      "summary": "summary",
      "transcript": "transcript",
      "create_time": "createTime",
    }
    }
    ```

### 2. Health & Monitoring
- **`GET /`**: Returns system liveness and MongoDB readiness status.

---

## Local Development & Testing

### 1. Environment Setup
Create a `.env` file from `.env.example`:
```bash
cp .env.example .env
```

### 2. Start Local Server
Run with Node's native watch mode (no nodemon needed):
```bash
npm run dev
# Or standard start:
npm start
```

### 3. Run Automated Tests
```bash
npm test
```

---

## Serverless Deployment

Deploy using the Serverless Framework:
```bash
npx serverless deploy --stage prod
```