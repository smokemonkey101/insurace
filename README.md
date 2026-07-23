# Medication PDF Extractor

Small Railway-ready Node + TypeScript website for dropping in Medicare-related PDFs, previewing exact extracted rows, and appending those rows to Google Sheets.

It can also optionally create a NextAgency task for the exact patient name found in the PDF after the Google upload/write step completes.

## Stack

- Node.js backend in TypeScript: [src/server.ts](E:/GPT Code2/mom/src/server.ts)
- Deployable compiled runtime: [dist/server.js](E:/GPT Code2/mom/dist/server.js)
- Static website frontend: [public/index.html](E:/GPT Code2/mom/public/index.html), [public/app.js](E:/GPT Code2/mom/public/app.js), [public/styles.css](E:/GPT Code2/mom/public/styles.css)

## What it writes

Each extracted medication row is written as its own Google Sheets row with these columns:

- `First Name`
- `Last Name`
- `Source`
- `Med`
- `Medication Type`
- `Dosage`
- `Frequency Taken`
- `Refill Schedule`
- `Signature Date`
- `Email`
- `Phone`
- `Address`
- `Date of Birth`

## What it supports today

This MVP is tuned to the sample files in [pdf example](E:/GPT Code2/mom/pdf example):

- medication worksheet PDFs where the medication rows live in a table
- RetireFlo PDFs where medications appear in a `Current prescriptions` section

## Exactness rules

- Rows are not combined across files.
- Duplicate-looking medications are still kept if they came from different source rows.
- Fields stay blank when they are not clearly present in the PDF.
- Values are preserved as found in the document instead of normalized into a guessed format.

## Run locally

```bash
npm install
npm run build
npm start
```

Then open `http://localhost:3000`.

## Deploy to Railway

1. Create a new Railway service from this folder.
2. Use the default start command: `npm start`
3. Add the required Google/runtime environment variables:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
SETTINGS_FILE_PATH=
```

4. Set `PORT` only if you want to override Railway's default injected port.
5. If you want in-app settings to persist across deploys and restarts, attach a Railway volume and set `SETTINGS_FILE_PATH` to something on that volume, for example `/data/app-settings.json`.

## Google Sheets setup

- Create a Google service account in Google Cloud.
- Enable the Google Sheets API and Google Drive API for that project.
- Put the service account email and private key into the Railway environment variables above.
- Share the destination Google Sheet with the service account email so it can append rows.
- Share a Google Drive folder with the same service account.
- Save the target `Spreadsheet ID`, `range`, and `Drive folder ID` from the app's settings panel.

## Notes

- The current app does client-side PDF parsing with PDF.js loaded from jsDelivr.
- The Google Sheets write happens server-side so the private key never goes to the browser.
- The settings page stores app targets and task defaults such as `Spreadsheet ID`, `Spreadsheet label`, `range`, `Drive folder ID`, `NextAgency API base URL`, `NextAgency token`, `assigned_to` user ID, and task defaults.
- Secret Google credentials still belong in Railway environment variables.
- `PORT` and `SETTINGS_FILE_PATH` are runtime/server settings, not user-facing app settings.
- Drive links are intended to stay restricted to users who already have access to the shared folder.
- No server-side database is used in this version.
