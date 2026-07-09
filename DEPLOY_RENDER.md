# Deploy GenSoft on Render

## Security first

You shared a database password in chat. **Rotate it now** in Render:
PostgreSQL → your database → **Connections** → **Reset password**.

Never commit `DATABASE_URL` or passwords to GitHub.

---

## 1. PostgreSQL (you already created this)

In Render → your Postgres → **Connections** copy:

- **Internal Database URL** — use this on the **backend** web service (same Render account/region)
- **External Database URL** — use only for testing from your PC

Example shape (not real values):

```text
postgresql://USER:PASSWORD@dpg-xxxxx-a.REGION-postgresql.render.com/gensoftorder
```

---

## 2. Backend web service

| Setting | Value |
|---------|--------|
| Root directory | `backend` |
| Build | `pip install -r requirements.txt` |
| Start | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/api/health` |

**Environment variables:**

| Key | Value |
|-----|--------|
| `DATABASE_URL` | Paste **Internal** Postgres URL from Render |
| `JWT_SECRET` | Long random string (32+ characters) |
| `CORS_ORIGINS` | `https://YOUR-FRONTEND.onrender.com` |

On first deploy, tables are created automatically. Super admin: `superadmin` / `admin1234`.

---

## 3. Frontend static site

| Setting | Value |
|---------|--------|
| Root directory | `frontend` |
| Build | `npm install && npm run build` |
| Publish | `dist` |

**Environment variable (build time):**

| Key | Value |
|-----|--------|
| `VITE_API_URL` | `https://gensoft-order.onrender.com/api` |

**Important:** `VITE_API_URL` is baked in at **build time**. After adding/changing it, trigger a **new deploy** of the static site.

Or use Render **rewrite** rules so `/api` proxies to the backend (see `render.yaml`).

---

## 4. Local test against Render Postgres (optional)

Create `backend/.env` (gitignored):

```env
DATABASE_URL=postgresql://...
JWT_SECRET=local-test-secret
```

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

---

## Datadog

**Not required.** Render logs are enough for launch.
