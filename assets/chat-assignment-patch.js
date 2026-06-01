(function () {
  function normalizeMatchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\bhe\s*(\d{2})\s*(iii|ii|iv|v|i)\b/g, (_, age, roman) => `h${age}${({ i: "1", ii: "2", iii: "3", iv: "4", v: "5" }[roman] || roman)}`)
      .replace(/\bda\s*(\d{2})\s*(iii|ii|iv|v|i)\b/g, (_, age, roman) => `d${age}${({ i: "1", ii: "2", iii: "3", iv: "4", v: "5" }[roman] || roman)}`)
      .replace(/([a-z]+|[dh])\s*(\d{2})\s*(iii|ii|iv|v|i)\b/g, (_, prefix, age, roman) => `${prefix}${age}${({ i: "1", ii: "2", iii: "3", iv: "4", v: "5" }[roman] || roman)}`)
      .replace(/\b(i{1,3}|iv|v)\b/g, match => ({ i: "1", ii: "2", iii: "3", iv: "4", v: "5" }[match] || match))
      .replace(/u\s*8\s*\+/g, "u8+")
      .replace(/\bhe\s*(\d{2})/g, "h$1")
      .replace(/\bda\s*(\d{2})/g, "d$1")
      .replace(/([dh])\s*(\d{2})/g, "$1$2")
      .replace(/[^a-z0-9+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function compactMatchText(value) {
    return normalizeMatchText(value).replace(/\s+/g, "");
  }

  function reportLooksYouthPatched(report) {
    const text = `${report.league || ""} ${report.home || ""} ${report.guest || ""}`;
    return /(^|[^A-Z0-9])(D12|D15|D18|H12|H15|H18|U8\+|U10)(?=$|[^A-Z0-9])/i.test(text);
  }

  function reportTeamSuffix(report) {
    const sgaTeam = [report.home, report.guest].find(team => /sg\s*arheilgen/i.test(team || "")) || "";
    const normalized = normalizeMatchText(sgaTeam);
    const suffix = normalized.match(/\b([1-5])\b/);
    return suffix ? suffix[1] : (sgaTeam ? "1" : "");
  }

  function teamIdentityFromReport(report) {
    const league = normalizeMatchText(report.league || "");
    const full = normalizeMatchText(`${report.league || ""} ${report.home || ""} ${report.guest || ""}`);
    const suffix = reportTeamSuffix(report);
    const isFemale = /\b(damen|juniorinnen)\b/.test(full) || /\bd(?:00|10|12|15|18|30|40|50|55|60|65|70|75)\b/.test(full);
    const isMale = /\b(herren|junioren)\b/.test(full) || /\bh(?:00|10|12|15|18|30|40|50|55|60|65|70|75)\b/.test(full);
    const isYouth = reportLooksYouthPatched(report) || /\b(juniorinnen|junioren|u8\+|u10|u12|u15|u18|d12|d15|d18|h12|h15|h18)\b/.test(full);
    const ageMatch = full.match(/\b(?:u|d|h)?(8\+|10|12|15|18|30|40|50|55|60|65|70|75)\b/);
    const age = ageMatch ? ageMatch[1] : "";
    return { league, full, suffix, isFemale, isMale, isYouth, age };
  }

  function addCandidate(candidates, value, weight) {
    const normalized = normalizeMatchText(value);
    if (normalized.length >= 2) candidates.push({ value: normalized, compact: compactMatchText(normalized), weight });
  }

  function leagueLevelAliases(league) {
    const normalized = normalizeMatchText(league);
    const aliases = [];
    if (/\brswl\b|\brlsw\b|regionalliga/.test(normalized)) aliases.push("Regionalliga", "Regionalliga Südwest", "Südwestliga", "Südwest-Liga", "Suedwest Liga", "RSWL");
    if (/\bswl\b|\bsuedwest\b|\bsudwest\b|südwest/.test(normalized)) aliases.push("Südwestliga", "Südwest-Liga", "Suedwest Liga", "SWL");
    if (/\bhl\b|hessenliga/.test(normalized)) aliases.push("Hessenliga");
    if (/\bvl\b|verbandsliga/.test(normalized)) aliases.push("Verbandsliga");
    if (/\bgl\b|gruppenliga/.test(normalized)) aliases.push("Gruppenliga");
    if (/\bkol\b|kreisoberliga/.test(normalized)) aliases.push("Kreisoberliga");
    if (/\bka\b|kreisliga a/.test(normalized)) aliases.push("Kreisliga A");
    if (/\bkb\b|kreisliga b/.test(normalized)) aliases.push("Kreisliga B");
    return aliases;
  }

  function reportKey(report, index = -1) {
    if (!report) return "";
    return String(report.id || report.url || report.sourceUrl || `report-${index >= 0 ? index : state.reports.indexOf(report)}`);
  }

  function reportLabel(report) {
    if (!report) return "Partie auswählen";
    const date = report.dateLabel || "Ohne Datum";
    const league = report.league || "Spielbericht";
    const home = report.home || "Heimteam";
    const guest = report.guest || "Gastteam";
    const result = report.result ? ` · ${report.result}` : "";
    return `${date} · ${league} · ${home} - ${guest}${result}`;
  }

  function reportDateValue(report) {
    if (report?.date) return report.date;
    const label = String(report?.dateLabel || "");
    const match = label.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
    if (!match) return "";
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  function messageDateValue(message) {
    if (message?.created) {
      const created = new Date(message.created);
      if (!Number.isNaN(created.getTime())) {
        const berlinDate = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Europe/Berlin",
          year: "numeric",
          month: "2-digit",
          day: "2-digit"
        }).format(created);
        if (/^\d{4}-\d{2}-\d{2}$/.test(berlinDate)) return berlinDate;
      }
    }
    const text = String(message?.text || message || "");
    const match = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
    if (!match) return "";
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }

  function reportByKey(key) {
    if (!key || !Array.isArray(state.reports)) return null;
    return state.reports.find((report, index) => reportKey(report, index) === key) || null;
  }

  function allReportOptions(message) {
    const maxDate = messageDateValue(message);
    return Array.isArray(state.reports)
      ? state.reports
        .filter(report => !maxDate || !reportDateValue(report) || reportDateValue(report) <= maxDate)
        .map(report => ({ report, key: reportKey(report), label: reportLabel(report) }))
      : [];
  }

  window.chatReportCandidates = function chatReportCandidatesPatched(report) {
    const info = teamIdentityFromReport(report);
    const candidates = [];
    addCandidate(candidates, report.league || "", 70);
    addCandidate(candidates, info.league, 70);
    for (const level of leagueLevelAliases(report.league || "")) {
      addCandidate(candidates, level, 55);
    }

    const genderWords = [];
    const shortLetters = [];
    if (info.isFemale) {
      genderWords.push(info.isYouth ? "Juniorinnen" : "Damen", "Damen");
      shortLetters.push("D");
    }
    if (info.isMale) {
      genderWords.push(info.isYouth ? "Junioren" : "Herren", "Herren");
      shortLetters.push("H");
    }

    if (info.age) {
      for (const word of new Set(genderWords)) {
        addCandidate(candidates, `${word} ${info.age}`, 95);
        addCandidate(candidates, `${word}${info.age}`, 95);
        for (const level of leagueLevelAliases(report.league || "")) {
          addCandidate(candidates, `${word} ${info.age} ${level}`, 175);
          addCandidate(candidates, `${word}${info.age} ${level}`, 175);
        }
        if (info.suffix) {
          addCandidate(candidates, `${word} ${info.age} ${info.suffix}`, 125);
          addCandidate(candidates, `${word}${info.age}${info.suffix}`, 125);
        }
      }
      for (const letter of new Set(shortLetters)) {
        addCandidate(candidates, `${letter}${info.age}`, 100);
        if (letter === "H") addCandidate(candidates, `HE${info.age}`, 100);
        if (letter === "D") addCandidate(candidates, `DA${info.age}`, 100);
        if (info.suffix) addCandidate(candidates, `${letter}${info.age}${info.suffix}`, 130);
      }
      if (info.isYouth || /^8\+|10|12|15|18$/.test(info.age)) {
        addCandidate(candidates, `U${info.age}`, 95);
        if (info.suffix) addCandidate(candidates, `U${info.age}${info.suffix}`, 120);
      }
      if (info.suffix) addCandidate(candidates, `${info.age}${info.suffix}`, 60);
    }

    if (info.suffix) {
      addCandidate(candidates, `${report.league || ""} ${info.suffix}`, 105);
      addCandidate(candidates, `${report.league || ""}-${info.suffix}`, 105);
    }

    const unique = new Map();
    for (const candidate of candidates) {
      const key = `${candidate.value}|${candidate.compact}`;
      if (!unique.has(key) || unique.get(key).weight < candidate.weight) unique.set(key, candidate);
    }
    return [...unique.values()];
  };

  function candidateMatchesMessage(candidate, normalizedMessage, compactMessage) {
    if (!candidate.value) return false;
    const escaped = candidate.value.replace(/\+/g, "\\+");
    const spacedPattern = new RegExp(`(^| )${escaped}( |$)`);
    if (spacedPattern.test(normalizedMessage)) return true;
    if (candidate.compact && candidate.compact.length >= 3) {
      const compactPattern = new RegExp(`(^|[^a-z0-9])${candidate.compact.replace(/\+/g, "\\+")}([^a-z0-9]|$)`);
      return compactPattern.test(compactMessage);
    }
    return false;
  }

  function rankedReportsForChatMessage(text) {
    const normalized = normalizeMatchText(text);
    const compact = compactMatchText(text);
    if (!normalized || !Array.isArray(state.reports)) return [];
    return state.reports
      .map(report => {
        const hits = window.chatReportCandidates(report).filter(candidate => candidateMatchesMessage(candidate, normalized, compact));
        const score = [...new Map(hits.map(candidate => [candidate.value, candidate])).values()]
          .reduce((sum, candidate) => sum + candidate.weight, 0);
        return { report, score };
      })
      .filter(match => match.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  window.matchingReportsForChatMessage = function matchingReportsForChatMessagePatched(text) {
    const ranked = rankedReportsForChatMessage(text);
    if (!ranked.length) return [];
    const topScore = ranked[0].score;
    return ranked.filter(match => match.score === topScore).map(match => match.report);
  };

  window.enrichChatMessage = function enrichChatMessagePatched(message, index) {
    const text = String(message.text || message).trim();
    const manualReport = reportByKey(message.manualReportKey);
    if (manualReport) {
      return {
        id: message.id || `chat-${Date.now()}-${index}`,
        text,
        created: message.created || "",
        author: message.author || "",
        selected: message.manualSelected ? Boolean(message.selected) : true,
        manualSelected: true,
        manualReportKey: reportKey(manualReport),
        assignmentStatus: "good",
        assignmentLabel: `Manuell zugeordnet: ${reportLabel(manualReport)}`,
        possibleReportKeys: Array.isArray(message.possibleReportKeys) ? message.possibleReportKeys : []
      };
    }

    const ranked = rankedReportsForChatMessage(text);
    let matches = window.matchingReportsForChatMessage(text);
    const selectedMatches = matches.filter(report => report.selected);
    if (matches.length > 1 && selectedMatches.length === 1) matches = selectedMatches;
    if (matches.length === 1) {
      const report = matches[0];
      return {
        id: message.id || `chat-${Date.now()}-${index}`,
        text,
        created: message.created || "",
        author: message.author || "",
        selected: message.manualSelected ? Boolean(message.selected) : Boolean(report.selected),
        manualSelected: Boolean(message.manualSelected),
        manualReportKey: message.manualReportKey || "",
        assignmentStatus: report.selected ? "good" : "unselected",
        assignmentLabel: `${report.league || "Spielbericht"} · ${report.home || "SGA"} - ${report.guest || "Gegner"}`,
        possibleReportKeys: [reportKey(report)]
      };
    }
    const possibleReports = matches.length > 1 ? matches : ranked.slice(0, 6).map(match => match.report);
    return {
      id: message.id || `chat-${Date.now()}-${index}`,
      text,
      created: message.created || "",
      author: message.author || "",
      selected: message.manualSelected ? Boolean(message.selected) : false,
      manualSelected: Boolean(message.manualSelected),
      manualReportKey: message.manualReportKey || "",
      assignmentStatus: "unclear",
      assignmentLabel: matches.length > 1 ? "Mehrere mögliche Mannschaften gefunden" : "Keine eindeutige Mannschaft gefunden",
      possibleReportKeys: possibleReports.map(report => reportKey(report))
    };
  };

  function ensureChatAssignmentStyles() {
    if (document.getElementById("sga-chat-assignment-styles")) return;
    const style = document.createElement("style");
    style.id = "sga-chat-assignment-styles";
    style.textContent = `
      .chat-assignment-select {
        appearance: none;
        width: 100%;
        margin-top: 10px;
        padding: 9px 12px;
        border: 1px solid rgba(20, 163, 218, 0.35);
        border-radius: 8px;
        background: #eef9fd;
        color: #12394a;
        font: inherit;
      }
      .chat-assignment-hint {
        display: block;
        margin-top: 8px;
        color: #3c6474;
        font-size: 0.88rem;
      }
      .sga-review-panel {
        margin-top: 14px;
        border: 1px solid #dbe3ed;
        border-radius: 8px;
        background: #f8fafc;
        padding: 14px;
      }
      .sga-review-panel h4 {
        margin: 0 0 10px;
        font-size: 15px;
      }
      .sga-review-checks {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px 12px;
        margin-bottom: 12px;
      }
      .sga-review-checks label,
      .sga-review-pass {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        font-weight: 700;
      }
      .sga-review-panel textarea {
        width: 100%;
        min-height: 96px;
        margin-top: 8px;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        padding: 11px 12px;
      }
      @media (max-width: 820px) {
        .sga-review-checks { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function assignmentOptionsForMessage(message) {
    const options = allReportOptions(message);
    if (message.assignmentStatus !== "unclear") return options;
    return options;
  }

  function ensureReviewLoopUi() {
    if (document.getElementById("sgaReviewPanel") || typeof els === "undefined" || !els.reviewOutput) return;
    const panel = document.createElement("div");
    panel.className = "sga-review-panel";
    panel.id = "sgaReviewPanel";
    panel.innerHTML = `
      <h4>Eigene Prüfung abhaken</h4>
      <div class="sga-review-checks">
        <label><input type="checkbox" data-sga-review-check="Namen geprüft"> Namen geprüft</label>
        <label><input type="checkbox" data-sga-review-check="Ergebnisse geprüft"> Ergebnisse geprüft</label>
        <label><input type="checkbox" data-sga-review-check="Mannschaften/Ligen geprüft"> Mannschaften/Ligen geprüft</label>
        <label><input type="checkbox" data-sga-review-check="Vorschau geprüft"> Vorschau geprüft</label>
        <label><input type="checkbox" data-sga-review-check="Stil und Ausgabeformat geprüft"> Stil und Ausgabeformat geprüft</label>
      </div>
      <label class="sga-review-pass"><input type="checkbox" id="sgaReviewPass"> Habe geprüft, passt</label>
      <label class="field"><span>Konkrete Änderungswünsche</span><textarea id="sgaReviewCorrections" placeholder="Optional: Namen, Ergebnisse, Formulierungen oder konkrete Änderungen eintragen."></textarea></label>
      <div class="actions">
        <button class="btn" id="sgaRegenerateWithReview" type="button">Bericht mit Prüfung neu erstellen</button>
      </div>
      <div class="status" id="sgaReviewLoopStatus"></div>
    `;
    els.reviewOutput.insertAdjacentElement("afterend", panel);

    const stored = window.__sgaReviewLoopState || {};
    panel.querySelectorAll("[data-sga-review-check]").forEach(input => {
      input.checked = Array.isArray(stored.checks) && stored.checks.includes(input.dataset.sgaReviewCheck);
      input.addEventListener("change", saveReviewLoopState);
    });
    panel.querySelector("#sgaReviewPass").checked = Boolean(stored.pass);
    panel.querySelector("#sgaReviewCorrections").value = stored.corrections || "";
    panel.querySelector("#sgaReviewPass").addEventListener("change", saveReviewLoopState);
    panel.querySelector("#sgaReviewCorrections").addEventListener("input", saveReviewLoopState);
    panel.querySelector("#sgaRegenerateWithReview").addEventListener("click", regenerateReportWithReviewLoop);
  }

  function saveReviewLoopState() {
    const panel = document.getElementById("sgaReviewPanel");
    if (!panel) return;
    window.__sgaReviewLoopState = {
      checks: [...panel.querySelectorAll("[data-sga-review-check]:checked")].map(input => input.dataset.sgaReviewCheck),
      pass: Boolean(panel.querySelector("#sgaReviewPass")?.checked),
      corrections: panel.querySelector("#sgaReviewCorrections")?.value || ""
    };
  }

  function reviewLoopStateText() {
    saveReviewLoopState();
    const reviewState = window.__sgaReviewLoopState || {};
    const checks = Array.isArray(reviewState.checks) && reviewState.checks.length ? reviewState.checks.join(", ") : "Keine Punkte abgehakt";
    const pass = reviewState.pass ? "Nutzerprüfung: geprüft, passt." : "Nutzerprüfung: Änderungen/Prüfung offen.";
    const corrections = String(reviewState.corrections || "").trim() || "[Keine konkreten Änderungswünsche eingetragen]";
    return `Abgehakte Prüfpunkte: ${checks}\n${pass}\nKonkrete Änderungswünsche:\n${corrections}`;
  }

  async function regenerateReportWithReviewLoop() {
    const status = document.getElementById("sgaReviewLoopStatus");
    const button = document.getElementById("sgaRegenerateWithReview");
    if (!status || typeof requestGeneratePassword !== "function") return;
    if (!requestGeneratePassword("review-loop")) {
      window.__sgaPendingReviewLoop = true;
      status.textContent = "Bitte Passwort eingeben, um den Bericht neu zu erstellen.";
      status.classList.remove("error");
      return;
    }
    window.__sgaPendingReviewLoop = false;
    const report = (els.generatedOutput?.value || state.generatedText || "").trim();
    if (!report) {
      status.textContent = "Bitte zuerst einen Bericht generieren oder einfügen.";
      status.classList.add("error");
      return;
    }
    const review = (els.reviewOutput?.value || state.reviewText || "").trim();
    const prompt = `Überarbeite den folgenden SGA-Tennisbericht anhand der maschinellen Prüfung und der Nutzerprüfung.

Regeln:
- Erstelle direkt den finalen Bericht, keine Analyse davor oder danach.
- Übernimm konkrete Änderungswünsche des Nutzers vorrangig.
- Wenn der Nutzer "geprüft, passt" markiert hat und keine Änderungswünsche vorhanden sind, nimm nur zwingend notwendige Korrekturen aus der maschinellen Prüfung vor.
- Erfinde keine Fakten, Ergebnisse, Namen oder Termine.
- Bewahre den gewünschten Stil, Kanal und die Formatierungsregeln aus dem Master-Prompt.

Master-Prompt:
${currentPromptText()}

Bisheriger Bericht:
${report}

Maschinelle Prüfung:
${review || "[Keine maschinelle Prüfung vorhanden]"}

Nutzerprüfung:
${reviewLoopStateText()}`;

    status.textContent = "Bericht wird mit deiner Prüfung neu erstellt ...";
    status.classList.remove("error");
    button.disabled = true;
    try {
      const response = await fetch(`${apiBase}/api/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Der Bericht konnte nicht neu erstellt werden.");
      state.generatedText = payload.text || "";
      if (els.generatedOutput) els.generatedOutput.value = state.generatedText;
      if (typeof save === "function") save();
      status.textContent = "Bericht wurde anhand deiner Prüfung neu erstellt.";
      if (typeof render === "function") render();
      ensureReviewLoopUi();
    } catch (error) {
      status.textContent = error.message || "Der Bericht konnte nicht neu erstellt werden.";
      status.classList.add("error");
    } finally {
      button.disabled = false;
    }
  }

  function patchLoginForReviewLoop() {
    if (window.__sgaReviewLoopLoginPatched || typeof login !== "function") return;
    const originalLogin = login;
    login = async function loginWithReviewLoop(event) {
      await originalLogin(event);
      if (state.authenticated && window.__sgaPendingReviewLoop) {
        window.__sgaPendingReviewLoop = false;
        await regenerateReportWithReviewLoop();
      }
    };
    els.loginForm?.removeEventListener("submit", originalLogin);
    els.loginForm?.addEventListener("submit", login);
    window.__sgaReviewLoopLoginPatched = true;
  }

  function patchPrintReportFormat() {
    if (window.__sgaPrintReportFormatPatched) return;

    if (typeof buildPrompt === "function") {
      const originalBuildPrompt = buildPrompt;
      buildPrompt = function buildPromptWithPrintFormat() {
        const prompt = originalBuildPrompt();
        const marker = "Standardformat für Printmedien nach APO 18.05.2026";
        if (prompt.includes(marker)) return prompt;
        const formatRules = `${marker}:
- Nutze für jeden Print-Bericht genau den Aufbau der Datei "APO 18.05.2026 SGA Tennis Aktive Senioren".
- Zeile 1 optional: kurze Bild-/Kontextzeile, falls vorhanden, zum Beispiel "Herren 40 I - (v.l.n.r.: ...)".
- Danach eine prägnante Überschrift in einer eigenen Zeile, fett gesetzt.
- Danach ein kurzer Lead-Absatz als Fließtext mit den wichtigsten Ergebnissen und der sportlichen Einordnung.
- Danach pro Mannschaft genau ein eigener Fließtext-Absatz. Am Absatzanfang steht "Mannschaft - Liga:" fett, danach läuft der Text normal weiter.
- Falls Vorschau-Daten vorhanden sind: letzter Absatz im Format "Vorschau:" fett am Anfang, danach normaler Fließtext direkt dahinter.
- Keine separaten Zwischenüberschriften wie Regionale Ebene, Landesebene, Kreisebene, Ergebnisse oder Vorschau verwenden.
- Keine Listen, keine Stichpunkte und keine Tabellen im Print-Bericht.
- Nur Überschrift, "Mannschaft - Liga:" und "Vorschau:" fett setzen. Spielernamen, Ergebnisse und restlicher Text bleiben normal.
- Wenn nur Klartext möglich ist, verwende Markdown-Fettmarkierung mit **...**, damit der Word-/Google-Docs-Export echte Fettformatierung erzeugen kann.
`;
        return prompt.replace(/\nKontrolle vor Ausgabe:/, `\n${formatRules}\nKontrolle vor Ausgabe:`);
      };
    }

    if (typeof shouldBoldOpeningLabel === "function") {
      shouldBoldOpeningLabel = function shouldBoldOpeningLabelPatched(line) {
        const colonIndex = line.indexOf(":");
        if (colonIndex < 4 || colonIndex > 95) return false;
        const label = line.slice(0, colonIndex).trim();
        if (/\*\*/.test(label)) return false;
        if (/^(Vorschau|Ausblick|Fazit)$/i.test(label)) return true;
        if (!label.includes(" - ") && !label.includes(" – ")) return false;
        return /(Damen|Herren|Junior|Juniorinnen|Gemischt|U\d|D\d|H\d|Regionalliga|Südwest|Hessenliga|Verbandsliga|Gruppenliga|Kreisoberliga|Kreisliga|Liga|Klasse)/i.test(label);
      };
    }

    if (typeof markdownLineToHtml === "function") {
      markdownLineToHtml = function markdownLineToHtmlPatched(line) {
        if (typeof shouldBoldOpeningLabel === "function" && shouldBoldOpeningLabel(line)) {
          const colonIndex = line.indexOf(":");
          const label = line.slice(0, colonIndex).trim();
          const rest = line.slice(colonIndex + 1);
          return `<strong>${inlineFormatting(`${label}:`)}</strong>${inlineFormatting(rest)}`;
        }
        return inlineFormatting(line);
      };
    }

    if (typeof looksLikeSectionHeading === "function") {
      looksLikeSectionHeading = function looksLikeSectionHeadingPatched(line) {
        if (!line || line.length > 95) return false;
        if (typeof shouldBoldOpeningLabel === "function" && shouldBoldOpeningLabel(line)) return false;
        return /^(Vorschau|Ausblick|Fazit):?$/i.test(String(line).trim());
      };
    }

    window.__sgaPrintReportFormatPatched = true;
  }

  window.renderChatMessages = function renderChatMessagesPatched() {
    ensureChatAssignmentStyles();
    els.applyChatMessages.disabled = !state.chatMessages.some(message => message.selected);
    els.selectAllChatMessages.disabled = !state.chatMessages.length;
    if (!state.chatMessages.length) {
      els.chatMessageList.innerHTML = "";
      return;
    }

    els.chatMessageList.innerHTML = state.chatMessages.map((message, index) => {
      const assignmentClass = message.assignmentStatus === "good" ? "chat-good" : message.assignmentStatus === "unclear" ? "chat-warn" : "chat-muted";
      const options = assignmentOptionsForMessage(message);
      const showSelect = message.assignmentStatus === "unclear" && options.length;
      const selectHtml = showSelect ? `
        <span class="chat-assignment-hint">${message.assignmentLabel && message.assignmentLabel.includes("Mehrere") ? "Bitte eine der möglichen Partien auswählen:" : "Bitte die passende Partie auswählen:"}</span>
        <select class="chat-assignment-select" data-chat-assign-index="${index}">
          <option value="">Noch nicht zugeordnet</option>
          ${options.map(option => `<option value="${escapeHtml(option.key)}" ${message.manualReportKey === option.key ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      ` : "";
      return `
        <label class="report-card ${assignmentClass}">
          <input type="checkbox" data-chat-index="${index}" ${message.selected ? "checked" : ""}>
          <span>
            <span class="report-title">Nachricht ${index + 1}</span>
            <span class="report-meta">${escapeHtml(message.assignmentLabel || "")}</span>
            <span class="report-meta">${escapeHtml(message.text)}</span>
            ${selectHtml}
          </span>
        </label>
      `;
    }).join("");

    els.chatMessageList.querySelectorAll("input[type='checkbox']").forEach(input => {
      input.addEventListener("change", event => {
        const index = Number(event.target.dataset.chatIndex);
        state.chatMessages[index].selected = event.target.checked;
        state.chatMessages[index].manualSelected = true;
        save();
        window.renderChatMessages();
        const selected = state.chatMessages.filter(message => message.selected).length;
        setChatStatus(`${state.chatMessages.length} Nachrichten importiert, ${selected} ausgewählt.`);
      });
    });

    els.chatMessageList.querySelectorAll(".chat-assignment-select").forEach(select => {
      select.addEventListener("click", event => event.stopPropagation());
      select.addEventListener("change", event => {
        const index = Number(event.target.dataset.chatAssignIndex);
        const key = event.target.value;
        if (!state.chatMessages[index]) return;
        state.chatMessages[index].manualReportKey = key;
        state.chatMessages[index].manualSelected = Boolean(key);
        if (key) state.chatMessages[index].selected = true;
        state.chatMessages[index] = window.enrichChatMessage(state.chatMessages[index], index);
        save();
        window.renderChatMessages();
        const selected = state.chatMessages.filter(message => message.selected).length;
        const unclear = state.chatMessages.filter(message => message.assignmentStatus === "unclear").length;
        setChatStatus(`${state.chatMessages.length} Nachrichten importiert, ${selected} ausgewählt, ${unclear} manuell zu prüfen.`);
      });
    });
  };

  window.refreshChatAssignments = function refreshChatAssignmentsPatched() {
    if (!state.chatMessages.length) return;
    state.chatMessages = state.chatMessages
      .map((message, index) => window.enrichChatMessage(message, index))
      .filter(message => message.text);
    window.renderChatMessages();
    const selected = state.chatMessages.filter(message => message.selected).length;
    const unclear = state.chatMessages.filter(message => message.assignmentStatus === "unclear").length;
    setChatStatus(`${state.chatMessages.length} Nachrichten importiert, ${selected} ausgewählt, ${unclear} manuell zu prüfen.`);
    save();
  };

  try {
    chatReportCandidates = window.chatReportCandidates;
    matchingReportsForChatMessage = window.matchingReportsForChatMessage;
    enrichChatMessage = window.enrichChatMessage;
    refreshChatAssignments = window.refreshChatAssignments;
    renderChatMessages = window.renderChatMessages;
    if (typeof state !== "undefined" && typeof defaultSourceUrl !== "undefined" && (!state.sourceUrl || /\/wa\/(?:teamPortrait|groupPage)\?/i.test(state.sourceUrl))) {
      state.sourceUrl = defaultSourceUrl;
      if (typeof els !== "undefined" && els.sourceUrl) els.sourceUrl.value = defaultSourceUrl;
      if (typeof save === "function") save();
    }
    ensureChatAssignmentStyles();
    ensureReviewLoopUi();
    patchLoginForReviewLoop();
    patchPrintReportFormat();
  } catch (error) {
    console.warn("SGA chat assignment patch could not replace all functions:", error);
  }

  window.addEventListener("DOMContentLoaded", () => {
    ensureChatAssignmentStyles();
    ensureReviewLoopUi();
    patchLoginForReviewLoop();
    patchPrintReportFormat();
    if (!window.__sgaChatAssignmentPatchBound && typeof els !== "undefined") {
      window.__sgaChatAssignmentPatchBound = true;
      els.reportList?.addEventListener("change", () => window.setTimeout(window.refreshChatAssignments, 0));
      els.selectAllReports?.addEventListener("click", () => window.setTimeout(window.refreshChatAssignments, 0));
      els.clearReportSelection?.addEventListener("click", () => window.setTimeout(window.refreshChatAssignments, 0));
      els.chatMessageList?.addEventListener("change", event => {
        const input = event.target.closest("input[data-chat-index]");
        if (!input) return;
        const index = Number(input.dataset.chatIndex);
        if (state.chatMessages[index]) state.chatMessages[index].manualSelected = true;
      }, true);
    }
  });
}());
