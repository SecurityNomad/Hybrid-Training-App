# HYROX Prep — install on your Android phone

Your dashboard is now a **PWA** (Progressive Web App): a real installable app with a home-screen icon that works **fully offline** and keeps all your data (ticked sessions, benchmarks, checklist) on your phone.

Everything lives in this `hyrox-app` folder. The files must always stay **together**: `index.html`, `manifest.webmanifest`, `sw.js`, and the icon PNGs.

There are two ways to install. Both start from the same step: putting the folder online once (free, ~2 minutes). A PWA needs a secure `https://` link to install and run offline — opening the file directly from storage won't work.

---

## Step 1 — Put the folder online (free, no account)

1. Go to **https://app.netlify.com/drop** on your computer.
2. **Drag the whole `hyrox-app` folder** onto the page.
3. It uploads and gives you a live link like `https://random-name-123.netlify.app`.
4. That link is now your app. (Optional: make a free Netlify account to rename it to something memorable and keep it permanently.)

> Alternatives if you prefer: **GitHub Pages**, **Cloudflare Pages**, or **Vercel** — any static host works. Netlify Drop is the fastest because it needs no sign-up.

---

## Path A — Add to Home Screen (fastest, recommended to start)

On your **Android phone**:

1. Open your Netlify link in **Chrome**.
2. Tap the **⋮** menu (top-right) → **Install app** (or **Add to Home screen**).
   - You can also tap the **⤓ Install app** button on the dashboard header.
3. Confirm. The HYROX icon appears on your home screen.
4. Open it from the icon — it runs full-screen, no browser bar, and works **offline** from now on.

That's it — this is a genuine installed app for daily use.

---

## Path B — Generate a real `.apk` (looks like a Play Store app)

Use this if you specifically want an installable Android package file.

1. On your computer, go to **https://www.pwabuilder.com**.
2. Paste your Netlify link and click **Start**. It analyses the PWA (manifest + service worker are already set up for you).
3. Choose **Android** → **Generate Package**.
4. For personal use, pick the **signed APK** option (PWABuilder creates a signing key for you — save the `.zip` it gives you, it contains the key + the `.apk`).
5. Transfer the `.apk` to your phone (email it to yourself, Google Drive, or USB).
6. On the phone, tap the `.apk`. Android will ask to **allow installing from this source** the first time — approve it, then install.
7. The app appears in your app drawer like any other app.

> Want it on the **Google Play Store** instead of sideloading? PWABuilder can produce a Play-ready **AAB** bundle, but that needs a one-time Google Play Developer account ($25). Sideloading the APK is free and fine for personal use.

---

## Your data & backups

- All progress is stored **on your device** (in the app), so it stays private and works offline.
- Data is tied to the app you installed. If you reinstall, clear browser data, or switch phones, use the built-in backup:
  - **Benchmarks tab → Export data (JSON)** to save a backup file.
  - **Import data** to restore it.
- Back up after big logging sessions (e.g. after each race sim).

---

## Updating the plan later

If I tweak the training plan in future:

1. Replace the files in this `hyrox-app` folder.
2. Re-drag the folder to Netlify Drop (or push to your host).
3. Reopen the app — the service worker auto-updates to the new version on next launch. Your logged data is preserved.

---

## Preview on your computer first (optional)

To test before hosting, run a local server from inside the `hyrox-app` folder:

```
python3 -m http.server 8000
```

Then open **http://localhost:8000** in Chrome. (Plain file-open won't enable install/offline — a server or host is required.)
