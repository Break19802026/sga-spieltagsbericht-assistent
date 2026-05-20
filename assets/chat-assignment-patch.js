(function () {
  function normalizeMatchText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/([a-z]+|[dh])\s*(\d{2})\s*(iii|ii|iv|v|i)\b/g, (_, prefix, age, roman) => `${prefix}${age}${({ i: "1", ii: "2", iii: "3", iv: "4", v: "5" }[roman] || roman)}`)
      .replace(/\b(i{1,3}|iv|v)\b/g, match => ({ i: "1", ii: "2", iii: "3", iv: "4", v: "5" }[match] || match))
      .replace(/u\s*8\s*\+/g, "u8+")
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
    if (/\brlsw\b|regionalliga/.test(normalized)) aliases.push("Regionalliga", "Regionalliga Südwest");
    if (/\bswl\b|\bsuedwest\b|\bsudwest\b|südwest/.test(normalized)) aliases.push("Südwest-Liga", "Suedwest Liga");
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

  function reportByKey(key) {
    if (!key || !Array.isArray(state.reports)) return null;
    return state.reports.find((report, index) => reportKey(report, index) === key) || null;
  }

  function allReportOptions() {
    return Array.isArray(state.reports) ? state.reports.map((report, index) => ({ report, key: reportKey(report, index), label: reportLabel(report) })) : [];
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
          addCandidate(candidates, `${word} ${info.age} ${level}`, 145);
          addCandidate(candidates, `${word}${info.age} ${level}`, 145);
        }
        if (info.suffix) {
          addCandidate(candidates, `${word} ${info.age} ${info.suffix}`, 125);
          addCandidate(candidates, `${word}${info.age}${info.suffix}`, 125);
        }
      }
      for (const letter of new Set(shortLetters)) {
        addCandidate(candidates, `${letter}${info.age}`, 100);
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
    `;
    document.head.appendChild(style);
  }

  function assignmentOptionsForMessage(message) {
    const options = allReportOptions();
    if (message.assignmentStatus !== "unclear") return options;
    const possibleKeys = new Set(Array.isArray(message.possibleReportKeys) ? message.possibleReportKeys : []);
    if (possibleKeys.size) return options.filter(option => possibleKeys.has(option.key));
    return options;
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
  } catch (error) {
    console.warn("SGA chat assignment patch could not replace all functions:", error);
  }

  window.addEventListener("DOMContentLoaded", () => {
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
