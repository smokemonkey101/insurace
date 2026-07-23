"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = __importStar(require("node:crypto"));
const fs = __importStar(require("node:fs"));
const http = __importStar(require("node:http"));
const path = __importStar(require("node:path"));
const publicDir = path.join(__dirname, "..", "public");
const port = Number(process.env.PORT || 3000);
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const maxJsonBodyBytes = 1024 * 1024;
const maxBinaryBodyBytes = 25 * 1024 * 1024;
const settingsFilePath = process.env.SETTINGS_FILE_PATH
    ? path.resolve(process.env.SETTINGS_FILE_PATH)
    : path.join(__dirname, "..", "data", "app-settings.json");
const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8"
};
function ensureSettingsDirectory() {
    fs.mkdirSync(path.dirname(settingsFilePath), { recursive: true });
}
function getDefaultSettings() {
    return {
        driveFolderId: "",
        nextAgencyAccessToken: "",
        nextAgencyApiBaseUrl: "https://yahoo.nextbroker.io",
        nextAgencyAssignedToDisplayName: "Shelby Holman",
        nextAgencyAssignedToUserId: "",
        nextAgencyCasePageSize: 50,
        nextAgencyTaskDueTimeUtc: "05:00 AM UTC",
        nextAgencyTaskPriority: 1,
        nextAgencyTaskStage: "To Do",
        nextAgencyTaskType: "Other",
        range: "Medications!A:M",
        spreadsheetId: "",
        spreadsheetLabel: "Medications"
    };
}
function trimString(value, fallback = "") {
    return typeof value === "string" ? value.trim() : fallback;
}
function sanitizeInteger(value, fallback, minimum, maximum) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }
    return Math.min(maximum, Math.max(minimum, parsed));
}
function sanitizeSettings(input, base = getDefaultSettings(), preserveSensitiveOnEmpty = false) {
    const nextAgencyAccessToken = preserveSensitiveOnEmpty && !trimString(input?.nextAgencyAccessToken)
        ? base.nextAgencyAccessToken
        : trimString(input?.nextAgencyAccessToken);
    return {
        driveFolderId: trimString(input?.driveFolderId),
        nextAgencyAccessToken,
        nextAgencyApiBaseUrl: trimString(input?.nextAgencyApiBaseUrl, base.nextAgencyApiBaseUrl) ||
            base.nextAgencyApiBaseUrl,
        nextAgencyAssignedToDisplayName: trimString(input?.nextAgencyAssignedToDisplayName, base.nextAgencyAssignedToDisplayName) || base.nextAgencyAssignedToDisplayName,
        nextAgencyAssignedToUserId: trimString(input?.nextAgencyAssignedToUserId),
        nextAgencyCasePageSize: sanitizeInteger(input?.nextAgencyCasePageSize, base.nextAgencyCasePageSize, 1, 50),
        nextAgencyTaskDueTimeUtc: trimString(input?.nextAgencyTaskDueTimeUtc, base.nextAgencyTaskDueTimeUtc) ||
            base.nextAgencyTaskDueTimeUtc,
        nextAgencyTaskPriority: sanitizeInteger(input?.nextAgencyTaskPriority, base.nextAgencyTaskPriority, 0, 10),
        nextAgencyTaskStage: trimString(input?.nextAgencyTaskStage, base.nextAgencyTaskStage) ||
            base.nextAgencyTaskStage,
        nextAgencyTaskType: trimString(input?.nextAgencyTaskType, base.nextAgencyTaskType) ||
            base.nextAgencyTaskType,
        range: trimString(input?.range, base.range) || base.range,
        spreadsheetId: trimString(input?.spreadsheetId),
        spreadsheetLabel: trimString(input?.spreadsheetLabel, base.spreadsheetLabel) || base.spreadsheetLabel
    };
}
function readSavedSettings() {
    try {
        const raw = fs.readFileSync(settingsFilePath, "utf8");
        return sanitizeSettings(JSON.parse(raw));
    }
    catch {
        return null;
    }
}
function loadAppSettings() {
    const defaults = getDefaultSettings();
    const saved = readSavedSettings();
    return saved
        ? sanitizeSettings({
            ...defaults,
            ...saved
        }, defaults)
        : defaults;
}
function saveAppSettings(settings) {
    ensureSettingsDirectory();
    const current = loadAppSettings();
    const sanitized = sanitizeSettings({
        ...current,
        ...settings
    }, current, true);
    fs.writeFileSync(settingsFilePath, JSON.stringify(sanitized, null, 2), "utf8");
    return sanitized;
}
function sendFile(filePath, res) {
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
function sendJson(res, statusCode, payload) {
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(payload));
}
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalLength = 0;
        req.on("data", (chunk) => {
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
                resolve(raw ? JSON.parse(raw) : {});
            }
            catch {
                reject(new Error("Request body must be valid JSON."));
            }
        });
        req.on("error", reject);
    });
}
function readBinaryBody(req, maxBytes = maxBinaryBodyBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let totalLength = 0;
        req.on("data", (chunk) => {
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
function base64UrlEncode(input) {
    const buffer = Buffer.isBuffer(input)
        ? input
        : Buffer.from(typeof input === "string" ? input : JSON.stringify(input), "utf8");
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
function createSignedJwt(serviceAccountEmail, privateKey, scopes) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const header = { alg: "RS256", typ: "JWT" };
    const claims = {
        aud: googleTokenUrl,
        exp: issuedAt + 3600,
        iat: issuedAt,
        iss: serviceAccountEmail,
        scope: scopes.join(" ")
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
async function getGoogleAccessToken(scopes) {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    if (!serviceAccountEmail || !privateKey) {
        throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY environment variables.");
    }
    const assertion = createSignedJwt(serviceAccountEmail, privateKey, scopes);
    const body = new URLSearchParams({
        assertion,
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer"
    });
    const response = await fetch(googleTokenUrl, {
        body,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        method: "POST"
    });
    const payload = (await response.json());
    if (!response.ok || !payload.access_token) {
        const details = payload.error_description || payload.error || "Unknown token error.";
        throw new Error(`Google token request failed: ${details}`);
    }
    return payload.access_token;
}
function toSheetValues(row) {
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
async function appendRowsToGoogleSheet(input) {
    const accessToken = await getGoogleAccessToken([
        "https://www.googleapis.com/auth/spreadsheets"
    ]);
    const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(input.spreadsheetId)}` +
        `/values/${encodeURIComponent(input.range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const response = await fetch(endpoint, {
        body: JSON.stringify({
            majorDimension: "ROWS",
            values: input.rows.map(toSheetValues)
        }),
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json"
        },
        method: "POST"
    });
    const payload = (await response.json());
    if (!response.ok) {
        const details = payload.error?.message || "Unknown Sheets API error.";
        throw new Error(`Google Sheets append failed: ${details}`);
    }
    return payload;
}
async function uploadFileToGoogleDrive(input) {
    const accessToken = await getGoogleAccessToken([
        "https://www.googleapis.com/auth/drive.file"
    ]);
    const boundary = `codex-upload-${Date.now()}`;
    const metadata = {
        name: input.fileName
    };
    if (input.folderId) {
        metadata.parents = [input.folderId];
    }
    const multipartBody = Buffer.concat([
        Buffer.from(`--${boundary}\r\n` +
            "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
            `${JSON.stringify(metadata)}\r\n` +
            `--${boundary}\r\n` +
            `Content-Type: ${input.mimeType}\r\n\r\n`, "utf8"),
        input.fileBuffer,
        Buffer.from(`\r\n--${boundary}--`, "utf8")
    ]);
    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink", {
        body: multipartBody,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": `multipart/related; boundary=${boundary}`
        },
        method: "POST"
    });
    const payload = (await response.json());
    if (!response.ok) {
        const details = payload.error?.message || "Unknown Google Drive error.";
        throw new Error(`Google Drive upload failed: ${details}`);
    }
    return payload;
}
function normalizeBaseUrl(value) {
    return value.replace(/\/+$/g, "");
}
function getNextAgencyAccessToken(settings) {
    return (settings.nextAgencyAccessToken ||
        trimString(process.env.NEXTAGENCY_ACCESS_TOKEN) ||
        trimString(process.env.NEXTAGENCY_BEARER_TOKEN));
}
function normalizeExactName(value) {
    return value.trim().replace(/\s+/g, " ").toLowerCase();
}
function buildPatientDisplayName(patient) {
    const fullName = trimString(patient.fullName);
    if (fullName) {
        return fullName;
    }
    return [trimString(patient.firstName), trimString(patient.lastName)]
        .filter(Boolean)
        .join(" ")
        .trim();
}
function buildCaseDisplayName(caseRecord) {
    const directName = trimString(caseRecord.name);
    if (directName) {
        return directName;
    }
    return [trimString(caseRecord.first_name), trimString(caseRecord.last_name)]
        .filter(Boolean)
        .join(" ")
        .trim();
}
function buildPatientMatchKey(patient) {
    return normalizeExactName(buildPatientDisplayName(patient));
}
function dedupePatients(patients) {
    const byName = new Map();
    for (const patient of patients) {
        const key = buildPatientMatchKey(patient);
        if (!key) {
            continue;
        }
        const existing = byName.get(key);
        if (!existing) {
            byName.set(key, {
                fileName: trimString(patient.fileName),
                fileNames: new Set(trimString(patient.fileName) ? [trimString(patient.fileName)] : []),
                firstName: trimString(patient.firstName),
                fullName: buildPatientDisplayName(patient),
                lastName: trimString(patient.lastName)
            });
            continue;
        }
        if (trimString(patient.fileName)) {
            existing.fileNames.add(trimString(patient.fileName));
        }
    }
    return [...byName.values()].map((patient) => ({
        fileName: [...patient.fileNames].join(", "),
        firstName: patient.firstName,
        fullName: patient.fullName,
        lastName: patient.lastName
    }));
}
async function fetchNextAgencyCases(settings) {
    const accessToken = getNextAgencyAccessToken(settings);
    if (!accessToken) {
        throw new Error("Missing NextAgency access token.");
    }
    const pageSize = sanitizeInteger(settings.nextAgencyCasePageSize, getDefaultSettings().nextAgencyCasePageSize, 1, 50);
    const baseUrl = normalizeBaseUrl(settings.nextAgencyApiBaseUrl);
    const results = [];
    for (let offset = 0; offset < 5000; offset += pageSize) {
        const response = await fetch(`${baseUrl}/api/v2/businesses?limit=${pageSize}&offset=${offset}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`
            },
            method: "GET"
        });
        const payload = (await response.json());
        if (!response.ok) {
            const details = payload.error?.message || payload.message || "Unknown NextAgency error.";
            throw new Error(`NextAgency case lookup failed: ${details}`);
        }
        const page = Array.isArray(payload.data) ? payload.data : [];
        results.push(...page);
        if (page.length < pageSize) {
            break;
        }
    }
    return results;
}
function findMatchingCases(patient, cases) {
    const patientName = buildPatientDisplayName(patient);
    const patientKey = normalizeExactName(patientName);
    const firstNameKey = normalizeExactName(trimString(patient.firstName));
    const lastNameKey = normalizeExactName(trimString(patient.lastName));
    return cases.filter((caseRecord) => {
        const directNameMatch = normalizeExactName(buildCaseDisplayName(caseRecord)) === patientKey;
        const splitNameMatch = Boolean(firstNameKey && lastNameKey) &&
            normalizeExactName(trimString(caseRecord.first_name)) === firstNameKey &&
            normalizeExactName(trimString(caseRecord.last_name)) === lastNameKey;
        return directNameMatch || splitNameMatch;
    });
}
function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
function formatNextAgencyDueDate(dateInput, dueTimeUtc) {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        throw new Error("Due date must be in YYYY-MM-DD format.");
    }
    const [, year, month, day] = match;
    return `${month}-${day}-${year} ${dueTimeUtc}`;
}
function resolveSheetLabel(settings) {
    const explicitLabel = trimString(settings.spreadsheetLabel);
    if (explicitLabel) {
        return explicitLabel;
    }
    const rangeSheetName = trimString(settings.range).split("!")[0]?.trim() || "";
    if (rangeSheetName) {
        return rangeSheetName;
    }
    return trimString(settings.spreadsheetId) || "Google Sheet";
}
async function createNextAgencyTask(input) {
    const response = await fetch(`${input.baseUrl}/api/v2/businesses/${input.caseId}/tasks`, {
        body: JSON.stringify({
            assigned_to: [input.assignedToUserId],
            body: `<p>${escapeHtml(input.bodyName)}</p>`,
            due: formatNextAgencyDueDate(input.dueDate, input.dueTimeUtc),
            priority: input.priority,
            stage: input.stage,
            title: input.title,
            type: input.type
        }),
        headers: {
            Authorization: `Bearer ${input.token}`,
            "Content-Type": "application/json"
        },
        method: "POST"
    });
    const payload = (await response.json());
    if (!response.ok || !payload.data?.id) {
        const details = payload.error?.message || payload.message || "Unknown NextAgency error.";
        throw new Error(`NextAgency task creation failed: ${details}`);
    }
    return {
        redirectUrl: trimString(payload.data.redirect_url),
        taskId: payload.data.id
    };
}
async function createNextAgencyTasksForPatients(input) {
    const accessToken = getNextAgencyAccessToken(input.settings);
    if (!accessToken) {
        throw new Error("Save a NextAgency access token before creating tasks.");
    }
    const assignedToUserId = trimString(input.settings.nextAgencyAssignedToUserId);
    if (!assignedToUserId) {
        throw new Error("Save Shelby Holman's NextAgency user ID before creating tasks.");
    }
    const uniquePatients = dedupePatients(input.patients);
    const cases = await fetchNextAgencyCases(input.settings);
    const bodyName = resolveSheetLabel(input.settings);
    const summary = {
        ambiguousPatients: [],
        createdTasks: [],
        erroredPatients: [],
        unmatchedPatients: []
    };
    for (const patient of uniquePatients) {
        const patientName = buildPatientDisplayName(patient);
        const patientFileName = trimString(patient.fileName);
        const fileNames = patientFileName
            ? patientFileName.split(",").map((value) => value.trim()).filter(Boolean)
            : [];
        const matches = findMatchingCases(patient, cases);
        if (!matches.length) {
            summary.unmatchedPatients.push({
                fileNames,
                patientName
            });
            continue;
        }
        if (matches.length > 1) {
            summary.ambiguousPatients.push({
                fileNames,
                matches: matches.map(buildCaseDisplayName).filter(Boolean),
                patientName
            });
            continue;
        }
        try {
            const createdTask = await createNextAgencyTask({
                assignedToUserId,
                baseUrl: normalizeBaseUrl(input.settings.nextAgencyApiBaseUrl),
                bodyName,
                caseId: matches[0].id,
                dueDate: input.dueDate,
                dueTimeUtc: input.settings.nextAgencyTaskDueTimeUtc,
                priority: input.settings.nextAgencyTaskPriority,
                stage: input.settings.nextAgencyTaskStage,
                title: input.title,
                token: accessToken,
                type: input.settings.nextAgencyTaskType
            });
            summary.createdTasks.push({
                caseId: matches[0].id,
                fileNames,
                patientName,
                redirectUrl: createdTask.redirectUrl,
                taskId: createdTask.taskId
            });
        }
        catch (error) {
            summary.erroredPatients.push({
                error: error instanceof Error ? error.message : "Unknown NextAgency error.",
                fileNames,
                patientName
            });
        }
    }
    return summary;
}
async function handleSheetsAppend(req, res) {
    try {
        const body = await readJsonBody(req);
        const appSettings = loadAppSettings();
        const spreadsheetId = String(body.spreadsheetId || appSettings.spreadsheetId || "").trim();
        const range = String(body.range || appSettings.range || "").trim();
        const rows = Array.isArray(body.rows) ? body.rows : [];
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
        const payload = await appendRowsToGoogleSheet({ range, rows, spreadsheetId });
        const updates = payload.updates;
        sendJson(res, 200, {
            ok: true,
            spreadsheetId: payload.spreadsheetId,
            tableRange: payload.tableRange || "",
            updatedRange: updates?.updatedRange || "",
            updatedRows: updates?.updatedRows || 0
        });
    }
    catch (error) {
        sendJson(res, 500, {
            error: error instanceof Error ? error.message : "Unexpected server error."
        });
    }
}
async function handleDriveUpload(req, res) {
    try {
        const appSettings = loadAppSettings();
        const rawFileName = String(req.headers["x-file-name"] || "").trim();
        const fileName = rawFileName ? decodeURIComponent(rawFileName) : "";
        const mimeType = String(req.headers["content-type"] || "application/octet-stream").trim();
        const folderId = String(req.headers["x-drive-folder-id"] || appSettings.driveFolderId || "").trim();
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
            driveFileId: payload.id,
            fileName: payload.name,
            ok: true,
            webViewLink: payload.webViewLink || `https://drive.google.com/file/d/${payload.id}/view`
        });
    }
    catch (error) {
        sendJson(res, 500, {
            error: error instanceof Error ? error.message : "Unexpected server error."
        });
    }
}
async function handleNextAgencyTaskCreate(req, res) {
    try {
        const body = await readJsonBody(req);
        const settings = loadAppSettings();
        const title = trimString(body.title);
        const dueDate = trimString(body.dueDate);
        const patients = Array.isArray(body.patients)
            ? body.patients
            : [];
        if (!title) {
            sendJson(res, 400, { error: "Missing task title." });
            return;
        }
        if (!dueDate) {
            sendJson(res, 400, { error: "Missing task due date." });
            return;
        }
        if (!patients.length) {
            sendJson(res, 400, { error: "No patients were provided for task creation." });
            return;
        }
        if (!getNextAgencyAccessToken(settings)) {
            sendJson(res, 400, {
                error: "Save a NextAgency access token in Settings before creating tasks."
            });
            return;
        }
        if (!trimString(settings.nextAgencyAssignedToUserId)) {
            sendJson(res, 400, {
                error: "Save Shelby Holman's NextAgency user ID in Settings before creating tasks."
            });
            return;
        }
        const summary = await createNextAgencyTasksForPatients({
            dueDate,
            patients,
            settings,
            title
        });
        sendJson(res, 200, {
            ambiguousPatients: summary.ambiguousPatients,
            assignedTo: trimString(settings.nextAgencyAssignedToDisplayName) ||
                trimString(settings.nextAgencyAssignedToUserId),
            body: resolveSheetLabel(settings),
            createdCount: summary.createdTasks.length,
            createdTasks: summary.createdTasks,
            dueDate,
            erroredPatients: summary.erroredPatients,
            ok: summary.ambiguousPatients.length === 0 &&
                summary.erroredPatients.length === 0 &&
                summary.unmatchedPatients.length === 0,
            title,
            unmatchedPatients: summary.unmatchedPatients
        });
    }
    catch (error) {
        sendJson(res, 500, {
            error: error instanceof Error ? error.message : "Unexpected server error."
        });
    }
}
async function handleSettingsSave(req, res) {
    try {
        const body = await readJsonBody(req);
        const savedSettings = saveAppSettings(body);
        sendJson(res, 200, {
            ok: true,
            settings: {
                ...savedSettings,
                nextAgencyAccessToken: ""
            }
        });
    }
    catch (error) {
        sendJson(res, 500, {
            error: error instanceof Error ? error.message : "Unexpected server error."
        });
    }
}
function buildReadinessLabel(settings) {
    const hasGoogle = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
    const hasNextAgency = Boolean(getNextAgencyAccessToken(settings) && trimString(settings.nextAgencyAssignedToUserId));
    if (hasGoogle && hasNextAgency) {
        return "Google + NextAgency ready";
    }
    if (hasGoogle) {
        return "Google ready";
    }
    if (hasNextAgency) {
        return "NextAgency ready";
    }
    return "Setup needed";
}
function handleConfig(res) {
    const settings = loadAppSettings();
    const savedSettings = readSavedSettings();
    sendJson(res, 200, {
        configLabel: buildReadinessLabel(settings),
        driveFolderId: settings.driveFolderId,
        hasDriveTarget: Boolean(settings.driveFolderId),
        hasGoogleCredentials: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY),
        hasNextAgencyAccessToken: Boolean(getNextAgencyAccessToken(settings)),
        hasNextAgencyConfigured: Boolean(getNextAgencyAccessToken(settings) && trimString(settings.nextAgencyAssignedToUserId)),
        nextAgencyApiBaseUrl: settings.nextAgencyApiBaseUrl,
        nextAgencyAssignedToDisplayName: settings.nextAgencyAssignedToDisplayName,
        nextAgencyAssignedToUserId: settings.nextAgencyAssignedToUserId,
        nextAgencyCasePageSize: settings.nextAgencyCasePageSize,
        nextAgencyTaskDueTimeUtc: settings.nextAgencyTaskDueTimeUtc,
        nextAgencyTaskPriority: settings.nextAgencyTaskPriority,
        nextAgencyTaskStage: settings.nextAgencyTaskStage,
        nextAgencyTaskType: settings.nextAgencyTaskType,
        range: settings.range,
        settingsFilePath,
        settingsSaved: Boolean(savedSettings),
        spreadsheetId: settings.spreadsheetId,
        spreadsheetLabel: resolveSheetLabel(settings)
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
    if (method === "POST" && requestPath === "/api/google-drive/upload") {
        void handleDriveUpload(req, res);
        return;
    }
    if (method === "POST" && requestPath === "/api/nextagency/tasks") {
        void handleNextAgencyTaskCreate(req, res);
        return;
    }
    if (method === "POST" && requestPath === "/api/settings") {
        void handleSettingsSave(req, res);
        return;
    }
    const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
    const resolvedPath = safePath === "/"
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
