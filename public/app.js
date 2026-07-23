const workerUrl =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.worker.min.mjs";
const pdfModuleUrl =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.5.136/build/pdf.min.mjs";

const SHEET_COLUMNS = [
  { key: "firstName", label: "First Name" },
  { key: "lastName", label: "Last Name" },
  { key: "source", label: "Source" },
  { key: "med", label: "Med" },
  { key: "medicationType", label: "Medication Type" },
  { key: "dosage", label: "Dosage" },
  { key: "frequencyTaken", label: "Frequency Taken" },
  { key: "refillSchedule", label: "Refill Schedule" },
  { key: "signatureDate", label: "Signature Date" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
  { key: "dateOfBirth", label: "Date of Birth" }
];

const EMPTY_CONFIG = {
  configLabel: "Setup needed",
  driveFolderId: "",
  hasGoogleCredentials: false,
  hasNextAgencyAccessToken: false,
  hasNextAgencyConfigured: false,
  nextAgencyApiBaseUrl: "https://yahoo.nextbroker.io",
  nextAgencyAssignedToDisplayName: "Shelby Holman",
  nextAgencyAssignedToUserId: "",
  nextAgencyCasePageSize: 50,
  nextAgencyTaskDueTimeUtc: "05:00 AM UTC",
  nextAgencyTaskPriority: 1,
  nextAgencyTaskStage: "To Do",
  nextAgencyTaskType: "Other",
  range: "Medications!A:M",
  settingsSaved: false,
  spreadsheetId: "",
  spreadsheetLabel: "Medications"
};

const state = {
  currentPage: getPageFromHash(),
  isSavingSettings: false,
  isWriting: false,
  results: [],
  serverConfig: { ...EMPTY_CONFIG }
};

const dom = {
  appendButton: document.getElementById("appendButton"),
  clearButton: document.getElementById("clearButton"),
  configBadge: document.getElementById("configBadge"),
  copyButton: document.getElementById("copyButton"),
  driveFolderIdInput: document.getElementById("driveFolderIdInput"),
  dropzone: document.getElementById("dropzone"),
  emptyState: document.getElementById("emptyState"),
  fileInput: document.getElementById("fileInput"),
  navConfigBadge: document.getElementById("navConfigBadge"),
  nextAgencyAccessTokenInput: document.getElementById("nextAgencyAccessTokenInput"),
  nextAgencyApiBaseUrlInput: document.getElementById("nextAgencyApiBaseUrlInput"),
  nextAgencyAssignedToDisplayNameInput: document.getElementById(
    "nextAgencyAssignedToDisplayNameInput"
  ),
  nextAgencyAssignedToUserIdInput: document.getElementById(
    "nextAgencyAssignedToUserIdInput"
  ),
  nextAgencyBadge: document.getElementById("nextAgencyBadge"),
  nextAgencyCasePageSizeInput: document.getElementById("nextAgencyCasePageSizeInput"),
  nextAgencyTaskDueTimeUtcInput: document.getElementById(
    "nextAgencyTaskDueTimeUtcInput"
  ),
  nextAgencyTaskPriorityInput: document.getElementById("nextAgencyTaskPriorityInput"),
  nextAgencyTaskStageInput: document.getElementById("nextAgencyTaskStageInput"),
  nextAgencyTaskTypeInput: document.getElementById("nextAgencyTaskTypeInput"),
  pageLinks: [...document.querySelectorAll("[data-page-link]")],
  pageViews: [...document.querySelectorAll("[data-page]")],
  previewTableBody: document.getElementById("previewTableBody"),
  resultsList: document.getElementById("resultsList"),
  saveSettingsButton: document.getElementById("saveSettingsButton"),
  settingsStatus: document.getElementById("settingsStatus"),
  sheetRangeInput: document.getElementById("sheetRangeInput"),
  sheetStatus: document.getElementById("sheetStatus"),
  spreadsheetIdInput: document.getElementById("spreadsheetIdInput"),
  spreadsheetLabelInput: document.getElementById("spreadsheetLabelInput"),
  summaryCard: document.getElementById("summaryCard"),
  summaryFileCount: document.getElementById("summaryFileCount"),
  summaryRowCount: document.getElementById("summaryRowCount"),
  taskDueDateInput: document.getElementById("taskDueDateInput"),
  taskTitleInput: document.getElementById("taskTitleInput")
};

const pdfjsLib = await import(pdfModuleUrl);
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

bindEvents();
await loadServerConfig();
syncPageFromHash();
render();

function bindEvents() {
  window.addEventListener("hashchange", handleHashChange);
  dom.dropzone.addEventListener("dragenter", activateDropzone);
  dom.dropzone.addEventListener("dragover", activateDropzone);
  dom.dropzone.addEventListener("dragleave", deactivateDropzone);
  dom.dropzone.addEventListener("drop", handleDrop);
  dom.dropzone.addEventListener("keydown", handleDropzoneKeydown);
  dom.fileInput.addEventListener("change", handleFileInputChange);
  dom.clearButton.addEventListener("click", clearResults);
  dom.copyButton.addEventListener("click", copyJson);
  dom.appendButton.addEventListener("click", appendRowsToSheet);
  dom.saveSettingsButton.addEventListener("click", saveSettings);

  const settingsInputs = [
    dom.spreadsheetIdInput,
    dom.spreadsheetLabelInput,
    dom.sheetRangeInput,
    dom.driveFolderIdInput,
    dom.nextAgencyApiBaseUrlInput,
    dom.nextAgencyAccessTokenInput,
    dom.nextAgencyAssignedToDisplayNameInput,
    dom.nextAgencyAssignedToUserIdInput,
    dom.nextAgencyTaskStageInput,
    dom.nextAgencyTaskTypeInput,
    dom.nextAgencyTaskPriorityInput,
    dom.nextAgencyCasePageSizeInput,
    dom.nextAgencyTaskDueTimeUtcInput
  ];

  for (const input of settingsInputs) {
    input.addEventListener("input", handleSettingsInput);
  }
}

function getPageFromHash() {
  return window.location.hash === "#settings" ? "settings" : "upload";
}

function handleHashChange() {
  syncPageFromHash();
}

function syncPageFromHash() {
  state.currentPage = getPageFromHash();

  for (const pageView of dom.pageViews) {
    const isActive = pageView.dataset.page === state.currentPage;
    pageView.classList.toggle("hidden", !isActive);
  }

  for (const pageLink of dom.pageLinks) {
    pageLink.classList.toggle("is-active", pageLink.dataset.pageLink === state.currentPage);
  }
}

async function loadServerConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("Config request failed.");
    }

    state.serverConfig = {
      ...EMPTY_CONFIG,
      ...(await response.json())
    };
    applyServerConfigToInputs();
    setSettingsStatus(
      state.serverConfig.settingsSaved
        ? "Saved server settings loaded."
        : "Using default settings from the server.",
      "success"
    );
  } catch (error) {
    state.serverConfig = { ...EMPTY_CONFIG };
    applyServerConfigToInputs();
    setSheetStatus(
      "Could not load server config. You can still enter the sheet details manually.",
      "error"
    );
    setSettingsStatus("Settings could not be loaded from the server.", "error");
  }

  updateActionState();
}

function applyServerConfigToInputs() {
  dom.spreadsheetIdInput.value = state.serverConfig.spreadsheetId || "";
  dom.spreadsheetLabelInput.value = state.serverConfig.spreadsheetLabel || "Medications";
  dom.sheetRangeInput.value = state.serverConfig.range || "Medications!A:M";
  dom.driveFolderIdInput.value = state.serverConfig.driveFolderId || "";
  dom.nextAgencyApiBaseUrlInput.value =
    state.serverConfig.nextAgencyApiBaseUrl || "https://yahoo.nextbroker.io";
  dom.nextAgencyAccessTokenInput.value = "";
  dom.nextAgencyAssignedToDisplayNameInput.value =
    state.serverConfig.nextAgencyAssignedToDisplayName || "Shelby Holman";
  dom.nextAgencyAssignedToUserIdInput.value =
    state.serverConfig.nextAgencyAssignedToUserId || "";
  dom.nextAgencyTaskStageInput.value = state.serverConfig.nextAgencyTaskStage || "To Do";
  dom.nextAgencyTaskTypeInput.value = state.serverConfig.nextAgencyTaskType || "Other";
  dom.nextAgencyTaskPriorityInput.value = String(
    state.serverConfig.nextAgencyTaskPriority || 1
  );
  dom.nextAgencyCasePageSizeInput.value = String(
    state.serverConfig.nextAgencyCasePageSize || 50
  );
  dom.nextAgencyTaskDueTimeUtcInput.value =
    state.serverConfig.nextAgencyTaskDueTimeUtc || "05:00 AM UTC";
  dom.nextAgencyAccessTokenInput.placeholder = state.serverConfig.hasNextAgencyAccessToken
    ? "Leave blank to keep the saved token"
    : "Paste a NextAgency access token";
}

function handleSettingsInput() {
  setSettingsStatus("Unsaved changes.", "");
  updateActionState();
}

async function saveSettings() {
  state.isSavingSettings = true;
  updateActionState();
  setSettingsStatus("Saving settings...", "");

  try {
    const response = await fetch("/api/settings", {
      body: JSON.stringify({
        driveFolderId: dom.driveFolderIdInput.value.trim(),
        nextAgencyAccessToken: dom.nextAgencyAccessTokenInput.value.trim(),
        nextAgencyApiBaseUrl: dom.nextAgencyApiBaseUrlInput.value.trim(),
        nextAgencyAssignedToDisplayName:
          dom.nextAgencyAssignedToDisplayNameInput.value.trim(),
        nextAgencyAssignedToUserId: dom.nextAgencyAssignedToUserIdInput.value.trim(),
        nextAgencyCasePageSize: dom.nextAgencyCasePageSizeInput.value.trim(),
        nextAgencyTaskDueTimeUtc: dom.nextAgencyTaskDueTimeUtcInput.value.trim(),
        nextAgencyTaskPriority: dom.nextAgencyTaskPriorityInput.value.trim(),
        nextAgencyTaskStage: dom.nextAgencyTaskStageInput.value.trim(),
        nextAgencyTaskType: dom.nextAgencyTaskTypeInput.value.trim(),
        range: dom.sheetRangeInput.value.trim(),
        spreadsheetId: dom.spreadsheetIdInput.value.trim(),
        spreadsheetLabel: dom.spreadsheetLabelInput.value.trim()
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not save settings.");
    }

    await loadServerConfig();
    setSettingsStatus("Settings saved on the server.", "success");
  } catch (error) {
    setSettingsStatus(
      error instanceof Error ? error.message : "Could not save settings.",
      "error"
    );
  } finally {
    state.isSavingSettings = false;
    updateActionState();
  }
}

function activateDropzone(event) {
  event.preventDefault();
  dom.dropzone.classList.add("is-active");
}

function deactivateDropzone(event) {
  event.preventDefault();
  if (event.type === "dragleave" && dom.dropzone.contains(event.relatedTarget)) {
    return;
  }
  dom.dropzone.classList.remove("is-active");
}

function handleDrop(event) {
  event.preventDefault();
  dom.dropzone.classList.remove("is-active");
  const files = Array.from(event.dataTransfer?.files || []).filter(isPdfFile);
  void processFiles(files);
}

function handleDropzoneKeydown(event) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    dom.fileInput.click();
  }
}

function handleFileInputChange(event) {
  const files = Array.from(event.target.files || []).filter(isPdfFile);
  void processFiles(files);
  dom.fileInput.value = "";
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function processFiles(files) {
  if (!files.length) {
    return;
  }

  setSheetStatus("", "");
  const parsed = [];
  for (const file of files) {
    try {
      const text = await extractPdfText(file);
      parsed.push(buildResult(file, text));
    } catch (error) {
      parsed.push({
        fileName: file.name,
        fileSize: file.size,
        file,
        notes: [error instanceof Error ? error.message : "Unknown parsing error"],
        patient: {
          firstName: "",
          fullName: "",
          lastName: ""
        },
        rows: [],
        sourceLink: ""
      });
    }
  }

  state.results = mergeByFileName([...state.results, ...parsed]);
  render();
}

async function extractPdfText(file) {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(pageItemsToText(content.items));
  }

  return pages.join("\n");
}

function pageItemsToText(items) {
  const rows = new Map();

  for (const item of items) {
    if (!("str" in item) || !item.str.trim()) {
      continue;
    }

    const y = Math.round(item.transform[5]);
    const x = Math.round(item.transform[4]);
    const bucket = findRowBucket(rows, y);
    const entries = rows.get(bucket) || [];
    entries.push({ text: item.str.trim(), x });
    rows.set(bucket, entries);
  }

  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, entries]) =>
      entries
        .sort((a, b) => a.x - b.x)
        .map((entry) => entry.text)
        .join(" ")
    )
    .join("\n");
}

function findRowBucket(rows, y) {
  for (const key of rows.keys()) {
    if (Math.abs(key - y) <= 3) {
      return key;
    }
  }
  return y;
}

function buildResult(file, text) {
  const normalizedText = normalizeText(text);
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const shared = extractSharedFields(lines, normalizedText);
  const worksheetRows = extractWorksheetRows(lines, shared);
  const prescriptionRows = extractPrescriptionRows(lines, shared);
  const rows = [...worksheetRows, ...prescriptionRows];
  const notes = [];

  if (!rows.length) {
    notes.push("No exact medication rows were detected in this file.");
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    file,
    notes,
    patient: {
      firstName: shared.firstName,
      fullName: shared.fullName,
      lastName: shared.lastName
    },
    rows,
    sourceLink: ""
  };
}

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function extractSharedFields(lines, text) {
  const fullName = extractExactName(lines, text);
  const { firstName, lastName } = splitName(fullName);
  const email = extractExactEmail(text);
  const phone = extractExactPhone(text);

  return {
    address: extractExactAddress(lines),
    dateOfBirth: extractExactDateOfBirth(text),
    email,
    firstName,
    fullName,
    lastName,
    phone,
    signatureDate: extractExactSignatureDate(lines, text)
  };
}

function extractExactName(lines, text) {
  const lineIndex = lines.findIndex((line) => line === "NAME EMAIL PHONE");
  if (lineIndex >= 0 && lines[lineIndex + 1]) {
    const candidate = lines[lineIndex + 1].match(
      /^([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)+)\b/
    );
    if (candidate?.[1]) {
      return candidate[1].trim();
    }
  }

  const beneficiaryIndex = lines.findIndex((line) => line === "BENEFICIARY");
  if (beneficiaryIndex >= 0 && lines[beneficiaryIndex + 1]) {
    return lines[beneficiaryIndex + 1].trim();
  }

  const matches = [
    text.match(/Beneficiary Name:\s*([^\n]+)/i),
    text.match(
      /Print Name:\s*_*\s*([A-Za-z][A-Za-z.'-]+(?:\s+[A-Za-z][A-Za-z.'-]+)+)/i
    )
  ];

  for (const match of matches) {
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function splitName(fullName) {
  const parts = fullName.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return { firstName: "", lastName: "" };
  }

  return {
    firstName: parts[0] || "",
    lastName: parts.slice(1).join(" ")
  };
}

function extractExactEmail(text) {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || "";
}

function extractExactPhone(text) {
  const match = text.match(/(?:\(\d{3}\)\s*\d{3}-\d{4}|\b\d{10}\b)/);
  return match?.[0] || "";
}

function extractExactAddress(lines) {
  const worksheetHeaderIndex = lines.findIndex(
    (line) => line === "ADDRESS COUNTY PREFERRED PHARMACY"
  );
  if (worksheetHeaderIndex >= 0) {
    const nextLine = lines[worksheetHeaderIndex + 1] || "";
    const match = nextLine.match(/(.+?\d{5})\b/);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const beneficiaryInfoIndex = lines.findIndex(
    (line) => line === "Beneficiary information"
  );
  if (beneficiaryInfoIndex >= 0) {
    const collected = [];
    let started = false;

    for (let index = beneficiaryInfoIndex + 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (/^Date of Birth:/i.test(line) || line === "Additional notes") {
        break;
      }

      if (line.includes("@")) {
        started = true;
        continue;
      }

      if (!started) {
        continue;
      }

      if (/^(County|\(\d{3}\)|\d{10}$)/.test(line)) {
        if (line === "County") {
          collected.push(line);
        }
        continue;
      }

      collected.push(line);
    }

    const address = collected.join(" ").replace(/\s+,/g, ",").trim();
    if (address) {
      return address;
    }
  }

  return "";
}

function extractExactDateOfBirth(text) {
  const match = text.match(/Date of Birth:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i);
  return match?.[1] || "";
}

function extractExactSignatureDate(lines, text) {
  const directMatch = text.match(
    /Signature Date:\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i
  );
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  const printNameIndex = lines.findIndex((line) => /^Print Name:/i.test(line));
  if (printNameIndex >= 0) {
    for (
      let index = printNameIndex + 1;
      index < Math.min(lines.length, printNameIndex + 4);
      index += 1
    ) {
      const match = lines[index].match(/[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}/);
      if (match?.[0]) {
        return match[0];
      }
    }
  }

  return "";
}

function extractWorksheetRows(lines, shared) {
  const rows = [];
  const headerIndex = lines.findIndex((line) =>
    line.startsWith("MEDICATION NAME M E D I C A T I O N TYPE")
  );

  if (headerIndex < 0) {
    return rows;
  }

  for (let index = headerIndex + 1; index < lines.length - 2; index += 1) {
    const line = lines[index];
    const rowNumber = lines[index + 1];
    const dosageLine = lines[index + 2];

    if (
      !line ||
      /^As it appears/.test(line) ||
      /^If your option/.test(line) ||
      /^Agent and Broker Authorization/.test(line) ||
      /^H&R Insurance Planners, LLC\. MEDICATION WORKSHEET Page 2/.test(line)
    ) {
      continue;
    }

    if (!/^\d+$/.test(rowNumber) || !isDosageValue(dosageLine)) {
      continue;
    }

    const typeMatch = line.match(/\b(Tablet|Capsule|Injection|Cream|Patch|Spray)\b/i);
    if (!typeMatch?.[1]) {
      continue;
    }

    const medicationType = typeMatch[1].trim();
    const med = line.slice(0, typeMatch.index).trim();
    let remainder = line.slice(typeMatch.index + medicationType.length).trim();
    if (/^Other:/i.test(remainder)) {
      remainder = remainder.replace(/^Other:\s*/i, "");
    }

    const refillMatch = remainder.match(/(\d+\s+day\s+supply)$/i);
    const refillSchedule = refillMatch?.[1]?.trim() || "";
    const frequencyTaken = refillMatch
      ? remainder.slice(0, remainder.length - refillSchedule.length).trim()
      : remainder.trim();

    rows.push(
      buildSheetRow(shared, {
        dosage: dosageLine.trim(),
        frequencyTaken,
        med,
        medicationType,
        refillSchedule
      })
    );

    index += 2;
  }

  return rows;
}

function extractPrescriptionRows(lines, shared) {
  const rows = [];
  const startIndex = lines.findIndex((line) => line === "Current prescriptions");
  if (startIndex < 0) {
    return rows;
  }

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (
      !line ||
      line === "Additional notes" ||
      line.startsWith("Scope of Sales Appointment") ||
      line.startsWith("Powered by")
    ) {
      if (
        line === "Additional notes" ||
        line.startsWith("Scope of Sales Appointment")
      ) {
        break;
      }
      continue;
    }

    const match = line.match(
      /^\d+\.\s+(.+?)\s+(TAB|TABLET|CAPSULE|INJECTION|CREAM|PATCH|SPRAY)\s+([0-9A-Z.]+)$/i
    );
    if (!match) {
      continue;
    }

    const detailsLine = lines[index + 1] || "";
    const frequencyMatch = detailsLine.match(/Frequency:\s*(.+)$/i);

    rows.push(
      buildSheetRow(shared, {
        dosage: match[3].trim(),
        frequencyTaken: frequencyMatch?.[1]?.trim() || "",
        med: match[1].trim(),
        medicationType: match[2].trim(),
        refillSchedule: ""
      })
    );
  }

  return rows;
}

function buildSheetRow(shared, partialRow) {
  return {
    address: shared.address,
    dateOfBirth: shared.dateOfBirth,
    dosage: partialRow.dosage || "",
    email: shared.email,
    firstName: shared.firstName,
    frequencyTaken: partialRow.frequencyTaken || "",
    lastName: shared.lastName,
    med: partialRow.med || "",
    medicationType: partialRow.medicationType || "",
    phone: shared.phone,
    refillSchedule: partialRow.refillSchedule || "",
    signatureDate: shared.signatureDate,
    source: ""
  };
}

function isDosageValue(value) {
  return /\b\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|units?)\b/i.test(value || "");
}

function mergeByFileName(results) {
  const byName = new Map();
  for (const result of results) {
    byName.set(result.fileName, result);
  }
  return [...byName.values()];
}

function clearResults() {
  state.results = [];
  setSheetStatus("", "");
  render();
}

async function copyJson() {
  const payload = JSON.stringify(
    {
      files: state.results.map((result) => ({
        fileName: result.fileName,
        fileSize: result.fileSize,
        notes: result.notes,
        patient: result.patient,
        rows: result.rows,
        sourceLink: result.sourceLink || ""
      })),
      rows: flattenRows()
    },
    null,
    2
  );
  await navigator.clipboard.writeText(payload);
  dom.copyButton.textContent = "Copied";
  window.setTimeout(() => {
    dom.copyButton.textContent = "Copy JSON";
  }, 1400);
}

function buildTaskRequest() {
  const title = dom.taskTitleInput.value.trim();
  const dueDate = dom.taskDueDateInput.value.trim();

  if (!title && !dueDate) {
    return null;
  }

  if (!title || !dueDate) {
    throw new Error("Enter both a task title and due date, or leave both blank.");
  }

  if (!state.serverConfig.hasNextAgencyConfigured) {
    throw new Error(
      "Save the NextAgency access token and Shelby's assigned user ID in Settings before creating tasks."
    );
  }

  return { dueDate, title };
}

function collectPatientsForTasks(results) {
  const byName = new Map();

  for (const result of results) {
    const patient = result.patient || {};
    const fullName = (patient.fullName || "").trim();
    const fallbackName = [patient.firstName || "", patient.lastName || ""]
      .filter(Boolean)
      .join(" ")
      .trim();
    const patientName = fullName || fallbackName;

    if (!patientName) {
      continue;
    }

    const key = patientName.toLowerCase().replace(/\s+/g, " ");
    if (!byName.has(key)) {
      byName.set(key, {
        fileName: result.fileName,
        firstName: patient.firstName || "",
        fullName: patientName,
        lastName: patient.lastName || ""
      });
      continue;
    }

    const existing = byName.get(key);
    existing.fileName = `${existing.fileName}, ${result.fileName}`;
  }

  return [...byName.values()];
}

async function appendRowsToSheet() {
  const spreadsheetId = dom.spreadsheetIdInput.value.trim();
  const range = dom.sheetRangeInput.value.trim();
  const driveFolderId = dom.driveFolderIdInput.value.trim();
  const resultFiles = state.results.filter((result) => result.rows.length > 0);
  const rows = flattenRows();

  if (!rows.length) {
    setSheetStatus("There are no extracted rows to write.", "error");
    return;
  }

  if (!spreadsheetId || !range) {
    setSheetStatus("Enter both Spreadsheet ID and range before writing.", "error");
    return;
  }

  let taskRequest = null;
  let taskPatients = [];

  try {
    taskRequest = buildTaskRequest();
    taskPatients = taskRequest ? collectPatientsForTasks(resultFiles) : [];

    if (taskRequest && !taskPatients.length) {
      throw new Error(
        "No exact patient names were extracted from the uploaded PDFs, so no NextAgency task can be created."
      );
    }
  } catch (error) {
    setSheetStatus(
      error instanceof Error ? error.message : "Task setup is incomplete.",
      "error"
    );
    return;
  }

  state.isWriting = true;
  updateActionState();
  setSheetStatus("Uploading original PDFs to Google Drive...", "");

  try {
    for (const result of resultFiles) {
      if (!result.file) {
        throw new Error(
          `Missing original file for ${result.fileName}. Re-upload the PDF and try again.`
        );
      }

      if (!result.sourceLink) {
        const uploadPayload = await uploadOriginalPdfToDrive(result.file, driveFolderId);
        result.sourceLink = uploadPayload.webViewLink;
        result.rows = result.rows.map((row) => ({
          ...row,
          source: uploadPayload.webViewLink
        }));
      }
    }

    setSheetStatus("Writing exact rows to Google Sheets...", "");
    const sheetResponse = await fetch("/api/google-sheets/append", {
      body: JSON.stringify({
        range,
        rows: flattenRows(),
        spreadsheetId
      }),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });

    const sheetPayload = await sheetResponse.json();
    if (!sheetResponse.ok) {
      throw new Error(sheetPayload.error || "Google Sheets write failed.");
    }

    let taskPayload = null;
    if (taskRequest) {
      setSheetStatus("Creating NextAgency tasks...", "");
      taskPayload = await createNextAgencyTasks(taskRequest, taskPatients);
    }

    const updatedRows = Number(sheetPayload.updatedRows || 0);
    setSheetStatus(
      buildCompletionMessage({
        resultFiles,
        taskPayload,
        updatedRows
      }),
      taskPayload && !taskPayload.ok ? "" : "success"
    );
    render();
  } catch (error) {
    setSheetStatus(
      error instanceof Error ? error.message : "Google Sheets write failed.",
      "error"
    );
  } finally {
    state.isWriting = false;
    updateActionState();
  }
}

async function createNextAgencyTasks(taskRequest, taskPatients) {
  const response = await fetch("/api/nextagency/tasks", {
    body: JSON.stringify({
      dueDate: taskRequest.dueDate,
      patients: taskPatients,
      title: taskRequest.title
    }),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "NextAgency task creation failed.");
  }

  return payload;
}

function buildCompletionMessage({ resultFiles, taskPayload, updatedRows }) {
  const pieces = [
    `Uploaded ${resultFiles.length} PDF${resultFiles.length === 1 ? "" : "s"} to Drive`,
    `wrote ${updatedRows} row${updatedRows === 1 ? "" : "s"} to Google Sheets`
  ];

  if (!taskPayload) {
    return `${pieces.join(", and ")}.`;
  }

  pieces.push(
    `created ${Number(taskPayload.createdCount || 0)} NextAgency task${
      Number(taskPayload.createdCount || 0) === 1 ? "" : "s"
    }`
  );

  const notes = [];
  if (taskPayload.unmatchedPatients?.length) {
    notes.push(
      `no exact case match for ${taskPayload.unmatchedPatients
        .map((patient) => patient.patientName)
        .join(", ")}`
    );
  }
  if (taskPayload.ambiguousPatients?.length) {
    notes.push(
      `multiple cases matched ${taskPayload.ambiguousPatients
        .map((patient) => patient.patientName)
        .join(", ")}`
    );
  }
  if (taskPayload.erroredPatients?.length) {
    notes.push(
      `task creation failed for ${taskPayload.erroredPatients
        .map((patient) => patient.patientName)
        .join(", ")}`
    );
  }

  return notes.length
    ? `${pieces.join(", and ")}. Note: ${notes.join("; ")}.`
    : `${pieces.join(", and ")}.`;
}

function flattenRows() {
  return state.results.flatMap((result) => result.rows);
}

function render() {
  const rows = flattenRows();
  const hasResults = state.results.length > 0;

  dom.emptyState.classList.toggle("hidden", hasResults);
  dom.summaryCard.classList.toggle("hidden", !hasResults);
  dom.copyButton.disabled = !hasResults;
  dom.summaryFileCount.textContent = String(state.results.length);
  dom.summaryRowCount.textContent = String(rows.length);

  dom.previewTableBody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.replaceChildren(
        ...SHEET_COLUMNS.map((column) => {
          const td = document.createElement("td");
          if (column.key === "source" && row.source) {
            const link = document.createElement("a");
            link.href = row.source;
            link.target = "_blank";
            link.rel = "noreferrer";
            link.textContent = "Drive file";
            td.append(link);
          } else {
            td.textContent = row[column.key] || "";
          }
          return td;
        })
      );
      return tr;
    })
  );

  dom.resultsList.replaceChildren(
    ...state.results.map((result) => {
      const card = document.createElement("article");
      card.className = "result-card";

      const notes = result.notes.length
        ? `<p class="result-notes">${escapeHtml(result.notes.join(" "))}</p>`
        : "";
      const patientName = (result.patient?.fullName || "").trim() || "No patient name found";

      card.innerHTML = `
        <h3>${escapeHtml(result.fileName)}</h3>
        <p class="result-meta">${formatFileSize(result.fileSize)}</p>
        <div class="data-grid">
          <div>
            <span class="eyebrow">Patient</span>
            <strong>${escapeHtml(patientName)}</strong>
          </div>
          <div>
            <span class="eyebrow">Exact rows found</span>
            <strong>${result.rows.length}</strong>
          </div>
          <div>
            <span class="eyebrow">Drive upload</span>
            <strong>${escapeHtml(result.sourceLink ? "Ready" : "Pending")}</strong>
          </div>
        </div>
        <p class="result-notes">${escapeHtml(buildPreviewText(result.rows))}</p>
        ${notes}
      `;

      return card;
    })
  );

  updateActionState();
  syncPageFromHash();
}

function buildPreviewText(rows) {
  if (!rows.length) {
    return "No medication rows found";
  }

  return rows
    .map((row) => [row.med, row.dosage].filter(Boolean).join(" "))
    .join(" | ");
}

function updateActionState() {
  const hasRows = flattenRows().length > 0;
  const hasTarget = Boolean(
    dom.spreadsheetIdInput.value.trim() && dom.sheetRangeInput.value.trim()
  );
  const hasCredentials = Boolean(state.serverConfig?.hasGoogleCredentials);
  dom.appendButton.disabled = !hasRows || !hasTarget || !hasCredentials || state.isWriting;
  dom.saveSettingsButton.disabled = state.isSavingSettings;

  updateSummaryBadge(dom.navConfigBadge, state.serverConfig);
  updateConfigBadge(
    dom.configBadge,
    Boolean(state.serverConfig?.hasGoogleCredentials),
    "Google ready",
    "Missing Google credentials"
  );
  updateConfigBadge(
    dom.nextAgencyBadge,
    Boolean(state.serverConfig?.hasNextAgencyConfigured),
    "NextAgency ready",
    "NextAgency setup needed"
  );
}

function updateSummaryBadge(element, config) {
  const label = config?.configLabel || "Setup needed";
  element.textContent = label;
  element.classList.toggle("is-ready", label !== "Setup needed");
  element.classList.toggle("is-missing", label === "Setup needed");
}

function updateConfigBadge(element, isReady, readyText, missingText) {
  element.textContent = isReady ? readyText : missingText;
  element.classList.toggle("is-ready", isReady);
  element.classList.toggle("is-missing", !isReady);
}

async function uploadOriginalPdfToDrive(file, driveFolderId) {
  const response = await fetch("/api/google-drive/upload", {
    body: file,
    headers: {
      "Content-Type": file.type || "application/pdf",
      "x-drive-folder-id": driveFolderId,
      "x-file-name": encodeURIComponent(file.name)
    },
    method: "POST"
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Drive upload failed for ${file.name}.`);
  }

  return payload;
}

function setSheetStatus(message, tone) {
  setToneMessage(dom.sheetStatus, message, tone);
}

function setSettingsStatus(message, tone) {
  setToneMessage(dom.settingsStatus, message, tone);
}

function setToneMessage(element, message, tone) {
  element.textContent = message;
  element.classList.toggle("is-error", tone === "error");
  element.classList.toggle("is-success", tone === "success");
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Unknown size";
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
