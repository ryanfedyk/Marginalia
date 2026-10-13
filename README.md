# Marginalia

A quiet, tactile home for the books you own and the thoughts they leave behind.

- **Library**: a calm gallery of canonical cover art. No badges, stars or feeds.
- **Scan a barcode**: live camera ISBN scanning. It uses the native `BarcodeDetector` where the browser has it and falls back to `html5-qrcode` elsewhere. Metadata comes from Open Library, with Google Books as a fallback. Covers are always the canonical Open Library art (`covers.openlibrary.org/b/isbn/{isbn}-L.jpg`) and never a camera snapshot.
- **Photograph a shelf**: Claude reads every spine in one photo and returns `{ "books": [{ "title", "author" }] }` (JSON-schema constrained). You review the matches, untick any mistakes and shelve the rest in one go.
- **Book page**: a slide-over panel with reading status, plus three tabs:
  - **Marginalia**: your notes, takeaways, quotes and reactions, with page references.
  - **Companion**: "Catch me up", "Chapter recap" and "Untangle a passage". Answers stream in and are kept spoiler-safe up to the point you say you've reached.
  - **Discovery**: a taste profile drawn from your library and notes, with recommendations that link to Bookshop.org, Amazon, AbeBooks and WorldCat.

## Running it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required for shelf photos, Companion and Discovery. Scanning and search work without it. |
| `MARGINALIA_MODEL` | Optional model override. The default is `claude-sonnet-5-5`. The brief asked for Claude 3.5/3.7 Sonnet, but both are retired. |
| `GOOGLE_BOOKS_API_KEY` | Optional. Raises Google Books rate limits for the fallback lookup. |

The camera only works on `https://` or `localhost`. To test on a phone, deploy the app (Vercel works out of the box) or use an HTTPS tunnel.

## Notes

- Your library is stored in the browser (localStorage). You can **Export** or **Import** it as JSON from the footer.
- Claude requests use the server-side refusal fallback (`fallbacks: "default"`). If the model declines a request, the API retries it on a recommended substitute.
- `npm test` runs the unit tests for ISBN handling and metadata lookup. `npm run build` type-checks and builds the app.

## Layout

```
src/app/api/lookup     ISBN → metadata (Open Library → Google Books)
src/app/api/resolve    title + author → metadata (for shelf photos and recommendations)
src/app/api/shelf      shelf photo → Claude → { books: [...] }
src/app/api/companion  streaming recaps, catch-ups and passage untangling
src/app/api/discover   taste profile and recommendations
src/components         Library grid, BookPanel, tabs, dialogs
src/lib                types, store, ISBN maths, server metadata, Claude client
```
