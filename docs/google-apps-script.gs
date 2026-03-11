/*
  GHMX Judge Intake Endpoint
  1) Create a Google Sheet.
  2) Open Extensions -> Apps Script.
  3) Paste this file and set SPREADSHEET_ID.
  4) Deploy as Web app (Anyone).
*/

const SPREADSHEET_ID = "PASTE_YOUR_SHEET_ID_HERE";
const SHEET_NAME = "Judge Scores";

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const sheet = getSheet_();
    ensureHeader_(sheet);

    sheet.appendRow([
      new Date(),
      payload.judgeUsername || "",
      payload.judgeCompany || "",
      payload.entrantId || "",
      payload.modelTitle || "",
      payload.category || "",
      payload.craftsmanship || "",
      payload.presentation || "",
      payload.difficulty || "",
      payload.themeFit || "",
      payload.totalScore || "",
      payload.comments || "",
      payload.timestamp || "",
    ]);

    return ContentService.createTextOutput(
      JSON.stringify({ ok: true })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(error) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() > 0) {
    return;
  }

  sheet.appendRow([
    "createdAt",
    "judgeUsername",
    "judgeCompany",
    "entrantId",
    "modelTitle",
    "category",
    "craftsmanship",
    "presentation",
    "difficulty",
    "themeFit",
    "totalScore",
    "comments",
    "clientTimestamp",
  ]);
}

function parsePayload_(e) {
  const body = (e && e.postData && e.postData.contents) || "";
  const pairs = body.split("&").filter(Boolean);
  const payload = {};

  pairs.forEach(function (pair) {
    const index = pair.indexOf("=");
    if (index === -1) {
      return;
    }
    const key = decodeURIComponent(pair.substring(0, index));
    const value = decodeURIComponent(pair.substring(index + 1).replace(/\+/g, " "));
    payload[key] = value;
  });

  return payload;
}
