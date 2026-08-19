# Instagram Mutuals

Find out who you follow that doesn't follow you back, and who follows
you that you don't follow back — using your own Instagram data export.
No password, no scraping, no third-party API calls.

## How it works

1. Request your data from Instagram: **Settings → Your activity →
   Download your information → HTML format**.
2. You'll get `followers_1.html` (and `followers_2.html`, etc. if you
   have a lot of followers) and `following.html`.
3. Upload those files into this app.
4. It parses both, normalizes usernames (case, whitespace), and shows:
   - **Mutuals** — you follow them, they follow you
   - **Not following you back** — you follow them, they don't follow you
   - **You don't follow back** — they follow you, you don't follow them

## Run it locally

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Then open **http://127.0.0.1:8000** — the backend serves the frontend
directly, so there's nothing else to start.

## Privacy

- Uploaded files are parsed **in memory only** and never written to
  disk.
- Nothing is logged.
- No database. No third-party service ever sees your data.
- When the HTTP response is sent, the parsed data exists only in your
  browser tab — refreshing the page clears it.

## Project structure

```
instagram-mutuals/
├── backend/
│   ├── main.py          # FastAPI app + /analyze endpoint
│   ├── parser.py        # HTML → set[str] (tested against real export format)
│   ├── compare.py       # pure set-comparison logic
│   └── requirements.txt
└── frontend/
    ├── index.html
    ├── app.js
    └── style.css
```

## Known limitations (V1, by design)

- No persistence — re-upload each time you want fresh numbers.
- No official Instagram API integration — that would require a
  Meta Business/Creator account and app review; worth investigating
  separately if this becomes a hosted product.
- CORS is wide open (`*`) for local development — tighten this before
  any public deployment.

## Next steps (not built yet)

- Export results to CSV
- Sort by "since when" (Instagram export includes a timestamp per entry)
- Dark mode
- Drag-and-drop upload
