const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const appPassword = process.env.APP_PASSWORD || "";
const sessionSecret = process.env.SESSION_SECRET || appPassword || "local-dev-secret";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5";
const examplesPath = path.join(root, "examples", "reports.md");

function send(res, status, body, type = "application/json; charset=utf-8") {
  const headers = { "Content-Type": type };
  res.writeHead(status, headers);
  res.end(Buffer.isBuffer(body) || !type.includes("json") ? body : JSON.stringify(body));
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extraHeaders });
  res.end(JSON.stringify(body));
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  return origin ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin"
  } : {};
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret).update(value).digest("base64url");
}

function makeSessionToken() {
  const payload = JSON.stringify({ iat: Date.now(), nonce: crypto.randomBytes(12).toString("base64url") });
  const encoded = base64url(payload);
  return `${encoded}.${sign(encoded)}`;
}

function timingSafeEqualString(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "")
    .split(";")
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const index = part.indexOf("=");
      return index >= 0 ? [part.slice(0, index), decodeURIComponent(part.slice(index + 1))] : [part, ""];
    }));
}

function isAuthenticated(req) {
  if (!appPassword) return true;
  const token = parseCookies(req).sga_session || "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  return timingSafeEqualString(signature, sign(payload));
}

function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  sendJson(res, 401, { error: "Bitte zuerst anmelden." });
  return false;
}

async function handleLogin(req, res) {
  if (!appPassword) return sendJson(res, 200, { ok: true, passwordRequired: false });
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    if (!timingSafeEqualString(body.password || "", appPassword)) {
      return sendJson(res, 401, { error: "Das Passwort stimmt nicht." });
    }
    const secure = req.headers["x-forwarded-proto"] === "https" ? "; Secure" : "";
    sendJson(res, 200, { ok: true }, {
      "Set-Cookie": `sga_session=${encodeURIComponent(makeSessionToken())}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`
    });
  } catch (error) {
    sendJson(res, 400, { error: "Anmeldung fehlgeschlagen." });
  }
}

function handleSession(req, res) {
  sendJson(res, 200, { authenticated: isAuthenticated(req), passwordRequired: Boolean(appPassword), openaiEnabled: Boolean(openaiApiKey) }, corsHeaders(req));
}

function handleLogout(req, res) {
  sendJson(res, 200, { ok: true }, {
    "Set-Cookie": "sga_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
  });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&ndash;/g, "-")
    .replace(/&mdash;/g, "-")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([a-f0-9]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanText(html) {
  return decodeHtml(html)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<div[^>]*style="[^"]*display\s*:\s*none[^"]*"[\s\S]*?(?=<\/td>|<\/tr>)/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h1|h2|h3|li|table)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTags(html) {
  return cleanText(html).replace(/\s+/g, " ").trim();
}

function absoluteUrl(base, href) {
  return new URL(decodeHtml(href), base).toString();
}

function parseDateTime(value) {
  const match = String(value || "").match(/(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if (!match) return null;
  const [, dd, mm, yyyy, hh = "00", min = "00"] = match;
  return {
    date: `${yyyy}-${mm}-${dd}`,
    time: `${hh}:${min}`,
    label: `${dd}.${mm}.${yyyy}${hh ? ` ${hh}:${min}` : ""}`,
    sort: `${yyyy}-${mm}-${dd}T${hh}:${min}:00`
  };
}

function inRange(date, from, to) {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function extractCells(rowHtml) {
  return [...rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(match => ({
    html: match[1],
    text: stripTags(match[1])
  }));
}

function parseReports(html, baseUrl, from, to) {
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);
  const reports = [];
  let lastDateTime = null;

  for (const row of rows) {
    if (!/meetingReport/i.test(row)) continue;

    const hrefMatch = row.match(/<a\b[^>]*href="([^"]*meetingReport[^"]*)"[^>]*>/i);
    if (!hrefMatch) continue;

    const cells = extractCells(row);
    const dateCell = cells.find(cell => parseDateTime(cell.text));
    const currentDateTime = dateCell ? parseDateTime(dateCell.text) : lastDateTime;
    if (dateCell) lastDateTime = currentDateTime;
    if (!inRange(currentDateTime && currentDateTime.date, from, to)) continue;

    const linkIndex = cells.findIndex(cell => /meetingReport/i.test(cell.html));
    const beforeLink = linkIndex >= 0 ? cells.slice(0, linkIndex) : cells;
    const leagueIndex = beforeLink.findIndex(cell => /(^|\s)([DHU]\d{0,2}|Damen|Herren|Gemischt|Junior|Juniorinnen)/i.test(cell.text));
    const league = leagueIndex >= 0 ? beforeLink[leagueIndex].text : "";
    const home = leagueIndex >= 0 ? beforeLink[leagueIndex + 1]?.text || "" : "";
    const guest = leagueIndex >= 0 ? beforeLink[leagueIndex + 2]?.text || "" : "";
    const result = leagueIndex >= 0 ? beforeLink[leagueIndex + 3]?.text || "" : "";
    const sets = leagueIndex >= 0 ? beforeLink[leagueIndex + 4]?.text || "" : "";
    const games = leagueIndex >= 0 ? beforeLink[leagueIndex + 5]?.text || "" : "";
    const url = absoluteUrl(baseUrl, hrefMatch[1]);
    const id = new URL(url).searchParams.get("meeting") || url;

    reports.push({
      id,
      date: currentDateTime?.date || "",
      time: currentDateTime?.time || "",
      dateLabel: currentDateTime?.label || "",
      league,
      home,
      guest,
      result,
      sets,
      games,
      url,
      label: [currentDateTime?.label, league, home && guest ? `${home} - ${guest}` : "", result].filter(Boolean).join(" | ")
    });
  }

  const byId = new Map();
  for (const report of reports) byId.set(report.id, report);
  return [...byId.values()].sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)));
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 SGA-Spieltagsbericht-Assistent",
      "Accept": "text/html,application/xhtml+xml"
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`nuLiga antwortet mit HTTP ${response.status}`);
  return text;
}

async function handleDiscover(req, res, url) {
  const sourceUrl = url.searchParams.get("url");
  const from = url.searchParams.get("from") || "";
  const to = url.searchParams.get("to") || "";
  if (!sourceUrl) return send(res, 400, { error: "Bitte einen nuLiga-Begegnungslink angeben." });

  try {
    const html = await fetchText(sourceUrl);
    const reports = parseReports(html, sourceUrl, from, to);
    send(res, 200, { reports });
  } catch (error) {
    send(res, 502, { error: error.message || "nuLiga konnte nicht geladen werden." });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 6_000_000) {
        req.destroy();
        reject(new Error("Die Anfrage ist zu groß."));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readExamples() {
  try {
    const text = fs.readFileSync(examplesPath, "utf8").trim();
    return text && !text.includes("Beispielberichte hier einfügen") ? text : "";
  } catch {
    return "";
  }
}

function extractOpenAIText(payload) {
  if (typeof payload.output_text === "string") return payload.output_text;
  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) parts.push(content.text);
      if (content.type === "text" && content.text) parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function handleGenerate(req, res) {
  if (!openaiApiKey) {
    return sendJson(res, 501, { error: "OpenAI ist noch nicht eingerichtet. Bitte OPENAI_API_KEY in Render setzen." });
  }

  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return sendJson(res, 400, { error: "Es gibt noch keinen Prompt zum Ausführen." });

    const examples = readExamples();
    const instructions = [
      "Du bist der digitale Pressesprecher der SG Arheilgen Tennis.",
      "Erstelle verlässliche, veröffentlichungsreife Texte aus den bereitgestellten nuLiga-Rohdaten.",
      "Erfinde keine Ergebnisse, Namen, Tabellenlagen oder Termine.",
      "Wenn Informationen fehlen oder unsicher sind, kennzeichne sie kurz zur Prüfung.",
      examples ? `Nutze diese bisherigen Berichte nur als Stilreferenz, nicht als aktuelle Fakten:\n\n${examples}` : ""
    ].filter(Boolean).join("\n\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: openaiModel,
        instructions,
        input: prompt,
        store: true
      })
    });
    const payload = await response.json();
    if (!response.ok) {
      const message = payload.error?.message || `OpenAI antwortet mit HTTP ${response.status}`;
      return sendJson(res, response.status, { error: message });
    }

    sendJson(res, 200, { text: extractOpenAIText(payload), responseId: payload.id, model: openaiModel });
  } catch (error) {
    sendJson(res, 502, { error: error.message || "OpenAI konnte den Bericht nicht erstellen." });
  }
}

async function handleDownload(req, res) {
  try {
    const body = JSON.parse(await readBody(req) || "{}");
    const reports = Array.isArray(body.reports) ? body.reports.slice(0, 80) : [];
    if (!reports.length) return send(res, 400, { error: "Bitte mindestens einen Spielbericht auswählen." });

    const downloaded = [];
    for (const report of reports) {
      const html = await fetchText(report.url);
      const starts = ['<div id="content-row1">', '<h1>', '<table class="result-set"']
        .map(marker => html.indexOf(marker))
        .filter(index => index >= 0);
      const contentStart = starts.length ? Math.min(...starts) : -1;
      const contentEnd = html.indexOf('<div id="footer">');
      const content = contentStart >= 0 ? html.slice(contentStart, contentEnd > contentStart ? contentEnd : undefined) : html;
      const text = cleanText(content)
        .replace(/\nFür den Inhalt verantwortlich:[\s\S]*$/i, "")
        .replace(/\n&copy;[\s\S]*$/i, "")
        .trim();
      downloaded.push({
        ...report,
        text: `### ${report.label || report.url}\nQuelle: ${report.url}\n\n${text}`
      });
    }

    send(res, 200, {
      text: downloaded.map(report => report.text).join("\n\n---\n\n"),
      reports: downloaded
    });
  } catch (error) {
    send(res, 502, { error: error.message || "Spielberichte konnten nicht geladen werden." });
  }
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/sga_spieltagsbericht_assistent.html";
  const file = path.join(root, pathname);
  if (!file.startsWith(root)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");

  fs.readFile(file, (error, data) => {
    if (error) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    const type = file.endsWith(".html")
      ? "text/html; charset=utf-8"
      : file.endsWith(".ics")
        ? "text/calendar; charset=utf-8"
        : "application/octet-stream";
    send(res, 200, data, type);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  if (url.pathname.startsWith("/api/") && req.headers.origin) {
    for (const [key, value] of Object.entries(corsHeaders(req))) res.setHeader(key, value);
  }
  if (req.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    res.writeHead(204, corsHeaders(req));
    return res.end();
  }
  if (req.method === "GET" && url.pathname === "/api/session") return handleSession(req, res);
  if (req.method === "POST" && url.pathname === "/api/login") return handleLogin(req, res);
  if (req.method === "POST" && url.pathname === "/api/logout") return handleLogout(req, res);
  if (url.pathname.startsWith("/api/") && !requireAuth(req, res)) return;
  if (req.method === "GET" && url.pathname === "/api/reports") return handleDiscover(req, res, url);
  if (req.method === "POST" && url.pathname === "/api/download") return handleDownload(req, res);
  if (req.method === "POST" && url.pathname === "/api/generate") return handleGenerate(req, res);
  if (req.method === "GET") return serveStatic(req, res, url);
  send(res, 405, { error: "Methode nicht unterstützt." });
});

server.listen(port, host, () => {
  console.log(`http://${host}:${port}`);
});
