# cirs
Chinmaya International Foundation - CIRS Project

Touch-screen video kiosk for the CIRS booth at the **Chinmaya Amrit Mahotsav, Bharat Mandapam**.
Two touch screens show 19 topic videos (CIRS first, then 18 topics, in rows of 7-6-6). A visitor taps a topic, the video plays full screen, and the screen returns home when it ends.
The home screen is design **4a** from the Claude Design project "Kiosk Icon Explorations" (`design/4a-reference.png`), extended to 19 tiles (layout B; CIRS icon option 2 from `design/cirs-options/`).

It is a plain web page (HTML/CSS/JS, no framework, no build step). The same folder runs in several ways:

| Tier | How it runs | Needs |
|---|---|---|
| A | Hosted link → **Download videos** → **Start** (saved on the device, works offline) | Internet on setup day |
| A2 | Hosted link → **Load from USB stick** | USB stick + a few KB of data |
| B | Fully Kiosk Browser (Android) with the hosted link | Vendor technician |
| C | Pre-set Windows laptop, `START-KIOSK.bat` on startup | Laptop + HDMI + USB touch cable |
| D | USB stick on any Windows PC → `START-KIOSK.bat` | USB stick |
| E | Hosted link, streaming (videos not saved) | Internet all day |
| F | `CIRS-Showreel.mp4` on any TV/panel media player, on repeat | USB stick |
| G | Visitors scan a QR code → `?visitor` link on their phones | Visitors' data |

## Folders
```
index.html, css/, js/          the app (js/config.js = titles, texts, timings, staff PIN)
sw.js, manifest.webmanifest    offline support for the hosted link
assets/icons/                  the 19 topic discs (built from design/ by tools/build-icons.sh)
posters/                       first frame of each video (no black flash)
videos/                        source/, hd/, lite/ (not in git; ~5 GB)
kiosk/                         Windows START/STOP/AUTOSTART batch files
docs/                          Quick Start card, technician sheet, vendor questions, hosting guide
tools/                         fetch, transcode, icons, showreel, USB bundle, site build, tests
```

## Commands
```bash
tools/fetch-videos.sh            # download the 19 videos from the CIRS Google Drive folder
tools/fetch-videos.sh --refresh  # check whether CIRS changed any file in Drive
tools/transcode.sh               # HD (same volume, ≤5 Mbps) + Lite 720p + posters + js/media.js
tools/transcode.sh --check       # SSIM quality check of re-encoded HD files vs originals
tools/build-icons.sh             # bake the 4a discs into assets/icons/*.webp
tools/make-showreel.sh           # videos/CIRS-Showreel.mp4 (tier F)
tools/build-usb.sh               # dist/usb/CIRS-KIOSK/ to copy onto USB sticks
tools/build-site.sh <video-url>  # dist/site/ for Cloudflare Pages (see docs/hosting.md)
node tools/serve.mjs             # local server with byte ranges: http://localhost:8080/
node tools/test/e2e.mjs file|hosted|visitor|extras|soak N   # end-to-end tests in headless Chrome
```

## Preview link (GitHub Pages, 720p videos)
- Team review: https://me-shivamo.github.io/cirs/?demo
- Full kiosk setup test on a tablet: https://me-shivamo.github.io/cirs/
- Update it: `tools/build-site.sh --lite-only`, then push `dist/site` to the `gh-pages` branch.

## Useful URLs and gestures
- `?demo`: kiosk look without the setup screen or forced full screen (team preview)
- `?visitor`: phone layout, streams the Lite videos (for the QR standee)
- `?nofs`: don't enter full screen (desk testing)
- `?soak=1`: plays random topics for hours (memory/stability test)
- **Staff screen:** hold "Keep Smiling" (top right) for 5 s, or press Ctrl+Shift+S. PIN is in `js/config.js` (default 2026).

## Licences
Icons 1–11 are from the CIRS design project. Icons 13–19 use Microsoft Fluent Emoji (MIT, `design/fluent/LICENSE`).
The font is Baloo 2 (SIL OFL, `assets/fonts/OFL.txt`).
