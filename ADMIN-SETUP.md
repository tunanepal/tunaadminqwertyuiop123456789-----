# Where to put the admin files

## Only 6 files

```
tunanepal-admin/
│
├── index.html          ← ROOT. Not in a folder.
│
├── css/
│   └── admin.css
│
└── js/
    ├── api.js          ← your Supabase URL and key
    ├── ui.js           ← toasts, modals, formatting
    ├── dashboard.js    ← the stat tiles and four charts
    └── main.js         ← sign-in, sidebar routing, theme toggle
```

Same rules as the player app: lowercase folder names, `index.html` at the
root, don't move anything around.

There are no icons and no service worker here — the admin panel is a desktop
tool, not something you install on a phone.

---

## Put this somewhere separate from the player app

**Do not upload this into the same repository as the player app.** Anyone
poking at `yoursite.com/admin/` would find the login screen. It's password
protected, but there's no reason to advertise where it lives.

Pick one:

### Option 1 — Netlify, private repo *(recommended)*

1. Make a **second** GitHub repo, set it to **Private**
2. Upload these 6 files
3. Go to **app.netlify.com** → **Add new site** → **Import an existing project**
4. Connect GitHub, pick that private repo
5. Leave build settings blank — there's nothing to build
6. Deploy

Netlify works with private repos on the free plan. You get an address like
`tuna-admin-x7f2.netlify.app` that nobody will guess.

### Option 2 — a second public GitHub Pages repo

Works fine, just give it a name nobody would try. Not `tunanepal-admin` —
something like `tn-internal-9f3`. Same steps as the player app: upload,
Settings → Pages → main / root.

### Option 3 — your own computer only

The most private option. Keep the folder on your machine and run it when you
need it:

```bash
cd tunanepal-admin
python3 -m http.server 8081
```

Then open **http://localhost:8081**. Nobody else can reach it at all. The
downside is you can only approve deposits from that one computer.

You can't just double-click `index.html` — modules need a real address, same
as the player app.

---

## First sign-in

Your details:

- **Admin ID:** `20630620`
- **Password:** `PASSWORD`

**Change the password immediately.** It's in the sidebar, bottom left, next to
your ID — the **Password** button. Use at least 8 characters.

That default is written into `01_schema.sql`. If those SQL files ever end up
somewhere public, anyone who reads them has your login. Changing it stores a
new bcrypt hash in the database, and the old one stops working everywhere.

While you're there, the **Dark / Light** toggle sits just above it. Dark is
the default; the charts redraw correctly either way.

---

## What the dashboard shows you

**Top row of tiles**
- Players, and how many joined today
- **Points in wallets** — this is money you owe players, not money you have
- **Commission earned** — your actual revenue, 12% of every settled match
- **Awaiting review** — work sitting in your queue

**Second row** — open rooms, matches being played, disputes, average rating

**Four charts**
- Money in vs out over 14 days
- Matches per day with commission drawn over the top
- New sign-ups per day
- PUBG vs Free Fire split

**Sidebar badges** — the little orange numbers count pending deposits,
withdrawals, UC orders, disputes and open reports. You can see what needs
doing without clicking into anything.

The dashboard refreshes itself every 45 seconds while the tab is open.

---

## What's still a placeholder

Every sidebar item except **Dashboard** shows "Next section". Those are the
next builds:

| Coming next | What it does |
|---|---|
| Deposits | See screenshots, approve, points credit automatically |
| Withdrawals | Approve or reject, plus the paid / unpaid queue |
| Players | Search, add or remove points, block and unblock |
| Store purchases | PUBG UC orders with the player's PUBG ID and proof |
| QR codes | Upload eSewa and Khalti QR, set a wallet limit |
| Matches | Win claims with proof, release the payout |
| Notifications | Message one player by phone, or everyone |
| Reports | Chat with players, view their photo and video evidence |
| Ads, UC packs, Settings | Banners, prices, commission percent |

Each one is a new file dropped into `js/` plus a small edit to `index.html`.
Nothing you set up now gets thrown away.

---

## If something looks wrong

**Charts don't appear** — Chart.js loads from a CDN. Check your internet, and
check the browser console (F12) isn't blocking `cdn.jsdelivr.net`.

**"Wrong admin ID or password"** — the SQL seed only creates the admin when
`01_schema.sql` runs on an empty database. Confirm it ran without errors.

**"Admin session expired"** — normal after 7 days. Sign in again.

**Everything unstyled** — `css/admin.css` isn't where the HTML expects it.
Check the folder is lowercase `css`.
