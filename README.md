# Slinkycues

Turns an Instagram data export into a print-ready A5 diary (.docx), with Tinder-style photo curation and a spell-check that learns your slang. Everything runs in the browser — nothing is uploaded.

## Use it
1. Instagram → Settings → Accounts Centre → Your information and permissions → Download your information → Some of your information → tick **Media** and **Comments** → JSON, High quality, pick the year.
2. Open the app, drop the zip in.
3. Swipe photos (→ keep, ← skip, Z undo). Progress saves in the browser.
4. Spell-check: → fix, ← "I meant it" (word is remembered and never asked again).
5. Export: pick year, title, photo width → download .docx → drag into Google Drive → opens as a Google Doc.

## Run locally
```
npm install
npm run dev
```

## Deploy (Vercel)
Live at **https://slinkycues.vercel.app/diary**. This repo is Vercel project `slinkycues-diary` (account slinkycues-dev); the Slinkycues hub (repo `slinkycues-dev/slinkycues-hub`, which owns slinkycues.vercel.app) proxies it in under `/diary`. That is why `vite.config.js` sets `base: '/diary/'` - keep any new asset fetches on `import.meta.env.BASE_URL`. Push to `main` to deploy.

## Layout
- `src/lib/parseExport.js` — reads the zip, fixes Instagram's broken text encoding, attaches your own overflow comments to the right day
- `src/lib/spellcheck.js` — en-GB dictionary + rules for what counts as intentional; learned words live in localStorage
- `src/lib/exportDocx.js` — A5, mirrored margins + gutter for double-sided binding, page numbers, one month per section
- `src/components/*` — the four steps
