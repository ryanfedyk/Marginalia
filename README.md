# Marginalia

A quiet, tactile home for the books you own and the thoughts they leave behind.

- **Library**: a calm gallery of canonical cover art. No badges, stars or feeds.
- **Scan a barcode**: live camera ISBN scanning. It uses the native `BarcodeDetector` where the browser has it and falls back to `html5-qrcode` elsewhere. Metadata comes from Open Library, with Google Books as a fallback. Covers are always the canonical Open Library art (`covers.openlibrary.org/b/isbn/{isbn}-L.jpg`) and never a camera snapshot.
- **Photograph a shelf**: Gemini reads every spine in one photo and returns `{ "books": [{ "title", "author" }] }` (JSON-schema constrained). You review the matches, untick any mistakes and shelve the rest in one go.
- **Book page**: a slide-over panel with reading status, plus three tabs:
  - **Marginalia**: your notes, takeaways, quotes and reactions, with page references.
  - **Companion**: "Catch me up", "Chapter recap" and "Untangle a passage". Answers stream in and are kept spoiler-safe up to the point you say you've reached.
  - **Discovery**: a taste profile drawn from your library and notes, with recommendations that link to Bookshop.org, Amazon, AbeBooks and WorldCat.

## Running it

```bash
npm install
cp .env.example .env.local   # add your GEMINI_API_KEY
npm run dev                  # http://localhost:3000
```

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Required for shelf photos, Companion and Discovery. The same key you use in Taper works; get one at [Google AI Studio](https://aistudio.google.com/apikey). Scanning and search work without it. |
| `GEMINI_MODEL` | Optional model override. The default is `gemini-3.8-flash`. |
| `GOOGLE_BOOKS_API_KEY` | Optional. Raises Google Books rate limits for the fallback lookup. |

The camera only works on `https://` or `localhost`. Cloud Run gives you an https address automatically.

## Deploying to Google Cloud (Cloud Build → Cloud Run)

The repo includes a `Dockerfile` and a `cloudbuild.yaml`. Cloud Build builds the image, pushes it to Artifact Registry and deploys it to Cloud Run. The Gemini key comes from Secret Manager at run time, so it is never stored in the image or the repo.

**One-time setup** (skip any step your project already has from Taper):

```bash
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

# Artifact Registry repo (Cloud Run's default name; reuse Taper's if it already exists)
gcloud artifacts repositories create cloud-run-source-deploy --repository-format=docker --location=us-central1

# The Gemini key. If Taper already stores it in Secret Manager, skip this and set
# _GEMINI_SECRET to that secret's name instead.
printf "%s" "YOUR_GEMINI_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-

# Let Cloud Run read the secret, and let Cloud Build deploy.
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding GEMINI_API_KEY \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
```

**Deploy:**

```bash
gcloud builds submit --config cloudbuild.yaml
# or with overrides:
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=europe-west1,_GEMINI_SECRET=taper-gemini-key
```

You can also connect a Cloud Build trigger to this GitHub repo, so every push to `main` redeploys. Set the trigger's configuration file to `cloudbuild.yaml`; if your trigger uses a custom service account, give it the *Cloud Run Admin* and *Service Account User* roles.

| Substitution | Default | Meaning |
|---|---|---|
| `_REGION` | `us-central1` | Cloud Run and Artifact Registry region |
| `_REPOSITORY` | `cloud-run-source-deploy` | Artifact Registry repo |
| `_SERVICE` | `marginalia` | Cloud Run service name |
| `_GEMINI_SECRET` | `GEMINI_API_KEY` | Secret Manager secret holding the Gemini key |
| `_GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model |

To run the container locally: `docker build -t marginalia . && docker run -p 3000:3000 -e GEMINI_API_KEY=... marginalia`.

## Notes

- Your library is stored in the browser (localStorage). You can **Export** or **Import** it as JSON from the footer.
- All AI features run on Google Gemini through the official `@google/genai` SDK. Shelf reading and Discovery use JSON-schema structured output.
- `npm test` runs the unit tests for ISBN handling and metadata lookup. `npm run build` type-checks and builds the app.

## Layout

```
src/app/api/lookup     ISBN → metadata (Open Library → Google Books)
src/app/api/resolve    title + author → metadata (for shelf photos and recommendations)
src/app/api/shelf      shelf photo → Gemini → { books: [...] }
src/app/api/companion  streaming recaps, catch-ups and passage untangling
src/app/api/discover   taste profile and recommendations
src/components         Library grid, BookPanel, tabs, dialogs
src/lib                types, store, ISBN maths, server metadata, Gemini client
```
