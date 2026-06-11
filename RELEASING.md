# Releasing Smara

How to ship changes once Smara is live. **Smara updates through two separate
channels that do _not_ update together** — read this once and the rest is a
checklist.

| Channel | What it is | How it updates | Wait |
|---|---|---|---|
| **Web / Desktop (PWA)** | the website | **Automatic** — every push to `main` triggers a Netlify deploy | minutes |
| **Android (Play Store)** | the phone app | **Manual** — you must build + upload a new signed `.aab` each time | Google review: hours–2 days |

The Android app **bundles** the web code inside it, so pushing to `main` does
**not** change what's on people's phones. To update the phone app you cut a new
Android release (below). If you forget, the app and website drift apart.

---

## A. Web release (the easy one)

1. Make the change, verify it.
2. Commit + push to `main`.
3. Netlify auto-deploys. Done.

That's it — no version bump, no store, no waiting.

---

## B. Android release (the checklist)

Do this whenever you want a change to reach phones. Most changes are "web only"
(new features, bug fixes, text, translations) — no native/Android code touched —
and still follow this exact list.

### Step 1 — Code + sync (Claude does this)
- [ ] Make the change and verify it (web preview / debug APK).
- [ ] `npm run build`
- [ ] `npx cap sync android`  ← folds the fresh web build into the native app
- [ ] **Bump the version** in `android/app/build.gradle`:
  - `versionCode` — **always +1** (8 → 9 → 10…). Play rejects an upload whose
    versionCode isn't higher than the last. This is the number that matters.
  - `versionName` — the human version users see. Bump for meaningful releases:
    `1.0.0` → `1.0.1` (small fix) / `1.1.0` (new feature). Cosmetic only.
- [ ] Commit the version bump.

### Step 2 — (Recommended) test on a real device first
- [ ] Build a debug APK, sideload to the phone, confirm the change works and the
      Settings footer shows the new build. Catch problems **before** signing.

### Step 3 — Signed build (Stanley does this, in Android Studio)
- [ ] **Build → Generate Signed App Bundle → Android App Bundle**.
- [ ] Use the **existing** keystore (`smara-upload`, in `kura-keystore/`) + its password — **never
      create a new one** (a different key = Play rejects the upload).
- [ ] Variant `release` → Finish. Output: `android/app/release/app-release.aab`.

### Step 4 — Upload to Play Console (Stanley does this)
- [ ] Play Console → your app → pick the **track**:
  - **Internal testing** — instant, just your testers. Use for trying things.
  - **Closed testing** — your ~12-tester beta group.
  - **Production** — everyone. (Personal accounts: only after the 12-testers /
    14-day closed test is satisfied.)
- [ ] **Create new release** → upload the `.aab` → write a short "What's new"
      note → review → **Roll out**.
- [ ] (Production) consider a **staged rollout** (e.g. 20% → 100%) to catch
      issues before everyone gets it.
- [ ] Google reviews it (hours–2 days). After approval, phones auto-update via
      the Play Store.

---

## Version numbering at a glance
- **versionCode**: integer, **+1 every single upload**, never reused. (Currently 8.)
- **versionName**: `MAJOR.MINOR.PATCH` shown to users. (Currently `1.0.0`.)

## Must-remember rules
- 🔑 **One keystore forever.** `smara-upload` (in `kura-keystore/`) + its password sign every update.
  Lose it and you can't update the app under the same listing (Play App Signing
  lets you *reset* the upload key via support, but don't rely on it). Keep it
  backed up in 2 places.
- 🔄 **Always `npm run build` + `npx cap sync android` before a release** — or you
  ship a stale web bundle (the exact bug that froze the app at the Session-11
  build).
- 📢 **Before the first build that contains ads (10b):** update the Privacy Policy
  to disclose ad-SDK data + update the Play **Data Safety** form. Mandatory.
- 🌐 Web and Android are independent — a web hotfix is live in minutes, but phones
  only get it on the next Android release.

## Later: skip the Play review for web-only fixes (OTA / live updates)
Because the app is just web content, a "live update" tool (e.g. Capgo) can push
web-only changes straight to installed apps without a Play review each time,
reserving full releases for native changes. Extra setup; revisit when shipping
frequently. Play permits this for web/JS content that doesn't change the app's
core purpose.
