# Session Polls

Live polls for sessions and workshops, in the dinakhedr.com style.
Participants join by scanning a QR code or typing a 6-digit code — no sign-up needed.

**Features**

- Organise work as **Partners → Programs → Sessions** (e.g. ICEALEX → ECH Impact Edition → Day 1)
- Rename, duplicate and delete sessions; rename and delete partners and programs, with clear confirmations
- Multiple-choice polls (one or several answers), rating scales (1–5 or 1–10) and **word clouds** (short typed answers; click a word on the presenter screen to remove it)
- Per question: show results **live** or **only after voting closes**, with an optional **timer** (e.g. 60 seconds) that closes voting and reveals results automatically
- Duplicate a question or a whole session (with all its questions), without the votes
- Full-screen presenter view with a QR code and results that update live
- One vote per device per poll
- Show or hide results, open or close voting, move between polls
- Export all responses as a CSV file (opens in Excel or Google Sheets)

**Built with:** Next.js (the website) · Supabase (database and live updates) · Vercel (hosting). All three have free plans.

---

## Setup guide (about 30–45 minutes, once)

You will create two free accounts, paste one file, and copy two keys. No coding is needed.

### Step 1 — Create the database on Supabase

1. Go to **supabase.com** and click **Start your project**. Sign up with your GitHub account.
2. Click **New project**.
   - **Name:** `session-polls`
   - **Database password:** click *Generate a password* and save it somewhere safe (you will rarely need it).
   - **Region:** choose the closest one to Egypt, e.g. *Central EU (Frankfurt)*.
3. Click **Create new project** and wait about two minutes until it is ready.

### Step 2 — Set up the tables (paste one file)

1. In this GitHub repository, open the file **`supabase/schema.sql`**, click the **copy** icon (top right of the file view) to copy everything.
2. In Supabase, open **SQL Editor** in the left menu, then **New query**.
3. Paste the text and click **Run**.
4. You should see **"Success. No rows returned."** That is the expected result.

> Run this file only once. Running it a second time shows "already exists" errors — that is harmless, nothing is broken.

### Step 3 — Create your host login (and block other sign-ups)

1. In Supabase, open **Authentication** → **Sign In / Providers** (the exact label may vary slightly).
2. Turn **off** *Allow new users to sign up*, and save. This keeps the host area private to you.
3. Open **Authentication** → **Users** → **Add user** → **Create new user**.
4. Enter your email and a strong password, tick **Auto Confirm User**, and click **Create user**.

This email and password are what you will use to sign in to the app.

### Step 4 — Copy your two Supabase keys

1. In Supabase, open **Project Settings** (gear icon) → **API** (or **Data API** / **API Keys**).
2. Copy and keep these two values for the next step:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public key** (may be called **publishable key**) — a long text starting with `eyJ…` or `sb_publishable_…`

> Never use the **service_role** / **secret** key in this app. The anon/publishable key is safe to use in a website because the database security rules protect your data.

### Step 5 — Put the app online with Vercel

1. Go to **vercel.com** and sign up with your **GitHub** account (the *Hobby* plan is free).
2. Click **Add New…** → **Project**.
3. Find **session-polls** in the list and click **Import**.
   *Not in the list?* Click **Adjust GitHub App Permissions** and give Vercel access to the `session-polls` repository.
4. Leave the framework as **Next.js**. Open **Environment Variables** and add both:

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | your publishable key (`NEXT_PUBLIC_SUPABASE_ANON_KEY` also works) |

   Tip: in Supabase, the **Connect** button → **Framework** → `.env.local` tab shows both lines ready to copy. You can paste both lines at once into Vercel's first *Key* box and Vercel fills in both variables.

5. Click **Deploy** and wait one to two minutes.
6. Vercel shows your app's address, e.g. `session-polls-dinakhedr.vercel.app`. That is your polling app.

### Step 6 — Test it

1. Open `https://YOUR-APP-ADDRESS/login` and sign in with the account from Step 3.
2. Create a session, add one poll, and click **Open presenter view**.
3. Scan the QR code with your phone and vote. The result should appear on the presenter screen within a second or two.

Done. From now on, any change pushed to this GitHub repository is published automatically by Vercel.

### Optional — Use your own address (e.g. polls.dinakhedr.com)

In Vercel, open the project → **Settings** → **Domains** → add `polls.dinakhedr.com`. Vercel will show one DNS record (a *CNAME*) to add where your domain's DNS is managed. It usually works within an hour.

---

## Updating an existing installation

When a new version needs a database change, an update file is added to the `supabase` folder. Run each update **once**, in order, in Supabase → **SQL Editor** → **New query** → paste → **Run**:

| File | Adds |
|---|---|
| `supabase/update-01-partners-programs.sql` | Partners, programs, result timing per question, duplicate question/session |
| `supabase/update-02-word-cloud.sql` | Word cloud questions, with answer removal from the presenter screen |
| `supabase/update-03-timer.sql` | Timed polls (countdown on phones and screen, automatic close and reveal) |

New installations do not need update files: `supabase/schema.sql` already includes them.

---

## Running a session

**Before the session**

1. Sign in. Add a **partner** (e.g. *ICEALEX*), then a **program** under it (e.g. *ECH Impact Edition*), then a **session** in that program (e.g. *Day 1*).
2. Add your polls in order. For each, choose whether results show **live** or **after you close voting**. Use **Duplicate** to reuse a question, or **Duplicate session** to repeat a whole session for another group.
3. Open the app the day before, so the database is awake (see "Good to know" below).

**During the session**

1. Click **Open presenter view** and move that window to the projector. Press **F** for full screen.
2. The welcome screen shows the QR code and code. Attendees join and wait.
3. Click **Start first poll**. It appears on every phone immediately, and results grow live.
4. Use **Next poll** to move on. The previous poll's voting closes automatically.

**Presenter controls and keyboard shortcuts** (most presentation clickers work too)

| Action | Button | Key |
|---|---|---|
| Next poll | Next poll → | → , Page Down, Space |
| Previous poll / welcome screen | ← Previous | ← , Page Up |
| Close or reopen voting (reveals results for "after closing" polls); for timed polls: End now / Restart timer, plus a **+15 s** button | Close voting | V |
| Hide or show results (screen and phones) | Hide results | R |
| Hide or show the QR code | Hide QR | Q |
| Full screen | Full screen | F |

The control bar fades out after a few seconds; move the mouse to bring it back.

**After the session**

Open the session and click **Export results (CSV)**. Each row is one response, with an anonymous participant reference (e.g. `P-3F9A1C`) so you can see answers from the same device across polls.

---

## Good to know

- **Free-plan pause:** Supabase may pause free projects after about a week without any activity. If the app shows connection errors, open your Supabase dashboard and click **Restore project**, then wait a few minutes. Opening the app the day before a session avoids surprises.
- **Audience size:** the free Supabase plan limits the number of simultaneous live connections (about 200 at the time of writing). For larger audiences, Supabase's paid plan raises this.
- **One vote per device** is based on an anonymous ID stored in the phone's browser. It stops casual double voting; someone using several devices or a private window could vote again — this is normal for anonymous polling tools.
- **Editing polls:** a poll that already has responses is locked to keep results accurate. Use *Clear responses* first if you need to change it.
- **Privacy:** no names, emails or personal data are collected from participants.

## Troubleshooting

| Problem | Solution |
|---|---|
| Login page says the app is not connected to Supabase | The environment variables are missing or misspelled in Vercel (Step 5). Fix them in Vercel → Settings → Environment Variables, then **Deployments → Redeploy**. |
| "The email or password is incorrect" | Check the user in Supabase → Authentication → Users. You can reset the password there. |
| Results on the presenter screen update slowly | They still refresh every few seconds. For instant updates, check that Step 2 completed successfully. |
| Phones do not switch to the next poll | They refresh within 15 seconds at most, and immediately when the phone screen is reopened. Check the venue Wi-Fi. |
| Vercel build failed | Open the failed deployment in Vercel, copy the error message, and share it with Claude to fix. |

---

## For developers

```bash
cp .env.example .env.local   # add your Supabase URL and publishable key
npm install
npm run dev                   # http://localhost:3000
```

| Path | Purpose |
|---|---|
| `app/page.tsx` | Join page (enter code) |
| `app/join/[code]/page.tsx` | Participant voting page |
| `app/login/page.tsx` | Host sign-in |
| `app/dashboard/page.tsx` | Host session list |
| `app/sessions/[id]/page.tsx` | Session editor, CSV export |
| `app/present/[id]/page.tsx` | Presenter screen |
| `app/globals.css` | Design system (tokens from dinakhedr.com) |
| `supabase/schema.sql` | Tables, security rules, voting functions |

Participants never access tables directly: they call `get_live_state` and `cast_vote` (security-definer functions with validation). Hosts are protected by Row Level Security. Phones are notified of changes through a Supabase Realtime broadcast channel (`room-<code>`); the presenter receives votes through Postgres changes on `votes`, with polling fallbacks on both.
