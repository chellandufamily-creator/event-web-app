# Deploying Event Web App

Next.js app with **server-only** secrets (Firebase Admin, Google Drive OAuth, session JWT). **Recommended path:** **Vercel + GitHub** (below). Alternatives: [Firebase App Hosting](#option-b-firebase-app-hosting--firebase-cli), [Vercel CLI](#option-c-vercel-cli-without-github), [plain Node](#option-d-node-server-vps-docker).

---

## Option A: Vercel + GitHub (start here)

### Step 1 — Put the code on GitHub

1. Create a **new empty repository** on [GitHub](https://github.com/new) (e.g. `event-web-app`). Do **not** add a README if you already have this project locally.

2. In your project folder on your computer (`EventWebApp`), if Git is not initialized yet:

   ```bash
   cd path/to/EventWebApp
   git init
   git add .
   git commit -m "Initial commit"
   ```

3. Connect GitHub and push (replace `YOUR_USER` and `event-web-app`):

   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USER/event-web-app.git
   git push -u origin main
   ```

**Important:** `.env.local` is listed in `.gitignore` — it will **not** be pushed. Secrets go only into Vercel (next step).

### Step 2 — Connect Vercel to GitHub

1. Sign up or log in at [vercel.com](https://vercel.com) (Sign in with GitHub is easiest).

2. **Add New… → Project** → **Import** your `event-web-app` repository.

3. Vercel should detect **Next.js** automatically. Leave defaults unless you know you need changes:
   - **Framework Preset:** Next.js  
   - **Build Command:** `npm run build` (matches `package.json`)  
   - **Output Directory:** default (do not set to `out` unless you switch to static export — you are not)

4. Expand **Environment Variables** before clicking Deploy.

### Step 3 — Environment variables on Vercel

Add **every** variable you use locally from **`.env.example`**, with the same names and values.

| Tip | Detail |
|-----|--------|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Paste the **entire** service account JSON as **one line** (no line breaks). |
| `SESSION_SECRET` | At least **32** characters; e.g. run `openssl rand -hex 32` locally and paste. |
| `NEXT_PUBLIC_*` | Required for the browser Firebase client; same values as in Firebase console → Web app. |
| Never | Put secrets in `NEXT_PUBLIC_*` — those are exposed to the browser. |

Set them for **Production** (and **Preview** too if you want preview deployments to work the same).

Then click **Deploy** and wait for the build to finish.

### Step 4 — After the first successful deploy

1. **Firebase → Authentication → Settings → Authorized domains**  
   Add your Vercel URL, e.g. `your-project.vercel.app` (and your custom domain later).

2. Open the URL Vercel shows — you should get the **login** page for `/`, then the album after sign-in.

3. **Future updates:** every `git push` to `main` (or your production branch) triggers a new deployment automatically.

### Limits (Vercel Hobby)

- Serverless functions have a **short max duration** on the free tier. **`/api/upload`** allows long runs in code, but Hobby may **timeout** on large/slow uploads. Use **smaller batches**, **Pro**, or shorter videos if uploads fail with timeouts.

---

## Option B: Firebase App Hosting + Firebase CLI

Uses **Google Cloud Build** + **Cloud Run**. Requires the **Blaze** plan.

1. `npm install -g firebase-tools`
2. `firebase login` → `firebase use --add`
3. `firebase apphosting:backends:create --project YOUR_PROJECT_ID`
4. Set `"backendId"` in **`firebase.json`** (replace `REPLACE_WITH_BACKEND_ID`).
5. Env vars: Firebase console → App Hosting → backend → **Environment variables**, or secrets in **`apphosting.yaml`**.
6. Deploy: `npm run deploy:firebase` or `firebase deploy --only apphosting`

Details: [Deploy from source with the Firebase CLI](https://firebase.google.com/docs/app-hosting/alt-deploy).

---

## Option C: Vercel CLI (without GitHub flow)

```bash
npm i -g vercel
cd path/to/EventWebApp
vercel login
vercel
```

Add env vars in the Vercel dashboard for the linked project. Production: `vercel --prod`.

---

## Option D: Node server (VPS, Docker, etc.)

```bash
npm ci
npm run build
NODE_ENV=production npm run start
```

Set the same variables as **`.env.example`**. Use **HTTPS** in production (or `FORCE_SECURE_COOKIES=1` on HTTPS).

---

## Checklist

| Item | Notes |
|------|--------|
| Repo on GitHub | No `.env.local` in git |
| Vercel env vars | Match `.env.example` / `.env.local` |
| Firebase authorized domains | `*.vercel.app` + custom domain |
| `SESSION_SECRET` | Strong, unique per environment |
