# Medication PDF Extractor

Small Railway-ready web app for dropping in Medicare-related PDFs, previewing exact extracted rows, and appending those rows to Google Sheets.

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
node server.js
```

Then open `http://localhost:3000`.

## Deploy to Railway

1. Create a new Railway service from this folder.
2. Use the default start command: `node server.js`
3. Add these environment variables:

```text
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_PRIVATE_KEY=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_SHEETS_SPREADSHEET_ID=
GOOGLE_SHEETS_RANGE=Medications!A:M
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
- Save the target `Spreadsheet ID`, `range`, and `Drive folder ID` from the app's settings panel, or provide them as environment defaults.

## Notes

- The current app does client-side PDF parsing with PDF.js loaded from jsDelivr.
- The Google Sheets write happens server-side so the private key never goes to the browser.
- The settings page stores only non-secret targets: `Spreadsheet ID`, `range`, and `Drive folder ID`.
- Secret Google credentials still belong in Railway environment variables.
- Drive links are intended to stay restricted to users who already have access to the shared folder.
- No server-side database or file storage is used in this version.
