# Zillow DOM Chart — Chrome extension

Chrome extension that pulls listing price history from Zillow search results (via the Apify Zillow scraper) and renders interactive Days-on-Market / price charts. Exported charts can be saved as a single self-contained HTML file or published directly to GitHub Pages from the extension.

## Features

- **Get Data** button on Zillow search pages — runs the Apify `maxcopell/zillow-scraper` + `zillow-detail-scraper` actors against the current search URL and downloads the result as CSV.
- **Price History Chart page** — uploads a CSV (or auto-loads scraped results), renders an interactive Chart.js line chart with Days-on-Market on the x-axis, price on the y-axis, color-coded by event (listed/pending/sold), zoom + pan, tooltips with property thumbnails, and per-property filter controls (min/max DOM, min price cuts, min % decline).
- **Export as HTML** — produces a single self-contained `.html` file with the chart, CSV data, and every library inlined. Opens in any modern browser without dependencies.
- **Publish to GitHub Pages** — commits that same self-contained file directly to a configured GitHub repo and returns the public Pages URL. Settings (PAT + owner/repo/branch/path prefix) are stored per-device in `chrome.storage.local`.

## Install (development)

1. Clone this repo.
2. Open `chrome://extensions/` in Chrome.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** → pick this folder.
5. The extension icon appears in the toolbar. Click it.

## First-time setup

1. Get an [Apify API token](https://console.apify.com/account/integrations) — needed for the Zillow scrapers.
2. Click the extension icon → paste the token into **Enter Apify API Key** → **Save**.
3. (Optional, for Publish to GitHub Pages) follow the [GitHub Pages walkthrough](#github-pages-publish-walkthrough) below.

## Daily use

1. Browse to a Zillow search URL (one that contains `searchQueryState=` in the URL — i.e. a real search, not the homepage).
2. The extension injects a **Get Data** button next to the Zillow search controls. Click it.
3. Wait for the progress popup to finish (Searching → Getting Details → progress count).
4. Choose **Download CSV** or **Load CSV for Chart**.
5. On the chart page, use the filters or click **Export as HTML** / **Publish to GitHub Pages**.

## GitHub Pages publish walkthrough

One-time setup per destination repo:

1. Create a public GitHub repo (or pick an existing one) — must have at least one commit on the publish branch.
2. Repo **Settings → Pages** → set Source = "Deploy from a branch", Branch = `main` / Folder = `/ (root)` → Save. The Pages base URL appears within a minute: `https://<owner>.github.io/<repo>/`.
3. Mint a [fine-grained PAT](https://github.com/settings/personal-access-tokens/new) with **Repository access: this repo only** and **Repository permissions → Contents: Read and write**.

Then in the extension:

1. Open the chart page → load a CSV → click **Publish to GitHub Pages**.
2. Enter PAT, owner, repo, branch, path prefix (e.g. `charts`), filename.
3. **Save & Publish**. The result dialog shows the public Pages URL.

Settings are cached in `chrome.storage.local` so subsequent publishes only ask for the filename.

## Architecture

- `manifest.json` — MV3 manifest, version 2.1.
- `service-worker.js` — background scraping orchestrator, message hub between popup and chart page.
- `apify-utils.js` — Apify API client (run actor, poll for completion, retry on 5xx).
- `csv-utils.js` — flattens nested Zillow records and serializes to CSV.
- `popup/` — extension popup (API key entry, Open Price History Charts button, Get Data button injection on Zillow pages).
- `chart.html` / `chart.js` / `chart.css` — chart UI, parsing, rendering, filtering, export, and GitHub Pages publish.
- `chart-upload.js` — file upload handler + dual-mode auto-load (extension vs. standalone exported HTML).
- `offscreen.html` / `offscreen.js` — offscreen document for completion-beep audio.
- `lib/` — vendored Chart.js, Papa Parse, Hammer.js, chart.js plugins, jQuery.

## License

No license specified.
