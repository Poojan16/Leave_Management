# Leave Management System — Portfolio

## Problem Statement

Mid-sized companies lose significant HR bandwidth to manual leave tracking: emails get lost, spreadsheet balances drift out of sync, and managers have no real-time view of team availability. The result is approval delays, payroll errors, and frustrated employees. This project replaces that fragmented process with a single, role-aware platform.

---

## Solution Overview

A full-stack leave management system with three distinct user roles (Employee, Manager, Admin), an AI-powered natural language interface, automated email notifications, and a complete audit trail — deployed on cloud infrastructure with CI/CD from day one.

---

## Feature Highlights & Business Impact

| Feature | Business Impact |
|---------|----------------|
| Role-based approval workflow | Eliminates email chains; average approval time drops from days to hours |
| AI natural language parsing | Employees apply for leave in plain English — no form confusion |
| Anomaly detection | HR proactively identifies leave abuse patterns before they become HR issues |
| Leave planning suggestions | Reduces year-end leave encashment liability by prompting employees to plan ahead |
| Real-time balance dashboard | Zero balance disputes — employees always see accurate remaining days |
| PDF/Excel reports | One-click compliance reports for audits and payroll |
| Audit log | Full traceability for every action — who did what and when |
| Email notifications | Managers and employees stay informed without checking the app |

---

## Tech Decisions & Why

**FastAPI over Django**
FastAPI's async-first design handles concurrent DB queries and external API calls (Claude, SendGrid) without blocking. Django's ORM is synchronous by default, which would require workarounds for the same throughput. FastAPI also generates OpenAPI docs automatically — useful for frontend integration.

**TanStack Query over Redux**
Leave data is server state, not client state. TanStack Query handles caching, background refetching, and optimistic updates out of the box. Redux would require significant boilerplate (actions, reducers, thunks) for the same result with no added benefit here.

**SQLAlchemy 2 async over Tortoise ORM**
SQLAlchemy's async support is mature, has first-class Alembic migration support, and the expression language gives fine-grained control over complex queries (team leave calendars, balance aggregations). Tortoise ORM's migration tooling is less battle-tested.

**Celery + Redis over background tasks**
Email notifications and report generation are fire-and-forget operations that shouldn't block the HTTP response. FastAPI's built-in BackgroundTasks run in the same process and can't be retried on failure. Celery with Redis gives reliable task queuing, retries, and observability.

**Anthropic Claude over OpenAI**
Claude's instruction-following for structured JSON output is highly reliable, which is critical for the leave parsing feature where malformed output would break the form pre-fill. The model also handles ambiguous date references ("next Monday", "this Friday") accurately.

**Render + Vercel over AWS**
For a portfolio project, Render's `render.yaml` infrastructure-as-code and Vercel's zero-config frontend deploys provide production-grade hosting with minimal DevOps overhead. The same architecture patterns (Docker, env vars, health checks) transfer directly to ECS/EKS if the project scales.

---

## Challenges Faced & How Solved

**Challenge: Async SQLAlchemy with lazy-loaded relationships**
Lazy loading raises `MissingGreenlet` errors in async context. Solved by using `lazy="selectin"` on all relationships, which issues a second SELECT but works correctly in async sessions.

**Challenge: Claude returning markdown-wrapped JSON**
Claude occasionally wraps JSON in ` ```json ``` ` fences despite instructions. Solved by stripping fence markers before `json.loads()` and adding a fallback return with `confidence: 0.0` so the UI degrades gracefully.

**Challenge: Rate limiting per-user vs per-IP**
SlowAPI's default key is remote IP, which breaks behind proxies. Solved by implementing a custom key function that extracts the user ID from the JWT when present, falling back to IP for unauthenticated routes.

**Challenge: Alembic autogenerate with async engine**
Alembic's `env.py` runs synchronously but the app uses an async engine. Solved by using `run_sync` in the migration environment and configuring a separate sync URL for Alembic only.

---

## Metrics

- **12 API endpoints** across auth, leaves, manager, admin, and AI modules
- **5 database models** with full relationship mapping and indexes
- **4 AI functions** — parse, categorize, anomaly detection, suggestions
- **3 user roles** with scoped permissions enforced at the dependency layer
- **2 export formats** — PDF (ReportLab) and Excel (openpyxl)
- **Full CI pipeline** — lint → test → build → deploy on every push to main

---

## Live Demo

🔗 **Live URL:** `[Add after deployment]`

📹 **Demo Video:** `[Add Loom link after recording]`

🐙 **GitHub:** `[Add repo URL]`

---

## Demo Video Script (3-minute walkthrough)

**0:00 – 0:20 | Hook**
"Managing leave through emails and spreadsheets is broken. Here's a better way."
Show the login screen, briefly explain the three roles.

**0:20 – 1:00 | Employee flow**
Log in as employee. Show balance dashboard. Use the AI input: type "I need next Monday and Tuesday off for a dental appointment" — watch the form auto-fill. Submit the request.

**1:00 – 1:40 | Manager flow**
Switch to manager account. Show the pending approvals queue. Approve the request. Show the team calendar updating in real time.

**1:40 – 2:10 | Admin + AI features**
Switch to admin. Show the anomaly detection panel — highlight a flagged employee. Show the leave planning suggestions for an employee with high remaining balance.

**2:10 – 2:40 | Reports & audit**
Generate a PDF report for the current month. Open the audit log — show every action is tracked.

**2:40 – 3:00 | Close**
"Built with FastAPI, React, and Claude AI. Full source on GitHub. Link in the description."
