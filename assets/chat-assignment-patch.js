(function () {
  const romanMap = { i: "1", ii: "2", iii: "3", iv: "4", v: "5" };

  function norm(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\bhe\s*(\d{2})\s*(iii|ii|iv|v|i)\b/g, (_, age, roman) => `h${age}${romanMap[roman] || roman}`)
      .replace(/\bda\s*(\d{2})\s*(iii|ii|iv|v|i)\b/g, (_, age, roman) => `d${age}${romanMap[roman] || roman}`)
      .replace(/([a-z]+|[dh])\s*(\d{2})\s*(iii|ii|iv|v|i)\b/g, (_, prefix, age, roman) => `${prefix}${age}${romanMap[roman] || roman}`)
      .replace(/\b(i{1,3}|iv|v)\b/g, match => romanMap[match] || match)
      .replace(/u\s*8\s*\+/g, "u8+")
      .replace(/\bhe\s*(\d{2})/g, "h$1")
      .replace(/\bda\s*(\d{2})/g, "d$1")
      .replace(/([dh])\s*(\d{2})/g, "$1$2")
      .replace(/[^a-z0-9+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compact(value) {
    return norm(value).replace(/\s+/g, "");
  }

  function escape(value) {
    return typeof escapeHtml === "function"
      ? escapeHtml(value)
      : String(value || "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function reportKeySafe(report, index = -1) {
    if (!report) return "";
    if (typeof reportKey === "function") return reportKey(report, index);
    return String(report.id || report.url || report.sourceUrl || `report-${index}`);
  }

  function reportLabelSafe(report) {
    if (!report) return "Partie auswählen";
    return `${report.dateLabel || "Ohne Datum"} · ${report.league || "Spielbericht"} · ${report.home || "Heimteam"} - ${report.guest || "Gastteam"}${report.result ? ` · ${report.result}` : ""}`;
  }

  function reportDateValue(report) {
    if (report?.date) return report.date;
    const match = String(report?.dateLabel || "").match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!match) return "";
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  function messageDateValue(message) {
    if (message?.created) {
      const created = new Date(message.created);
      if (!Number.isNaN(created.getTime())) {
        const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(created);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
      }
    }
    const match = String(message?.text || message || "").match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
    if (!match) return "";
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  function allReportOptions(message) {
    const maxDate = messageDateValue(message);
    return Array.isArray(state.reports)
      ? state.reports
        .filter(report => !maxDate || !reportDateValue(report) || reportDateValue(report) <= maxDate)
        .map((report, index) => ({ report, key: reportKeySafe(report, index), label: reportLabelSafe(report) }))
      : [];
  }

  function isYouthReport(report) {
    return /(^|[^A-Z0-9])(D12|D15|D18|H12|H15|H18|U8\+|U10)(?=$|[^A-Z0-9])/i.test(`${report.league || ""} ${report.home || ""} ${report.guest || ""}`);
  }

  function sgaSuffix(report) {
    const sgaTeam = [report.home, report.guest].find(team => /sg\s*arheilgen/i.test(team || "")) || "";
    const suffix = norm(sgaTeam).match(/\b([1-5])\b/);
    return suffix ? suffix[1] : (sgaTeam ? "1" : "");
  }

  function teamInfo(report) {
    const full = norm(`${report.league || ""} ${report.home || ""} ${report.guest || ""}`);
    const female = /\b(damen|juniorinnen)\b/.test(full) || /\bd(?:00|10|12|15|18|30|40|50|55|60|65|70|75)\b/.test(full);
    const male = /\b(herren|junioren)\b/.test(full) || /\bh(?:00|10|12|15|18|30|40|50|55|60|65|70|75)\b/.test(full);
    const youth = isYouthReport(report) || /\b(juniorinnen|junioren|u8\+|u10|u12|u15|u18|d12|d15|d18|h12|h15|h18)\b/.test(full);
    const ageMatch = full.match(/\b(?:u|d|h)?(8\+|10|12|15|18|30|40|50|55|60|65|70|75)\b/);
    return { full, female, male, youth, age: ageMatch ? ageMatch[1] : "", suffix: sgaSuffix(report) };
  }

  function levelAliases(league) {
    const value = norm(league);
    const aliases = [];
    if (/\brswl\b|\brlsw\b|regionalliga/.test(value)) aliases.push("Regionalliga", "Regionalliga Südwest", "Südwestliga", "Südwest-Liga", "Suedwest Liga", "RSWL");
    if (/\bswl\b|\bsuedwest\b|\bsudwest\b|südwest/.test(value)) aliases.push("Südwestliga", "Südwest-Liga", "Suedwest Liga", "SWL");
    if (/\bhl\b|hessenliga/.test(value)) aliases.push("Hessenliga");
    if (/\bvl\b|verbandsliga/.test(value)) aliases.push("Verbandsliga");
    if (/\bgl\b|gruppenliga/.test(value)) aliases.push("Gruppenliga");
    if (/\bkol\b|kreisoberliga/.test(value)) aliases.push("Kreisoberliga");
    if (/\bka\b|kreisliga a/.test(value)) aliases.push("Kreisliga A");
    if (/\bkb\b|kreisliga b/.test(value)) aliases.push("Kreisliga B");
    return aliases;
  }

  function addCandidate(list, value, weight) {
    const normalized = norm(value);
    if (normalized.length >= 2) list.push({ value: normalized, compact: compact(normalized), weight });
  }

  window.chatReportCandidates = function chatReportCandidatesPatched(report) {
    const info = teamInfo(report);
    const list = [];
    addCandidate(list, report.league || "", 70);
    levelAliases(report.league || "").forEach(level => addCandidate(list, level, 55));
    const words = [];
    const letters = [];
    if (info.female) {
      words.push(info.youth ? "Juniorinnen" : "Damen", "Damen");
      letters.push("D");
    }
    if (info.male) {
      words.push(info.youth ? "Junioren" : "Herren", "Herren");
      letters.push("H");
    }
    if (info.age) {
      [...new Set(words)].forEach(word => {
        addCandidate(list, `${word} ${info.age}`, 95);
        addCandidate(list, `${word}${info.age}`, 95);
        levelAliases(report.league || "").forEach(level => {
          addCandidate(list, `${word} ${info.age} ${level}`, 175);
          addCandidate(list, `${word}${info.age} ${level}`, 175);
        });
        if (info.suffix) {
          addCandidate(list, `${word} ${info.age} ${info.suffix}`, 125);
          addCandidate(list, `${word}${info.age}${info.suffix}`, 125);
        }
      });
      [...new Set(letters)].forEach(letter => {
        addCandidate(list, `${letter}${info.age}`, 100);
        if (letter === "H") addCandidate(list, `HE${info.age}`, 100);
        if (letter === "D") addCandidate(list, `DA${info.age}`, 100);
        if (info.suffix) addCandidate(list, `${letter}${info.age}${info.suffix}`, 130);
      });
      if (info.youth || /^8\+|10|12|15|18$/.test(info.age)) addCandidate(list, `U${info.age}`, 95);
    }
    if (info.suffix) {
      addCandidate(list, `${report.league || ""} ${info.suffix}`, 105);
      addCandidate(list, `${report.league || ""}-${info.suffix}`, 105);
    }
    const unique = new Map();
    list.forEach(candidate => {
      const key = `${candidate.value}|${candidate.compact}`;
      if (!unique.has(key) || unique.get(key).weight < candidate.weight) unique.set(key, candidate);
    });
    return [...unique.values()];
  };

  function candidateMatches(candidate, text) {
    const normalized = norm(text);
    const dense = compact(text);
    const escaped = candidate.value.replace(/\+/g, "\\+");
    if (new RegExp(`(^| )${escaped}( |$)`).test(normalized)) return true;
    if (candidate.compact && candidate.compact.length >= 3) {
      return new RegExp(`(^|[^a-z0-9])${candidate.compact.replace(/\+/g, "\\+")}([^a-z0-9]|$)`).test(dense);
    }
    return false;
  }

  function scoreReport(text, report) {
    return window.chatReportCandidates(report)
      .filter(candidate => candidateMatches(candidate, text))
      .reduce((sum, candidate) => sum + candidate.weight, 0);
  }

  function rankedReports(text) {
    if (!Array.isArray(state.reports)) return [];
    return state.reports
      .map((report, index) => ({ report, index, score: scoreReport(text, report) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  window.matchingReportsForChatMessage = function matchingReportsForChatMessagePatched(text) {
    const ranked = rankedReports(text);
    if (!ranked.length) return [];
    return ranked.filter(item => item.score === ranked[0].score).map(item => item.report);
  };

  function reportByKey(key) {
    return Array.isArray(state.reports) ? state.reports.find((report, index) => reportKeySafe(report, index) === key) : null;
  }

  window.enrichChatMessage = function enrichChatMessagePatched(message, index) {
    const text = String(message.text || message || "").trim();
    const manual = reportByKey(message.manualReportKey);
    if (manual) {
      return { ...message, id: message.id || `chat-${Date.now()}-${index}`, text, selected: message.manualSelected ? Boolean(message.selected) : true, manualSelected: true, manualReportKey: reportKeySafe(manual), assignmentStatus: "good", assignmentLabel: `Manuell zugeordnet: ${reportLabelSafe(manual)}` };
    }
    let matches = window.matchingReportsForChatMessage(text);
    const selectedMatches = matches.filter(report => report.selected);
    if (matches.length > 1 && selectedMatches.length === 1) matches = selectedMatches;
    if (matches.length === 1) {
      const report = matches[0];
      return { ...message, id: message.id || `chat-${Date.now()}-${index}`, text, selected: message.manualSelected ? Boolean(message.selected) : Boolean(report.selected), manualSelected: Boolean(message.manualSelected), manualReportKey: message.manualReportKey || "", assignmentStatus: report.selected ? "good" : "unselected", assignmentLabel: `${report.league || "Spielbericht"} · ${report.home || "SGA"} - ${report.guest || "Gegner"}`, possibleReportKeys: [reportKeySafe(report)] };
    }
    const possibleReports = matches.length > 1 ? matches : rankedReports(text).slice(0, 6).map(item => item.report);
    return { ...message, id: message.id || `chat-${Date.now()}-${index}`, text, selected: message.manualSelected ? Boolean(message.selected) : false, manualSelected: Boolean(message.manualSelected), manualReportKey: message.manualReportKey || "", assignmentStatus: "unclear", assignmentLabel: matches.length > 1 ? "Mehrere mögliche Mannschaften gefunden" : "Keine eindeutige Mannschaft gefunden", possibleReportKeys: possibleReports.map(report => reportKeySafe(report)) };
  };

  function ensureStyles() {
    if (document.getElementById("sga-section-review-styles")) return;
    const style = document.createElement("style");
    style.id = "sga-section-review-styles";
    style.textContent = `
      .chat-assignment-select{appearance:none;width:100%;margin-top:10px;padding:9px 12px;border:1px solid rgba(20,163,218,.35);border-radius:8px;background:#eef9fd;color:#12394a;font:inherit}
      .chat-assignment-hint{display:block;margin-top:8px;color:#3c6474;font-size:.88rem}
      .section-review-hidden{display:none!important}
      .section-review-workflow{margin-top:20px;border:1px solid #dbe3ed;border-radius:8px;background:#fff;padding:18px}
      .section-review-help{color:#64748b;margin-bottom:0}
      .section-review-summary{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
      .section-review-list{display:grid;gap:14px;margin-top:16px}
      .section-review-card{border:1px solid #dbe3ed;border-radius:8px;background:#f8fafc;padding:14px}
      .section-review-card.accepted{border-color:#86efac;background:#ecfdf5}
      .section-review-card.excluded{border-color:#fecaca;background:#fef2f2;opacity:.82}
      .section-review-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:14px}
      .section-review-editor{width:100%;min-height:150px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:12px}
      .section-review-note{min-height:70px;margin-top:8px}
      .section-source-box{border:1px solid #dbe3ed;border-radius:8px;background:#fff;padding:12px}
      .section-source-box h5{margin:0 0 8px;font-size:13px}.source-table-wrap{overflow-x:auto}
      .source-table{width:100%;border-collapse:collapse;font-size:13px}.source-table th,.source-table td{border-bottom:1px solid #e2e8f0;padding:7px 8px;text-align:left;vertical-align:top}.source-table th{color:#475569;background:#f1f5f9;font-weight:800}
      .source-detail{margin-top:8px}.source-detail summary{cursor:pointer;color:#075985;font-weight:800}.source-detail pre,.chat-source{white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;padding:10px;max-height:220px;overflow:auto;font-size:12px}
      @media(max-width:820px){.section-review-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function renderChatMessagesPatched() {
    ensureStyles();
    els.applyChatMessages.disabled = !state.chatMessages.some(message => message.selected);
    els.selectAllChatMessages.disabled = !state.chatMessages.length;
    if (!state.chatMessages.length) {
      els.chatMessageList.innerHTML = "";
      return;
    }
    els.chatMessageList.innerHTML = state.chatMessages.map((message, index) => {
      const options = message.assignmentStatus === "unclear" ? allReportOptions(message) : [];
      const selectHtml = options.length ? `<span class="chat-assignment-hint">${message.assignmentLabel?.includes("Mehrere") ? "Bitte eine der möglichen Partien auswählen:" : "Bitte die passende Partie auswählen:"}</span><select class="chat-assignment-select" data-chat-assign-index="${index}"><option value="">Noch nicht zugeordnet</option>${options.map(option => `<option value="${escape(option.key)}" ${message.manualReportKey === option.key ? "selected" : ""}>${escape(option.label)}</option>`).join("")}</select>` : "";
      return `<label class="report-card ${message.assignmentStatus === "good" ? "chat-good" : message.assignmentStatus === "unclear" ? "chat-warn" : "chat-muted"}"><input type="checkbox" data-chat-index="${index}" ${message.selected ? "checked" : ""}><span><span class="report-title">Nachricht ${index + 1}</span><span class="report-meta">${escape(message.assignmentLabel || "")}</span><span class="report-meta">${escape(message.text)}</span>${selectHtml}</span></label>`;
    }).join("");
    els.chatMessageList.querySelectorAll("input[type='checkbox']").forEach(input => {
      input.addEventListener("change", event => {
        const index = Number(event.target.dataset.chatIndex);
        state.chatMessages[index].selected = event.target.checked;
        state.chatMessages[index].manualSelected = true;
        save();
        window.renderChatMessages();
      });
    });
    els.chatMessageList.querySelectorAll(".chat-assignment-select").forEach(select => {
      select.addEventListener("click", event => event.stopPropagation());
      select.addEventListener("change", event => {
        const index = Number(event.target.dataset.chatAssignIndex);
        state.chatMessages[index].manualReportKey = event.target.value;
        state.chatMessages[index].manualSelected = Boolean(event.target.value);
        if (event.target.value) state.chatMessages[index].selected = true;
        state.chatMessages[index] = window.enrichChatMessage(state.chatMessages[index], index);
        save();
        window.renderChatMessages();
      });
    });
  }

  window.renderChatMessages = renderChatMessagesPatched;
  window.refreshChatAssignments = function refreshChatAssignmentsPatched() {
    if (!state.chatMessages.length) return;
    state.chatMessages = state.chatMessages.map((message, index) => window.enrichChatMessage(message, index)).filter(message => message.text);
    window.renderChatMessages();
    save();
  };

  function patchPrintFormat() {
    if (window.__sgaPrintFormatPatched || typeof buildPrompt !== "function") return;
    const originalBuildPrompt = buildPrompt;
    buildPrompt = function buildPromptWithPrintFormat() {
      const prompt = originalBuildPrompt();
      const marker = "Standardformat für Printmedien nach APO 18.05.2026";
      if (prompt.includes(marker)) return prompt;
      const rules = `${marker}:
- Nutze für jeden Print-Bericht genau den Aufbau der Datei "APO 18.05.2026 SGA Tennis Aktive Senioren".
- Optional zuerst eine kurze Bild-/Kontextzeile, danach eine fett gesetzte Überschrift, danach ein kurzer Lead-Absatz.
- Danach pro Mannschaft genau ein eigener Fließtext-Absatz. Am Absatzanfang steht "Mannschaft - Liga:" fett, danach läuft der Text normal weiter.
- Falls Vorschau-Daten vorhanden sind: letzter Absatz im Format "Vorschau:" fett am Anfang, danach normaler Fließtext direkt dahinter.
- Keine separaten Zwischenüberschriften, keine Listen, keine Stichpunkte und keine Tabellen im Print-Bericht.
- Nur Überschrift, "Mannschaft - Liga:" und "Vorschau:" fett setzen. Spielernamen, Ergebnisse und restlicher Text bleiben normal.
`;
      return prompt.replace(/\nKontrolle vor Ausgabe:/, `\n${rules}\nKontrolle vor Ausgabe:`);
    };
    window.__sgaPrintFormatPatched = true;
  }

  function cleanLabel(value) {
    return String(value || "").replace(/\*\*/g, "").replace(/:+$/g, "").replace(/\s+/g, " ").trim();
  }

  function rawTextFor(report) {
    if (!report?.url || !state.copiedData) return "";
    return String(state.copiedData).split(/\n---\n/g).find(block => block.includes(report.url)) || "";
  }

  function sourceReportsFor(section) {
    const reports = (state.reports || []).filter(report => report.selected);
    const base = reports.length ? reports : (state.reports || []);
    const scored = base.map((report, index) => ({ report, index, score: scoreReport(`${section.label} ${section.text}`, report) })).sort((a, b) => b.score - a.score);
    const matched = scored.filter(item => item.score > 0);
    return (matched.length ? matched : scored.slice(0, 5)).slice(0, 6);
  }

  function chatFor(section, sources) {
    const keys = new Set(sources.map(item => reportKeySafe(item.report, item.index)));
    const tokens = norm(section.label).split(" ").filter(token => token.length > 2);
    return (state.chatMessages || []).filter(message => message.selected).filter(message => {
      if (message.manualReportKey && keys.has(message.manualReportKey)) return true;
      if ((message.possibleReportKeys || []).some(key => keys.has(key))) return true;
      const text = norm(message.text);
      return tokens.length && tokens.some(token => text.includes(token));
    }).slice(0, 4);
  }

  function parseSections(text) {
    const paragraphs = String(text || "").replace(/\r/g, "").split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
    const teamRe = /^(?:\*\*)?\s*([^*\n:]{3,140}?\s[-–]\s[^*\n:]{2,140}?)\s*(?:(?::\s*(?:\*\*)?)|(?:\*\*\s*:))\s*([\s\S]*)$/;
    const previewRe = /^(?:\*\*)?\s*(Vorschau|Ausblick|Fazit)\s*(?:(?::\s*(?:\*\*)?)|(?:\*\*\s*:))\s*([\s\S]*)$/i;
    const sections = [];
    const intro = [];
    paragraphs.forEach((paragraph, index) => {
      const preview = paragraph.match(previewRe);
      const team = paragraph.match(teamRe);
      if (preview) sections.push({ id: `section-${sections.length}`, type: "preview", label: "Vorschau", text: paragraph, editedText: paragraph, status: "open", note: "" });
      else if (team) sections.push({ id: `section-${sections.length}`, type: "team", label: cleanLabel(team[1]), text: paragraph, editedText: paragraph, status: "open", note: "" });
      else if (!sections.length && index <= 2) intro.push(paragraph);
      else sections.push({ id: `section-${sections.length}`, type: "other", label: `Abschnitt ${sections.length + 1}`, text: paragraph, editedText: paragraph, status: "open", note: "" });
    });
    if (intro.length) sections.unshift({ id: "section-intro", type: "intro", label: "Überschrift und Lead", text: intro.join("\n\n"), editedText: intro.join("\n\n"), status: "open", note: "" });
    return sections;
  }

  function ensureSectionState(force = false) {
    const text = (els.generatedOutput?.value || state.generatedText || "").trim();
    if (!text) {
      state.sectionReviews = [];
      state.sectionReviewSourceText = "";
      return;
    }
    if (!force && state.sectionReviewSourceText === text && state.sectionReviews?.length) return;
    state.sectionReviews = parseSections(text);
    state.sectionReviewSourceText = text;
    save();
  }

  function sourceTable(sources) {
    if (!sources.length) return `<p class="section-review-help">Keine passende Quelle gefunden. Bitte manuell prüfen.</p>`;
    return `<div class="source-table-wrap"><table class="source-table"><thead><tr><th>Datum</th><th>Liga</th><th>Mannschaft 1</th><th>Mannschaft 2</th><th>Ergebnis</th></tr></thead><tbody>${sources.map(({ report }) => `<tr><td>${escape(report.dateLabel || "")}</td><td>${escape(report.league || "")}</td><td>${escape(report.home || "")}</td><td>${escape(report.guest || "")}</td><td>${escape(report.result || "")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function sourceDetails(sources) {
    return sources.map(({ report }) => {
      const raw = rawTextFor(report);
      return raw ? `<details class="source-detail"><summary>${escape(reportLabelSafe(report))}</summary><pre>${escape(raw)}</pre></details>` : "";
    }).join("");
  }

  function renderSectionReview() {
    const panel = document.getElementById("sectionReviewWorkflow");
    if (!panel) return;
    ensureSectionState();
    const sections = state.sectionReviews || [];
    const accepted = sections.filter(section => section.status === "accepted").length;
    const excluded = sections.filter(section => section.status === "excluded").length;
    panel.querySelector("#sectionReviewSummary").innerHTML = `<span class="pill good">${accepted} übernommen</span><span class="pill warn">${sections.length - accepted - excluded} offen</span><span class="pill">${excluded} nicht verwenden</span>`;
    const list = panel.querySelector("#sectionReviewList");
    if (!sections.length) {
      list.innerHTML = `<div class="infobox"><strong>Noch kein Bericht</strong><p>Erstelle zuerst einen Bericht. Danach wird er hier automatisch in prüfbare Abschnitte zerlegt.</p></div>`;
      return;
    }
    list.innerHTML = sections.map((section, index) => {
      const sources = section.type === "team" ? sourceReportsFor(section) : [];
      const chats = chatFor(section, sources);
      return `<article class="section-review-card ${escape(section.status || "open")}"><h4>${escape(section.label)} <span class="pill">${section.status === "accepted" ? "übernommen" : section.status === "excluded" ? "nicht verwenden" : "offen"}</span></h4><div class="section-review-grid"><div><label class="field"><span>Text prüfen und bearbeiten</span><textarea class="section-review-editor" data-section-text="${index}">${escape(section.editedText || section.text || "")}</textarea></label><label class="field"><span>Hinweis für Neuformulierung</span><textarea class="section-review-note" data-section-note="${index}" placeholder="Optional: konkrete Korrektur oder gewünschte Änderung.">${escape(section.note || "")}</textarea></label><div class="actions"><button class="btn" type="button" data-section-action="accept" data-section-index="${index}">Übernehmen</button><button class="btn secondary" type="button" data-section-action="edit" data-section-index="${index}">Überarbeiten</button><button class="btn secondary" type="button" data-section-action="rewrite" data-section-index="${index}">Mit Hinweis neu formulieren</button><button class="btn secondary" type="button" data-section-action="exclude" data-section-index="${index}">Nicht verwenden</button></div></div><div class="section-source-box"><h5>Quellenprüfung: Spielbericht</h5>${sourceTable(sources)}${sourceDetails(sources)}<h5 style="margin-top:12px">Zugeordnete Chat-/Zusatzinfos</h5>${chats.length ? chats.map(message => `<div class="chat-source">${escape(message.text)}</div>`).join("") : `<p class="section-review-help">Keine zugeordnete Chatnachricht für diesen Abschnitt.</p>`}</div></div></article>`;
    }).join("");
  }

  function saveSectionInputs() {
    (state.sectionReviews || []).forEach((section, index) => {
      const text = document.querySelector(`[data-section-text="${index}"]`);
      const note = document.querySelector(`[data-section-note="${index}"]`);
      if (text) section.editedText = text.value;
      if (note) section.note = note.value;
    });
    save();
  }

  function composeReviewedReport() {
    saveSectionInputs();
    const text = (state.sectionReviews || []).filter(section => section.status !== "excluded").map(section => (section.editedText || section.text || "").trim()).filter(Boolean).join("\n\n");
    if (text) {
      state.generatedText = text;
      if (els.generatedOutput) els.generatedOutput.value = text;
      save();
      showToast("Geprüfter Bericht zusammengesetzt");
    }
    renderSectionReview();
  }

  async function rewriteSection(index) {
    saveSectionInputs();
    const section = state.sectionReviews?.[index];
    if (!section) return;
    if (typeof requestGeneratePassword === "function" && !requestGeneratePassword("section-review")) {
      window.__sgaPendingSectionRewrite = index;
      return;
    }
    const status = document.querySelector("#sectionReviewStatus");
    const sources = sourceReportsFor(section);
    const chats = chatFor(section, sources);
    const prompt = `Formuliere nur den folgenden Abschnitt eines SGA-Tennisberichts neu.

Regeln:
- Gib ausschließlich den überarbeiteten Abschnitt aus.
- Erfinde keine Fakten, Namen, Ergebnisse oder Termine.
- Bewahre das Format mit fett gesetztem Einstieg "Mannschaft - Liga:" beziehungsweise "Vorschau:".
- Setze den Nutzerhinweis vorrangig um.

Aktueller Abschnitt:
${section.editedText || section.text}

Nutzerhinweis:
${section.note || "[Kein zusätzlicher Hinweis]"}

Spielbericht-Quellen:
${sources.map(({ report }) => `${reportLabelSafe(report)}\n${rawTextFor(report)}`).join("\n\n---\n\n") || "[Keine passende Quelle]"}

Chat-/Zusatzinfos:
${chats.map(message => message.text).join("\n\n---\n\n") || "[Keine Chatnachricht]"}`;
    if (status) status.textContent = "Abschnitt wird neu formuliert ...";
    try {
      const response = await fetch(`${apiBase}/api/generate`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Der Abschnitt konnte nicht neu formuliert werden.");
      section.editedText = payload.text || section.editedText;
      section.status = "open";
      if (status) status.textContent = "Abschnitt wurde neu formuliert. Bitte prüfen und übernehmen.";
      save();
      renderSectionReview();
    } catch (error) {
      if (status) {
        status.textContent = error.message || "Der Abschnitt konnte nicht neu formuliert werden.";
        status.classList.add("error");
      }
    }
  }

  function installSectionWorkflow() {
    if (document.getElementById("sectionReviewWorkflow") || !els.generatedOutput) return;
    const generatedBox = els.generatedOutput.closest(".result-box");
    if (!generatedBox) return;
    els.reviewReport?.classList.add("section-review-hidden");
    els.reviewOutput?.closest(".result-box")?.classList.add("section-review-hidden");
    els.improvedPromptBox?.classList.add("section-review-hidden");
    els.checks?.closest(".checklist")?.classList.add("section-review-hidden");
    const panel = document.createElement("div");
    panel.id = "sectionReviewWorkflow";
    panel.className = "section-review-workflow";
    panel.innerHTML = `<h3>Mannschaftsprüfung</h3><p class="section-review-help">Prüfe den Bericht Abschnitt für Abschnitt. Links kannst du den Text bearbeiten, rechts siehst du die zugeordneten Spielberichte als Tabelle sowie passende Chat-/Zusatzinfos.</p><div class="actions"><button class="btn secondary" id="prepareSectionReview" type="button">Abschnitte neu vorbereiten</button><button class="btn" id="composeReviewedReport" type="button">Geprüften Gesamtbericht zusammensetzen</button></div><div class="section-review-summary" id="sectionReviewSummary"></div><div class="status" id="sectionReviewStatus"></div><div class="section-review-list" id="sectionReviewList"></div>`;
    generatedBox.insertAdjacentElement("afterend", panel);
    panel.addEventListener("input", event => {
      if (event.target.matches("[data-section-text], [data-section-note]")) saveSectionInputs();
    });
    panel.addEventListener("click", async event => {
      if (event.target.closest("#prepareSectionReview")) {
        ensureSectionState(true);
        renderSectionReview();
        showToast("Abschnitte vorbereitet");
        return;
      }
      if (event.target.closest("#composeReviewedReport")) {
        composeReviewedReport();
        return;
      }
      const button = event.target.closest("[data-section-action]");
      if (!button) return;
      const index = Number(button.dataset.sectionIndex);
      const action = button.dataset.sectionAction;
      if (!state.sectionReviews?.[index]) return;
      saveSectionInputs();
      if (action === "accept") state.sectionReviews[index].status = "accepted";
      if (action === "exclude") state.sectionReviews[index].status = "excluded";
      if (action === "edit") {
        panel.querySelector(`[data-section-text="${index}"]`)?.focus();
        return;
      }
      if (action === "rewrite") {
        await rewriteSection(index);
        return;
      }
      save();
      renderSectionReview();
    });
    renderSectionReview();
  }

  function patchGenerateAndLogin() {
    if (!window.__sgaSectionWorkflowGeneratePatched && typeof generateReport === "function") {
      const originalGenerate = generateReport;
      generateReport = async function generateReportWithSectionWorkflow() {
        await originalGenerate();
        ensureSectionState(true);
        renderSectionReview();
      };
      els.generateReport?.removeEventListener("click", originalGenerate);
      els.generateReport?.addEventListener("click", generateReport);
      window.__sgaSectionWorkflowGeneratePatched = true;
    }
    if (!window.__sgaSectionWorkflowLoginPatched && typeof login === "function") {
      const originalLogin = login;
      login = async function loginWithSectionWorkflow(event) {
        await originalLogin(event);
        if (state.authenticated && Number.isInteger(window.__sgaPendingSectionRewrite)) {
          const index = window.__sgaPendingSectionRewrite;
          window.__sgaPendingSectionRewrite = null;
          await rewriteSection(index);
        }
      };
      els.loginForm?.removeEventListener("submit", originalLogin);
      els.loginForm?.addEventListener("submit", login);
      window.__sgaSectionWorkflowLoginPatched = true;
    }
  }

  function initPatch() {
    try {
      chatReportCandidates = window.chatReportCandidates;
      matchingReportsForChatMessage = window.matchingReportsForChatMessage;
      enrichChatMessage = window.enrichChatMessage;
      refreshChatAssignments = window.refreshChatAssignments;
      renderChatMessages = window.renderChatMessages;
      if (typeof state !== "undefined" && typeof defaultSourceUrl !== "undefined" && (!state.sourceUrl || /\/wa\/(?:teamPortrait|groupPage)\?/i.test(state.sourceUrl))) {
        state.sourceUrl = defaultSourceUrl;
        if (els.sourceUrl) els.sourceUrl.value = defaultSourceUrl;
        save();
      }
      ensureStyles();
      patchPrintFormat();
      installSectionWorkflow();
      patchGenerateAndLogin();
    } catch (error) {
      console.warn("SGA patch konnte nicht vollständig geladen werden:", error);
    }
  }

  initPatch();
  window.addEventListener("DOMContentLoaded", initPatch);
}());
