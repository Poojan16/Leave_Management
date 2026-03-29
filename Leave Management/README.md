# Leave Management System

> A production-ready, full-stack leave management platform for modern teams — built with FastAPI, React, and AI-powered features.

---

## Problem Statement

Managing employee leave manually through emails and spreadsheets creates bottlenecks, approval delays, and zero visibility into team availability. HR teams waste hours reconciling balances, managers miss requests buried in inboxes, and employees have no self-service way to plan time off. This system replaces that chaos with a structured, role-based workflow.

---

## Solution & Key Features

- **Role-based access** — Employee, Manager, and Admin roles with scoped permissions
- **Leave lifecycle** — Apply → Manager approval → HR admin override, with email notifications
- **AI-powered parsing** — Type leave requests in plain English; Claude extracts dates, type, and reason
- **Anomaly detection** — Automatically flags suspicious leave patterns (Monday/Friday abuse, sudden spikes)
- **Leave planning suggestions** — AI recommends optimal windows to use remaining balance before year-end
- **Real-time balance tracking** — Per-employee, per-type balances updated on every approval
- **Reports & exports** — PDF and Excel reports for HR and managers
- **Audit trail** — Every action logged with user context
- **Structured logging** — JSON logs in production, human-readable in dev (structlog)
- **Sentry monitoring** — Exception tracking with user context and performance tracing

---

## Screenshots

| Screen | Description |
|--------|-------------|
| `[Dashboard]` | Employee dashboard showing leave balance cards and recent requests |
| `[Apply Leave]` | AI-assisted leave application form with natural language input |
| `[Manager View]` | Pending approvals queue with team calendar overlay |
| `[Admin Panel]` | User management, leave type configuration, and analytics |
| `[Reports]` | Downloadable PDF/Excel reports with filters |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | FastAPI 0.111, Python 3.12 |
| Database | PostgreSQL 16 + SQLAlchemy 2 (async) |
| Migrations | Alembic |
| Task Queue | Celery + Redis |
| Frontend | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + shadcn/ui |
| State / Data | TanStack Query v5 |
| Auth | JWT (access + refresh tokens) |
| AI | Anthropic Claude (claude-sonnet-4-6) |
| Email | SendGrid |
| Monitoring | Sentry + structlog |
| CI/CD | GitHub Actions |
| Backend Hosting | Render |
| Frontend Hosting | Vercel |
| Containerisation | Docker + docker-compose |

---

## Local Development Setup

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- Python 3.12+

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/<your-username>/leave-management.git
cd leave-management
```

**2. Configure environment variables**
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# Edit both files and fill in required values
```

**3. Start infrastructure (Postgres + Redis)**
```bash
docker-compose up -d
```

**4. Run database migrations**
```bash
cd backend
pip install -r requirements.txt
alembic upgrade head
```

**5. Seed demo data**
```bash
python scripts/seed.py
```

**6. Start the backend**
```bash
uvicorn main:app --reload --port 8000
```

**7. Start the frontend**
```bash
cd frontend
npm install
npm run dev
```

Frontend runs at `http://localhost:5173`, API at `http://localhost:8000`.

---

## API Documentation

Swagger UI is available at `/api/docs` (non-production only).

Key endpoint groups:
- `POST /api/v1/auth/login` — obtain JWT tokens
- `GET/POST /api/v1/leaves` — employee leave operations
- `GET/PATCH /api/v1/manager/leaves` — manager approval workflow
- `GET/POST /api/v1/admin/*` — admin user and config management
- `POST /api/v1/ai/parse-leave` — natural language → structured leave data
- `GET /api/v1/ai/anomalies` — leave pattern anomaly detection
- `GET /api/v1/ai/suggestions` — personalised leave planning suggestions

---

## Deployment Guide

### Backend → Render

1. Create a [Render](https://render.com) account
2. New → Blueprint → connect your GitHub repo
3. Render reads `render.yaml` and provisions: web service, PostgreSQL, Redis
4. Set secret env vars in Render dashboard: `SENTRY_DSN`, `ANTHROPIC_API_KEY`, `SENDGRID_API_KEY`, `FROM_EMAIL`
5. After first deploy, open Render shell and run: `python scripts/seed.py`

### Frontend → Vercel

1. Create a [Vercel](https://vercel.com) account
2. Import your GitHub repo
3. Set framework preset to **Vite**
4. Add environment variable: `VITE_API_URL=https://<your-render-service>.onrender.com`
5. Deploy

### GitHub Secrets required for CI/CD

| Secret | Description |
|--------|-------------|
| `RENDER_DEPLOY_HOOK` | Render deploy hook URL |
| `VERCEL_TOKEN` | Vercel CLI token |
| `BACKEND_URL` | Deployed backend URL (for smoke test) |
| `FRONTEND_URL` | Deployed frontend URL (for smoke test) |

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL async URL (`postgresql+asyncpg://...`) |
| `REDIS_URL` | ✅ | Redis URL (`redis://...`) |
| `SECRET_KEY` | ✅ | JWT signing secret (min 32 chars) |
| `ENVIRONMENT` | ✅ | `development` or `production` |
| `ANTHROPIC_API_KEY` | ⚠️ | Required for AI features |
| `SENTRY_DSN` | ⚠️ | Required for error monitoring |
| `SENDGRID_API_KEY` | ⚠️ | Required for email notifications |
| `FROM_EMAIL` | ⚠️ | Sender email address |
| `CORS_ORIGINS` | ✅ | Comma-separated allowed origins |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | — | Default: 30 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | — | Default: 7 |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | ✅ | Backend API base URL |

---

## Contributing

1. Fork the repo and create a feature branch: `git checkout -b feat/your-feature`
2. Follow existing code style (ruff for Python, ESLint for TypeScript)
3. Write tests for new functionality
4. Open a pull request — CI must pass before merge

---

## License

MIT License. See [LICENSE](LICENSE) for details.
