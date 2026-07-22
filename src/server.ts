import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as http from "node:http";
import * as path from "node:path";

type AppSettings = {
  driveFolderId: string;
  range: string;
  spreadsheetId: string;
};

type SheetRow = {
  address?: string;
  dateOfBirth?: string;
  dosage?: string;
  email?: string;
  firstName?: string;
  frequencyTaken?: string;
  lastName?: string;
  med?: string;
  medicationType?: string;
  phone?: string;
  refillSchedule?: string;
  signatureDate?: string;
  source?: string;
};

const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 3000);
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const maxJsonBodyBytes = 1024 * 1024;
const maxBinaryBodyBytes = 25 * 1024 * 1024;
const settingsFilePath = process.env.SETTINGS_FILE_PATH
  ? path.resolve(process.env.SETTINGS_FILE_PATH)
  : path.join(__dirname, "..", "data", "app-settings.json");

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};

function ensureSettingsDirectory(): void {
  fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
}

function getDefaultSettings(): AppSettings {
  return {
    driveFolderId: "",
    range: "Medications!A:M",
    spreadsheetId: ""
  };
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  return {
    driveFolderId: String(input?.driveFolderId || "").trim(),
    range: String(input?.range || "").trim(),
    spreadsheetId: String(input?.spreadsheetId || "").trim()
  };
}

function readSavedSettings(): AppSettings | null {
  try {
    const raw = fs.readFileSync(settingsFilePath, "utf8");
    return sanitizeSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return null;
  }
}

function loadAppSettings(): AppSettings {
  const defaults = getDefaultSettings();
  const saved = readSavedSettings();

  return saved
    ? {
        driveFolderId: saved.driveFolderId || defaults.driveFolderId,
        range: saved.range || defaults.range,
        spreadsheetId: saved.spreadsheetId || defaults.spreadsheetId
      }
    : defaults;
}

function saveAppSettings(settings: Partial<AppSettings>): AppSettings {
  ensureSettingsDirectory();
  const sanitized = sanitizeSettings(settings);
  fs.writeFileSync(settingsFilePath, JSON.stringify(sanitized, null, 2), "utf8");
  return sanitized;
}

function sendFile(filePath: string, res: http.ServerResponse): void {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8"
      });
      res.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const isAppAsset = ext === ".html" || ext === ".css" || ext === ".js";
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": isAppAsset ? "no-cache, no-store, must-revalidate" : "public, max-age=3600"
    });
    res.end(data);
  });
}

function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    req.on("data", (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > maxJsonBodyBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    req.on("error", reject);
  });
}

function readBinaryBody(
  req: http.IncomingMessage,
  maxBytes = maxBinaryBodyBytes
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalLength = 0;

    req.on("data", (chunk: Buffer) => {
      totalLength += chunk.length;
      if (totalLength > maxBytes) {
        reject(new Error("Uploaded file is too large."));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function base64UrlEncode(input: Buffer | string | object): string {
  const buffer = Buffer.isBuffer(input)
    ? input
    : Buffer.from(typeof input === "string" ? input : JSON.stringify(input), "utf8");

  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createSignedJwt(
  serviceAccountEmail: string,
  privateKey: string,
  scopes: string[]
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: serviceAccountEmail,
    scope: scopes.join(" "),
    aud: googleTokenUrl,
    exp: issuedAt + 3600,
    iat: issuedAt
  };

  const encodedHeader = base64UrlEncode(header);
  const encodedClaims = base64UrlEncode(claims);
  const unsignedToken = `${encodedHeader}.${encodedClaims}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsignedToken)
    .end()
    .sign(privateKey);

  return `${unsignedToken}.${base64UrlEncode(signature)}`;
}

async function getGoogleAccessToken(scopes: string[]): Promise<string> {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!serviceAccountEmail || !privateKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY environment variables."
    );
  }

  const assertion = createSignedJwt(serviceAccountEmail, privateKey, scopes);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const payload = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const details = payload.error_description || payload.error || "Unknown token error.";
    throw new Error(`Google token request failed: ${details}`);
  }

  return payload.access_token;
}

function toSheetValues(row: SheetRow): string[] {
  return [
    row.firstName || "",
    row.lastName || "",
    row.source || "",
    row.med || "",
    row.medicationType || "",
    row.dosage || "",
    row.frequencyTaken || "",
    row.refillSchedule || "",
    row.signatureDate || "",
    row.email || "",
    row.phone || "",
    row.address || "",
    row.dateOfBirth || ""
  ];
}

async function appendRowsToGoogleSheet(input: {
  range: string;
  rows: SheetRow[];
  spreadsheetId: string;
}): Promise<Record<string, unknown>> {
  const accessToken = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/spreadsheets"
  ]);
  const endpoint =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}` +
    `/values/${encodeURIComponent(input.range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      majorDimension: "ROWS",
      values: input.rows.map(toSheetValues)
    })
  });

  const payload = (await response.json()) as Record<string, unknown> & {
    error?: { message?: string };
  };
  if (!response.ok) {
    const details = payload.error?.message || "Unknown Sheets API error.";
    throw new Error(`Google Sheets append failed: ${details}`);
  }

  return payload;
}

async function uploadFileToGoogleDrive(input: {
  fileBuffer: Buffer;
  fileName: string;
  folderId: string;
  mimeType: string;
}): Promise<{ id: string; name: string; webViewLink?: string }> {
  const accessToken = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/drive.file"
  ]);
  const boundary = `codex-upload-${Date.now()}`;
  const metadata: { name: string; parents?: string[] } = {
    name: input.fileName
  };

  if (input.folderId) {
    metadata.parents = [input.folderId];
  }

  const multipartBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: ${input.mimeType}\r\n\r\n`,
      "utf8"
    ),
    input.fileBuffer,
    Buffer.from(`\r\n--${boundary}--`, "utf8")
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body: multipartBody
    }
  );

  const payload = (await response.json()) as {
    error?: { message?: string };
    id: string;
    name: string;
    webViewLink?: string;
  };

  if (!response.ok) {
    const details = payload.error?.message || "Unknown Google Drive error.";
    throw new Error(`Google Drive upload failed: ${details}`);
  }

  return payload;
}

async function handleSheetsAppend(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const appSettings = loadAppSettings();
    const spreadsheetId = String(body.spreadsheetId || appSettings.spreadsheetId || "").trim();
    const range = String(body.range || appSettings.range || "").trim();
    const rows = Array.isArray(body.rows) ? (body.rows as SheetRow[]) : [];

    if (!spreadsheetId) {
      sendJson(res, 400, { error: "Missing spreadsheetId." });
      return;
    }

    if (!range) {
      sendJson(res, 400, { error: "Missing range. Example: Medications!A:M" });
      return;
    }

    if (!rows.length) {
      sendJson(res, 400, { error: "No rows were provided to write." });
      return;
    }

    const payload = await appendRowsToGoogleSheet({ spreadsheetId, range, rows });
    const updates = payload.updates as
      | { updatedRange?: string; updatedRows?: number }
      | undefined;

    sendJson(res, 200, {
      ok: true,
      spreadsheetId: payload.spreadsheetId,
      tableRange: payload.tableRange || "",
      updatedRange: updates?.updatedRange || "",
      updatedRows: updates?.updatedRows || 0
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
}

async function handleDriveUpload(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const appSettings = loadAppSettings();
    const rawFileName = String(req.headers["x-file-name"] || "").trim();
    const fileName = rawFileName ? decodeURIComponent(rawFileName) : "";
    const mimeType = String(req.headers["content-type"] || "application/octet-stream").trim();
    const folderId = String(
      req.headers["x-drive-folder-id"] || appSettings.driveFolderId || ""
    ).trim();

    if (!fileName) {
      sendJson(res, 400, { error: "Missing x-file-name header." });
      return;
    }

    const fileBuffer = await readBinaryBody(req);
    if (!fileBuffer.length) {
      sendJson(res, 400, { error: "Uploaded file was empty." });
      return;
    }

    const payload = await uploadFileToGoogleDrive({
      fileBuffer,
      fileName,
      folderId,
      mimeType
    });

    sendJson(res, 200, {
      ok: true,
      driveFileId: payload.id,
      fileName: payload.name,
      webViewLink: payload.webViewLink || `https://drive.google.com/file/d/${payload.id}/view`
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
}

async function handleSettingsSave(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const savedSettings = saveAppSettings(body as Partial<AppSettings>);
    sendJson(res, 200, {
      ok: true,
      settings: savedSettings
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error."
    });
  }
}

function handleConfig(res: http.ServerResponse): void {
  const settings = loadAppSettings();
  const savedSettings = readSavedSettings();
  sendJson(res, 200, {
    driveFolderId: settings.driveFolderId,
    hasDriveTarget: Boolean(settings.driveFolderId),
    range: settings.range,
    settingsFilePath,
    settingsSaved: Boolean(savedSettings),
    spreadsheetId: settings.spreadsheetId,
    hasGoogleCredentials: Boolean(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY
    )
  });
}

http
  .createServer((req, res) => {
    const method = req.method || "GET";
    const requestPath = decodeURIComponent((req.url || "/").split("?")[0]);

    if (method === "GET" && requestPath === "/api/config") {
      handleConfig(res);
      return;
    }

    if (method === "POST" && requestPath === "/api/google-sheets/append") {
      void handleSheetsAppend(req, res);
      return;
    }

    if (method === "POST" && requestPath === "/api/settings") {
      void handleSettingsSave(req, res);
      return;
    }

    if (method === "POST" && requestPath === "/api/google-drive/upload") {
      void handleDriveUpload(req, res);
      return;
    }

    const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
    const resolvedPath =
      safePath === "/"
        ? path.join(publicDir, "index.html")
        : path.join(publicDir, safePath);

    fs.stat(resolvedPath, (error, stats) => {
      if (!error && stats.isFile()) {
        sendFile(resolvedPath, res);
        return;
      }

      sendFile(path.join(publicDir, "index.html"), res);
    });
  })
  .listen(port, () => {
    console.log(`PDF extractor running on http://localhost:${port}`);
  });
