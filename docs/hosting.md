# Putting the kiosk online (Tier A link, Tier G visitor QR)

The app goes on **Cloudflare Pages** and the videos go in **Cloudflare R2**. Both are free at this size: about 2.1 GB stored, and R2 charges nothing for downloads. R2 needs a payment card on the account.

## 1. Videos → R2
1. Go to Cloudflare dashboard → **R2** → **Create bucket**, named `cirs-videos`.
2. Open the bucket's **Settings**:
   - **Public access:** allow the `r2.dev` URL, or connect a custom domain if CIRS has one on Cloudflare (better for heavy use).
   - **CORS policy:** paste this.
     ```json
     [{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["Range"],
        "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"], "MaxAgeSeconds": 86400 }]
     ```
3. Upload `videos/hd/` and `videos/lite/` keeping the folder names. The bucket should contain `hd/01-journey-of-cvs.mp4` … and `lite/01-journey-of-cvs.mp4` …. You can drag and drop in the dashboard, or use the command line:
   `npx wrangler r2 object put cirs-videos/hd/01-journey-of-cvs.mp4 --file videos/hd/01-journey-of-cvs.mp4 --remote` (repeat per file).
4. Copy the public URL, e.g. `https://pub-xxxx.r2.dev/`.

## 2. App → Pages
1. Run `tools/build-site.sh https://pub-xxxx.r2.dev/`. This writes `dist/site/` with that video URL set and a fresh version number.
2. Go to Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Upload assets**, choose a short project name (e.g. `cirs-booth`), and upload the **contents** of `dist/site/`.
   Or from the command line: `npx wrangler pages deploy dist/site --project-name cirs-booth`
3. The links are:
   - Kiosk screens: `https://cirs-booth.pages.dev/`
   - Visitors' phones (QR standee): `https://cirs-booth.pages.dev/?visitor`

## 3. Mirror (backup host)
Upload the same `dist/site/` folder to a second host, e.g. a GitHub Pages repo or Netlify drop. It still points at R2 for videos. If both the link and R2 fail, use **Load from USB stick** or the offline tiers.

## Updating later
To change a title or replace a video:
1. Re-run `tools/transcode.sh` if videos changed, and upload the changed files to R2.
2. Run `tools/build-site.sh <url>` and redeploy.
3. On each screen, either tap **Staff options → Check for updates**, or do nothing: the app applies a downloaded update at its next idle refresh. Changed videos then show as "old" in the staff table, and **Download / repair videos** fetches only those.
