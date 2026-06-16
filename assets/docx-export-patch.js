(function () {
  function xmlEscape(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function docxRunsFromMarkdown(line, baseBold = false) {
    const runs = [];
    const source = String(line || "").replace(/^#{1,6}\s+/, "");
    const regex = /\*\*([\s\S]+?)\*\*/g;
    let lastIndex = 0;
    let match;
    const pushRun = (text, bold) => {
      if (!text) return;
      runs.push(`<w:r><w:rPr>${bold ? "<w:b/>" : ""}</w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`);
    };
    while ((match = regex.exec(source)) !== null) {
      pushRun(source.slice(lastIndex, match.index), baseBold);
      pushRun(match[1], true);
      lastIndex = match.index + match[0].length;
    }
    pushRun(source.slice(lastIndex), baseBold);
    return runs.length ? runs.join("") : "<w:r><w:t></w:t></w:r>";
  }

  function docxParagraph(line, type = "normal") {
    const isTitle = type === "title";
    const isHeading = type === "heading";
    const size = isTitle ? "28" : "22";
    const after = isTitle ? "220" : isHeading ? "120" : "160";
    return `<w:p><w:pPr><w:spacing w:after="${after}" w:line="276" w:lineRule="auto"/><w:rPr>${isTitle || isHeading ? "<w:b/>" : ""}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr></w:pPr>${docxRunsFromMarkdown(line, isTitle || isHeading)}</w:p>`;
  }

  function reportToDocxDocumentXml(text) {
    const lines = String(text || "").replace(/\r/g, "").split(/\n/);
    const paragraphs = [];
    let titleSeen = false;
    let firstContentSeen = false;
    let contentCount = 0;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        if (firstContentSeen) paragraphs.push('<w:p><w:pPr><w:spacing w:after="120"/></w:pPr></w:p>');
        continue;
      }
      if (!titleSeen && contentCount <= 2 && typeof looksLikeReportTitle === "function" && looksLikeReportTitle(line)) {
        paragraphs.push(docxParagraph(line, "title"));
        firstContentSeen = true;
        titleSeen = true;
        contentCount += 1;
        continue;
      }
      if (typeof looksLikeSectionHeading === "function" && looksLikeSectionHeading(line)) {
        paragraphs.push(docxParagraph(line.replace(/:\s*$/, ""), "heading"));
        firstContentSeen = true;
        contentCount += 1;
        continue;
      }
      paragraphs.push(docxParagraph(/^[-*]\s+/.test(line) ? `• ${line.replace(/^[-*]\s+/, "")}` : line));
      firstContentSeen = true;
      contentCount += 1;
    }
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${paragraphs.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }

  function crc32(bytes) {
    if (!crc32.table) {
      crc32.table = Array.from({ length: 256 }, (_, index) => {
        let crc = index;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
        return crc >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (const byte of bytes) crc = (crc >>> 8) ^ crc32.table[(crc ^ byte) & 0xff];
    return (crc ^ 0xffffffff) >>> 0;
  }

  function createZipBlob(files) {
    const encoder = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const now = new Date();
    const zipTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | (Math.floor(now.getSeconds() / 2) & 31);
    const zipDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const push16 = (arr, value) => arr.push(value & 255, (value >>> 8) & 255);
    const push32 = (arr, value) => arr.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255);
    files.forEach(file => {
      const nameBytes = encoder.encode(file.name);
      const data = typeof file.content === "string" ? encoder.encode(file.content) : file.content;
      const checksum = crc32(data);
      const local = [];
      push32(local, 0x04034b50); push16(local, 20); push16(local, 0); push16(local, 0); push16(local, zipTime); push16(local, zipDate);
      push32(local, checksum); push32(local, data.length); push32(local, data.length); push16(local, nameBytes.length); push16(local, 0);
      chunks.push(new Uint8Array(local), nameBytes, data);
      const header = [];
      push32(header, 0x02014b50); push16(header, 20); push16(header, 20); push16(header, 0); push16(header, 0); push16(header, zipTime); push16(header, zipDate);
      push32(header, checksum); push32(header, data.length); push32(header, data.length); push16(header, nameBytes.length); push16(header, 0); push16(header, 0); push16(header, 0); push16(header, 0); push32(header, 0); push32(header, offset);
      central.push(new Uint8Array(header), nameBytes);
      offset += local.length + nameBytes.length + data.length;
    });
    const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
    const end = [];
    push32(end, 0x06054b50); push16(end, 0); push16(end, 0); push16(end, files.length); push16(end, files.length); push32(end, centralSize); push32(end, offset); push16(end, 0);
    return new Blob([...chunks, ...central, new Uint8Array(end)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  }

  function createDocxBlob(text) {
    return createZipBlob([
      { name: "[Content_Types].xml", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name: "_rels/.rels", content: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: "word/document.xml", content: reportToDocxDocumentXml(text) }
    ]);
  }

  function patchWordExport() {
    const button = document.getElementById("downloadFormatted");
    if (button) button.textContent = "Bericht als Worddatei speichern";
    if (!button) return;
    if (window.__sgaDocxDownloadHandler) button.removeEventListener("click", window.__sgaDocxDownloadHandler);
    if (typeof downloadFormattedReport === "function" && downloadFormattedReport !== window.__sgaDocxDownloadHandler) {
      button.removeEventListener("click", downloadFormattedReport);
    }
    const handler = function downloadFormattedDocxReport() {
      const text = (els.generatedOutput.value || state.generatedText || "").trim();
      if (!text) {
        els.generateStatus.textContent = "Bitte zuerst einen Bericht generieren oder einfügen.";
        els.generateStatus.classList.add("error");
        return;
      }
      const blob = createDocxBlob(text);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = typeof exportFileName === "function" ? exportFileName("Bericht-formatiert").replace(/\.[^.]+$/i, ".docx") : "SGA-Bericht.docx";
      link.click();
      URL.revokeObjectURL(url);
      showToast("Worddatei erstellt");
    };
    downloadFormattedReport = handler;
    window.__sgaDocxDownloadHandler = handler;
    button.addEventListener("click", handler);
    window.__sgaDocxExportPatched = true;
  }

  patchWordExport();
  window.addEventListener("DOMContentLoaded", patchWordExport);
}());
