# Marginalia

A quiet, tactile home for the books you own and the thoughts they leave behind.

- **Library**: a calm gallery of canonical cover art. No badges, stars or feeds. Pinch (or trackpad-pinch) to resize the covers.
- **Currently reading**: books in hand sit above the shelf, each with a critic's line about it. Quotes are found with Gemini + Google Search, and a different one appears on each visit.
- **Google sign-in**: sign in to keep the library in your account (Firebase Auth + Firestore), synced live across devices and usable offline.
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
| `GEMINI_API_KEY` | Required for shelf photos, Companion and Discovery. Get one at [Google AI Studio](https://aistudio.google.com/apikey). Scanning and search work without it. |
| `GEMINI_MODEL` | Optional model override. The default is `gemini-3.8-flash`. |
| `GOOGLE_BOOKS_API_KEY` | Optional. Raises Google Books rate limits for the fallback lookup. |

The camera only works on `https://` or `localhost`. Cloud Run gives you an https address automatically.

## Deploying to Google Cloud (Cloud Build → Cloud Run)

The repo includes a `Dockerfile` and a `cloudbuild.yaml`. Cloud Build builds the image, pushes it to Artifact Registry and deploys it to Cloud Run. The Gemini key comes from Secret Manager at run time, so it is never stored in the image or the repo.

**One-time setup** (all in the Google Cloud Console):

1. **Turn on the services.** Enable the *Cloud Build*, *Cloud Run*, *Artifact Registry* and *Secret Manager* APIs. Search each name in the top bar and click **Enable**.
2. **Store the key.** In **Secret Manager**, click **Create secret**, name it `GEMINI_API_KEY` and paste your Gemini key as the value.
3. **Create Marginalia's service account.** In **IAM & Admin → Service Accounts**, click **Create service account** and name it `marginalia-runner`. On the "Grant this service account access" step, add these roles:
   - Cloud Run Admin
   - Service Account User
   - Artifact Registry Administrator
   - Logs Writer
   - Secret Manager Secret Accessor
4. **Connect the repo.** In **Cloud Build → Triggers**, click **Create trigger**, connect this GitHub repo, set the configuration file to `cloudbuild.yaml`, and set **Service account** to `marginalia-runner`.

The Artifact Registry repository is created automatically on the first build.

**Deploy:**

```bash
gcloud builds submit --config cloudbuild.yaml \
  --service-account=projects/$(gcloud config get-value project)/serviceAccounts/marginalia-runner@$(gcloud config get-value project).iam.gserviceaccount.com
```

With the trigger connected, every push to the branch it watches redeploys automatically; you can also click **Run** on the trigger.

| Substitution | Default | Meaning |
|---|---|---|
| `_REGION` | `us-central1` | Cloud Run and Artifact Registry region |
| `_REPOSITORY` | `cloud-run-source-deploy` | Artifact Registry repo |
| `_SERVICE` | `marginalia` | Cloud Run service name |
| `_GEMINI_SECRET` | `GEMINI_API_KEY` | Secret Manager secret holding the Gemini key |
| `_GEMINI_MODEL` | `gemini-3.8-flash` | Gemini model |
| `_RUN_SA_NAME` | `marginalia-runner` | Service account the Cloud Run service runs as |

To run the container locally: `docker build -t marginalia . && docker run -p 3000:3000 -e GEMINI_API_KEY=... marginalia`.

## Turning on Google sign-in (Firebase)

Sign-in stays hidden until Firebase is configured. One-time setup:

1. Open [console.firebase.google.com](https://console.firebase.google.com), click **Add project**, and pick your **existing Google Cloud project** (the one Marginalia runs in).
2. **Build → Authentication → Get started → Google → Enable → Save.** Then go to **Settings → Authorized domains → Add domain** and add your Cloud Run domain (e.g. `marginalia-abc123-uc.a.run.app`, without `https://`).
3. **Build → Firestore Database → Create database.** Choose *Production mode* and a location near you. Open the **Rules** tab, replace the contents with [`firestore.rules`](firestore.rules), and click **Publish**.
4. **Project settings (gear) → Your apps → Web (`</>`)**, register an app called "Marginalia", and copy the `firebaseConfig` values into `src/lib/firebase-config.ts`. These values are public by design; the Firestore rules keep each library private. You can also provide them at run time as a `FIREBASE_CONFIG` environment variable.

Each book is stored at `users/{uid}/books/{bookId}`. Conflicts resolve per book, and the most recent edit wins. Deleting a book leaves a tombstone, so offline devices don't bring it back. The first time someone signs in, the books already on that device are added to their account.

## Notes

- Signed out, your library is stored in the browser (localStorage). Signed in, it lives in Firestore. **Export** and **Import** (JSON) are in the footer either way.
- All AI features run on Google Gemini through the official `@google/genai` SDK. Shelf reading and Discovery use JSON-schema structured output.
- `npm test` runs the unit tests for ISBN handling and metadata lookup. `npm run build` type-checks and builds the app.

## Layout

```
src/app/api/lookup     ISBN → metadata (Open Library → Google Books)
src/app/api/resolve    title + author → metadata (for shelf photos and recommendations)
src/app/api/shelf      shelf photo → Gemini → { books: [...] }
src/app/api/companion  streaming recaps, catch-ups and passage untangling
src/app/api/discover   taste profile and recommendations
src/app/api/praise     critics' quotes (Gemini with Google Search grounding)
src/components         Library grid, BookPanel, tabs, dialogs
src/lib                types, store, ISBN maths, server metadata, Gemini client, Firebase sync
```
