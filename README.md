# Agarwal Family — Household Ledger

A household net worth, portfolio, and spending tracker. Two people (or more)
can open the same link on any device and see live, synced data: accounts,
balance history, a net worth trend chart, and credit card spend categorization.

This version needs **no coding, no Firebase, and no SQL** — everything runs
on GitHub (to hold the code) and Vercel (to host the app and the database).
The database is Neon Postgres, added as a free storage database directly
inside your Vercel project.

## Step 1 — Put this folder on GitHub

1. Unzip this folder if you haven't already — you should have a folder called `agarwal-ledger`.
2. Go to **github.com** and sign in (or create a free account).
3. Click the **+** in the top right corner → **New repository**. Give it any
   name (e.g. `agarwal-ledger`) → **Create repository**. Leave everything
   else as the defaults.
4. On the page that appears, click **"uploading an existing file"**.
5. Open the `agarwal-ledger` folder on your computer, select everything
   inside it (all files and folders), and drag them into the browser window.
6. Scroll down and click **Commit changes**.

## Step 2 — Import it into Vercel

1. Go to **vercel.com** and sign up / sign in using your GitHub account.
2. Click **Add New → Project**, then find and select the repository you just
   uploaded.
3. Vercel will recognize it as a Next.js app automatically. Just click
   **Deploy** — don't worry that it won't fully work yet, that's expected
   until Step 3.

## Step 3 — Add the database (a few clicks, no SQL)

1. Open your new project in Vercel, and click the **Storage** tab.
2. Click **Create Database**, and choose the **Postgres** option (this is
   powered by Neon). Give it any name and create it.
3. When asked which project(s) to connect it to, choose this project. Vercel
   will automatically add a `DATABASE_URL` environment variable to your
   project — you don't need to copy or type anything yourself.
4. Go to the **Deployments** tab, open the most recent deployment, and click
   the **⋯** menu → **Redeploy**. This makes the app pick up the new database
   connection.

That's it — no table to create by hand. The app creates the one table it
needs automatically the first time it loads.

## Step 4 — Use it

Once the redeploy finishes, open the URL Vercel gives you (something like
`your-project.vercel.app`). The first time you open it, it'll ask **"Who's
using this device?"** — pick a name (or type one). That's just a label for
this browser, not a password.

Share the same URL with whoever else should use it (e.g. your spouse). No
sign-up, no password — opening the link is enough, and you'll both see the
same numbers. Changes made on one device show up on others within a few
seconds.

## What's in here

- **Summary** — total net worth, a time-range filtered trend chart (1M/3M/YTD/1Y/3Y/All), and an asset-allocation breakdown.
- **Portfolio** — Overall / per-person views with a net-worth split and suggested account groupings (e.g. shared loans under Household).
- **Balances** — the actual ledger: add/edit/delete accounts, grouped into Banking / Investments / Credit & loans, with an "Update balances" flow each time you want to log a fresh snapshot.
- **Activity** — spending-by-category breakdown, recent credit card charges, and the full history of balance updates (editable/deletable).

## How the syncing works, honestly

- All the data lives in one row in your Neon Postgres database.
- Every device polls for changes every few seconds — so it's not truly
  instant like a chat app, but any update shows up elsewhere within about
  5 seconds.
- There's no real login. "Who's using this device" just tags your entries
  with a name so you can tell who logged what in Activity — anyone with the
  link can view and edit everything.

## If something goes wrong

- **Page says "Couldn't reach the database"**: go back to Step 3 and make
  sure the Postgres database shows as connected to this project in the
  Storage tab, then redeploy.
- **Changes from your phone aren't showing up on your laptop**: give it a
  few seconds — it polls every ~4 seconds, it's not instant.
