# Final Deployment Guide — Connect `vsllp.live` to YesBoss

This guide walks you through connecting your GoDaddy domain **vsllp.live** to your
YesBoss app, step by step. Follow it in order. Do **not** skip any step.

If you get stuck anywhere, stop and ask for help — do not guess.

---

## What we are building

| Before (current) | After (goal) |
|---|---|
| App at `http://52.140.177.20:3000` | App at `https://vsllp.live` |
| No SSL / not secure | Secure (HTTPS) with free SSL |
| Login cookies broken over HTTP | Login cookies work correctly |
| Raw IP must be typed | Clean domain name, easy to share |

**Very important:** after this change, the old addresses
`http://52.140.177.20:3000` and `http://52.140.177.20:8000` will **stop working**.
Always use `https://vsllp.live` from now on.

---

## What you need before starting

- Your GoDaddy login (email + password) for the account that owns **vsllp.live**
- Your Azure login (the Microsoft account used for the server / VPS)
- Your Google/Firebase login (the account that owns the **yesboss-8b789** Firebase project)
- Your GitHub login (to push the code and trigger the deployment)
- Let's Encrypt email for the SSL certificate: **`yesbossvsllp1@gmail.com`**

---

# PART A — GoDaddy: point the domain to your server

This tells the internet: "whoever types vsllp.live goes to 52.140.177.20".

### A1. Log in to GoDaddy

1. Open a browser and go to: `https://www.godaddy.com`
2. Click **Sign In** (top-right corner).
3. Enter your GoDaddy username/email and password, click **Sign In**.
4. If it asks for a verification code, check your phone/email and enter it.

### A2. Open your domain's DNS settings

1. On the GoDaddy home page, click **My Products** in the top menu.
2. Find **vsllp.live** in the list of domains.
3. Click the **DNS** button to the right of the domain
   (if you don't see it, click **Manage** → then **DNS** on the left menu).
4. You are now on the **DNS Management** page. Make sure the **DNS Records** tab
   is selected at the top (there is also a "Nameservers" tab — we are using the
   **DNS Records** tab, not Nameservers).

### A3. Delete the default GoDaddy A record (if one exists)

1. Look for a row where the **Type** is **A** and the **Name/Host** is **@**.
2. If it exists and points to a GoDaddy "parking" IP (like `64.98.145.30` or
   anything that is **not** `52.140.177.20`), click the **pencil / edit** icon on
   that row to open it, then click **Delete** at the bottom, and click
   **Delete** again to confirm.
   - If there is no A record with name `@`, skip this step.

### A4. Add the main A record (@)

1. Click the **Add New Record** (or **Add**) button.
2. Fill in the fields exactly:
   - **Type:** `A`
   - **Name / Host:** `@`
   - **Value / Points to:** `52.140.177.20`
   - **TTL:** `600 Seconds` (or just leave the default)
3. Click **Save**.
4. A confirmation popup appears — click **Continue** / **Save** again if asked.

### A5. Add the www A record

1. Click **Add New Record** again.
2. Fill in the fields exactly:
   - **Type:** `A`
   - **Name / Host:** `www`
   - **Value / Points to:** `52.140.177.20`
   - **TTL:** `600 Seconds` (or default)
3. Click **Save**.

### A6. Delete any Domain Forwarding that conflicts (optional but recommended)

If GoDaddy has a "Domain Forwarding" rule (e.g. forwards vsllp.live to
some parked page), remove it:

1. Go to **My Products** → next to vsllp.live click **Manage**.
2. On the left menu, click **Domain Forwarding**.
3. Delete any forwarding rules you see.
4. Click **Save**.

✅ **GoDaddy part done.** It can take **15 minutes to 24 hours** for the changes
to spread across the internet. Proceed to Part B while you wait — but do **not**
run the deployment (Part D) until the DNS check in Part C passes.

---

# PART B — Azure: open ports 80 and 443

Your server only allows certain "doors" (ports). We need to open port **80**
(HTTP) and port **443** (HTTPS) so the domain can reach your app.

### B1. Log in to Azure

1. Open a browser and go to: `https://portal.azure.com`
2. Sign in with the Microsoft account that owns the server.
3. The Azure dashboard (home page) loads.

### B2. Find your Virtual Machine

1. In the search bar at the top (it says "Search resources, services, and docs"),
   type: `virtual machines`
2. Click the result **Virtual machines** (under "Services").
3. In the list, find your VM. It is the one hosting the app (the server at IP
   `52.140.177.20`). If unsure of the name, look at the **Public IP address**
   column — find the row showing **52.140.177.20**.
4. Click that VM's name to open it.

### B3. Open the Network settings

1. In the left menu of the VM page, click **Networking**.
2. This shows a "Network security group" (NSG) and its inbound rules.

### B4. Add inbound rules for ports 80 and 443

**Port 443 (HTTPS):**

1. Click **+ Add inbound port rule** at the top.
2. Fill in:
   - **Source:** `Any`
   - **Source port ranges:** `*` (or leave blank)
   - **Destination:** `Any` (or leave default)
   - **Service:** `HTTPS` (this automatically sets destination port 443)
   - **Name:** `AllowHTTPS`
3. Click **Add** (bottom of the panel).
4. Wait for the "Successfully saved" notification.

**Port 80 (HTTP):**

1. Click **+ Add inbound port rule** again.
2. Fill in:
   - **Source:** `Any`
   - **Source port ranges:** `*`
   - **Destination:** `Any`
   - **Service:** `HTTP` (automatically sets destination port 80)
   - **Name:** `AllowHTTP`
3. Click **Add**.
4. Wait for the "Successfully saved" notification.

> If the VM uses **Ubuntu/CentOS firewall (ufw/firewalld)** instead, don't
> worry — the deployment script handles that automatically.

✅ **Azure part done.** Ports 80 and 443 are now open.

---

# PART C — Check that the domain is pointing to your server

You must wait until this check passes before deploying.

### C1. Wait for DNS to spread

After finishing Part A, wait **at least 30–60 minutes** (usually it's faster,
sometimes up to 24 hours).

### C2. Check the domain

**Option 1 — in your browser:**

1. Open `https://dnschecker.org`
2. Type `vsllp.live` in the box and press Enter.
3. Wait for all the green checks. The result for most locations should show
   IP `52.140.177.20`.
4. Do the same for `www.vsllp.live`.

**Option 2 — on your own computer:**

1. Press the **Windows** key, type `cmd`, press Enter (Command Prompt opens).
2. Type exactly: `nslookup vsllp.live` and press Enter.
3. Look at the last line — it should say:
   `Address: 52.140.177.20`
4. If it shows a different IP (or "Non-existent domain"), wait more and try again.

### C3. When can I continue?

- ✅ **If the IP shows `52.140.177.20`** → you can proceed to Part D.
- ❌ **If it shows anything else** → wait 30 minutes and check again. Do **not**
  deploy yet.

---

# PART D — Commit the code and deploy

The repository already contains all the server changes (this guide's code was
committed with the deployment setup). Now you push it to GitHub, and the
deployment runs automatically on your server.

### D1. Push the code

**Option A — using the terminal (recommended):**

1. Open the project folder in **VS Code** (this folder: `C:\VSLLP\krisha\3`).
2. Open the built-in terminal: top menu **Terminal** → **New Terminal**.
3. Type these commands one by one, pressing **Enter** after each:

   ```
   git add .
   git commit -m "Connect vsllp.live domain with nginx + SSL"
   git push origin main
   ```

4. If it asks for your GitHub username/password, sign in as prompted.

**Option B — using the GitHub website:**

1. Go to your repository on `github.com`.
2. Click **Add file** → **Upload files**.
3. Drag and drop the changed files, click **Commit changes**, then **Commit directly to the main branch**.

> ⚠️ Use only **one** of these two options, not both.

### D2. Watch the deployment run

1. Open your repository on GitHub.
2. Click the **Actions** tab at the top.
3. You will see a workflow called **Deploy**. A yellow circle means it's running.
4. Wait until it turns into a **green check mark** (can take 5–10 minutes).
   - ⏳ If it turns **red** (failed), click it, open the failing step, and read
     the error. The most common reason is that the DNS in Part C had not
     propagated yet — wait, then re-push (`git commit --allow-empty -m "retry"` then `git push origin main`).

✅ **Deployment done.** Now go to Part E.

---

# PART E — Firebase: allow the domain to sign people in

Firebase controls the login. You must tell it the new domain is allowed.

### E1. Log in to Firebase

1. Open a browser and go to: `https://console.firebase.google.com`
2. Sign in with the Google account that owns the project.
3. Click the project named **yesboss-8b789** (or whatever your YesBoss project is).

### E2. Open Authentication settings

1. On the left menu, click **Authentication** (flame icon).
2. At the top, click the **Settings** tab (gear icon, near the top of the page).
3. Look for the section **Authorized domains**.

### E3. Add your domains

1. Click **Add domain**.
2. Type: `vsllp.live`
3. Click **Add**.
4. Click **Add domain** again.
5. Type: `www.vsllp.live`
6. Click **Add**.

✅ **Firebase part done.** Login will now work on the new domain.

---

# PART F — Verify everything works

1. Open a browser and go to: **`https://vsllp.live`**
2. You should see a padlock icon 🔒 in the address bar (means SSL is working).
3. Try logging in with your normal email/password.
4. Open the dashboard — goals, tasks, and the chat/assistant should load.
5. If you see real-time notifications appear, the WebSocket connection is also
   working (this is a good sign).

### If something is broken, check this order

1. **Site doesn't load at all** → DNS still propagating or Azure ports not open.
   Re-check Parts A, B, C.
2. **Padlock missing / "Not secure"** → SSL wasn't issued. The deploy probably
   ran before DNS propagated. Wait, then re-push to retry.
3. **Login fails** → re-check Part E (Firebase authorized domains).
4. **Page loads but data missing** → hard-refresh (press `Ctrl + Shift + R`).

---

# PART G — From now on: how updates reach the live site

**Every time you push code to the `main` branch on GitHub, the live site
updates automatically.** You do not need to touch the server, GoDaddy, or Azure
again.

The automated pipeline does this on every push:

1. Connects to your server over SSH.
2. Pulls the newest code.
3. Rebuilds the app container.
4. Re-checks nginx (the domain router) and the SSL certificate — renews the
   certificate automatically if it's close to expiring.
5. Restarts everything.

### How to push an update (quick version)

```
git add .
git commit -m "your change description"
git push origin main
```

Then wait for the green check in GitHub → **Actions** tab. Done.

---

# PART H — Important notes & troubleshooting

### SSL auto-renewal
The SSL certificate is **free** and **auto-renews** through the deployment
pipeline. You do nothing. The email `yesbossvsllp1@gmail.com` only receives
warnings if something goes wrong (rare).

### Old links stop working
Bookmarks or messages using `http://52.140.177.20:3000` will no longer work.
Update them to `https://vsllp.live`.

### Zoho integration (only if you use Zoho Mail/Calendar)
The Zoho app may need its redirect URL updated to
`https://vsllp.live/api/v1/zoho/callback` inside the Zoho developer console.
If you don't use Zoho, ignore this.

### Email sending
Emails from the app will now contain links to `https://vsllp.live` instead of
the raw IP.

### Re-running everything
If your server is ever rebuilt from scratch, the whole process is: re-create the
GitHub Actions secrets (server IP + SSH key), then push to `main`. The
deployment script sets up nginx and SSL automatically every time.

---

## Checklist (print-ready)

- [ ] GoDaddy: A record `@` → `52.140.177.20`  (Part A)
- [ ] GoDaddy: A record `www` → `52.140.177.20`  (Part A)
- [ ] GoDaddy: removed conflicting forwarding/parking records  (Part A)
- [ ] Azure: opened inbound port 80 (HTTP)  (Part B)
- [ ] Azure: opened inbound port 443 (HTTPS)  (Part B)
- [ ] DNS check shows `52.140.177.20`  (Part C)
- [ ] Pushed code to `main`, GitHub Actions finished green  (Part D)
- [ ] Firebase: added `vsllp.live` to Authorized domains  (Part E)
- [ ] Firebase: added `www.vsllp.live` to Authorized domains  (Part E)
- [ ] `https://vsllp.live` loads with a padlock  (Part F)
- [ ] Login works on the new domain  (Part F)
