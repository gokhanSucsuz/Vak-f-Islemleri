import JSZip from "jszip";
import mammoth from "mammoth";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getAttr(tagAttrs: string, name: string): string | null {
  const regex = new RegExp(`(?:w:)?${name}=["']([^"']*)["']`, "i");
  const m = tagAttrs.match(regex);
  return m ? m[1] : null;
}

/**
 * Hafif, bağımlılıksız XML düğüm ayrıştırıcısı (word/document.xml için)
 */
interface XmlNode {
  tag: string;
  attrs: string;
  children: XmlNode[];
  text: string;
}

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: "root", attrs: "", children: [], text: "" };
  const stack: XmlNode[] = [root];
  const tokenRegex = /<(\/?)([\w:]+)([^>]*)>|([^<]+)/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(xml)) !== null) {
    if (match[4] !== undefined) {
      const parent = stack[stack.length - 1];
      parent.text += match[4];
    } else {
      const isClose = match[1] === "/";
      const tag = match[2];
      const rawAttrs = match[3] || "";
      const isSelfClosing = rawAttrs.trim().endsWith("/");

      if (isClose) {
        if (stack.length > 1 && stack[stack.length - 1].tag === tag) {
          stack.pop();
        }
      } else {
        const node: XmlNode = {
          tag,
          attrs: isSelfClosing ? rawAttrs.slice(0, -1) : rawAttrs,
          children: [],
          text: "",
        };
        stack[stack.length - 1].children.push(node);
        if (!isSelfClosing) {
          stack.push(node);
        }
      }
    }
  }
  return root;
}

function findChild(node: XmlNode, tag: string): XmlNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

function findChildren(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((c) => c.tag === tag);
}

function renderRun(rNode: XmlNode): string {
  const rPr = findChild(rNode, "w:rPr");
  let bold = false;
  let italic = false;
  let underline = false;
  let fontSizePt: number | null = null;
  let color: string | null = null;

  if (rPr) {
    const bNode = findChild(rPr, "w:b");
    if (bNode && getAttr(bNode.attrs, "val") !== "0" && getAttr(bNode.attrs, "val") !== "false") {
      bold = true;
    }
    const iNode = findChild(rPr, "w:i");
    if (iNode && getAttr(iNode.attrs, "val") !== "0" && getAttr(iNode.attrs, "val") !== "false") {
      italic = true;
    }
    const uNode = findChild(rPr, "w:u");
    if (uNode && getAttr(uNode.attrs, "val") !== "none") {
      underline = true;
    }
    const szNode = findChild(rPr, "w:sz");
    if (szNode) {
      const val = parseInt(getAttr(szNode.attrs, "val") || "", 10);
      if (!isNaN(val) && val > 0) fontSizePt = val / 2;
    }
    const cNode = findChild(rPr, "w:color");
    if (cNode) {
      const cVal = getAttr(cNode.attrs, "val");
      if (cVal && cVal !== "auto" && /^[0-9a-fA-F]{6}$/.test(cVal)) {
        color = `#${cVal}`;
      }
    }
  }

  let inner = "";
  for (const ch of rNode.children) {
    if (ch.tag === "w:t") {
      inner += escapeHtml(ch.text);
    } else if (ch.tag === "w:tab") {
      inner += "&emsp;&emsp;&emsp;";
    } else if (ch.tag === "w:br") {
      inner += "<br/>";
    }
  }

  if (!inner) return "";

  const styles: string[] = [];
  if (fontSizePt) styles.push(`font-size:${fontSizePt}pt`);
  if (color) styles.push(`color:${color}`);
  if (bold) styles.push("font-weight:bold");
  if (italic) styles.push("font-style:italic");
  if (underline) styles.push("text-decoration:underline");

  if (styles.length === 0) return inner;
  return `<span style="${styles.join(";")}">${inner}</span>`;
}

function renderParagraph(pNode: XmlNode, inTable = false): string {
  const pPr = findChild(pNode, "w:pPr");
  const styles: string[] = [];

  if (inTable) {
    styles.push("margin:0");
  } else {
    styles.push("margin:0 0 4pt 0");
  }

  if (pPr) {
    const jc = findChild(pPr, "w:jc");
    if (jc) {
      const val = (getAttr(jc.attrs, "val") || "").toLowerCase();
      if (val === "center") styles.push("text-align:center");
      else if (val === "right") styles.push("text-align:right");
      else if (val === "both" || val === "distribute") styles.push("text-align:justify");
      else if (val === "left") styles.push("text-align:left");
    }

    const ind = findChild(pPr, "w:ind");
    if (ind) {
      const left = parseInt(getAttr(ind.attrs, "left") || "", 10);
      const firstLine = parseInt(getAttr(ind.attrs, "firstLine") || "", 10);
      if (!isNaN(left) && left > 0) styles.push(`padding-left:${(left / 20).toFixed(1)}pt`);
      if (!isNaN(firstLine) && firstLine > 0) {
        styles.push(`text-indent:${(firstLine / 20).toFixed(1)}pt`);
      }
    }
  }

  let content = "";
  for (const ch of pNode.children) {
    if (ch.tag === "w:r") {
      content += renderRun(ch);
    } else if (ch.tag === "w:hyperlink") {
      for (const hr of findChildren(ch, "w:r")) {
        content += renderRun(hr);
      }
    }
  }

  if (!content.trim()) {
    content = "&nbsp;";
  }

  return `<p style="${styles.join(";")}">${content}</p>`;
}

function hasVisibleBorders(bordersNode?: XmlNode): boolean | null {
  if (!bordersNode) return null;
  const sides = ["w:top", "w:bottom", "w:left", "w:right", "w:insideH", "w:insideV"];
  let foundAny = false;
  for (const side of sides) {
    const b = findChild(bordersNode, side);
    if (b) {
      foundAny = true;
      const val = (getAttr(b.attrs, "val") || "").toLowerCase();
      if (val && val !== "none" && val !== "nil") {
        return true;
      }
    }
  }
  return foundAny ? false : null;
}

function renderTable(tblNode: XmlNode): string {
  const rows = findChildren(tblNode, "w:tr");
  if (rows.length === 0) return "";

  const tblPr = findChild(tblNode, "w:tblPr");
  const tblBorders = tblPr ? findChild(tblPr, "w:tblBorders") : undefined;
  const tableHasBorders = hasVisibleBorders(tblBorders);

  const tblGrid = findChild(tblNode, "w:tblGrid");
  const gridCols = tblGrid ? findChildren(tblGrid, "w:gridCol") : [];
  const colWidths = gridCols.map((c) => parseInt(getAttr(c.attrs, "w") || "0", 10));
  const totalGridW = colWidths.reduce((a, b) => a + b, 0);

  let html = `<table${tableHasBorders === false ? ' data-borderless="true"' : ""} style="width:100%;border-collapse:collapse;margin:8pt 0;table-layout:fixed">`;

  for (const tr of rows) {
    html += `<tr>`;
    const cells = findChildren(tr, "w:tc");
    let colIdx = 0;

    for (const tc of cells) {
      const tcPr = findChild(tc, "w:tcPr");
      let colspan = 1;
      let widthStyle = "";
      let vAlign = "middle";

      if (tcPr) {
        const gs = findChild(tcPr, "w:gridSpan");
        if (gs) {
          const span = parseInt(getAttr(gs.attrs, "val") || "1", 10);
          if (!isNaN(span) && span > 1) colspan = span;
        }
        const tcW = findChild(tcPr, "w:tcW");
        if (tcW) {
          const wVal = parseInt(getAttr(tcW.attrs, "w") || "0", 10);
          const wType = getAttr(tcW.attrs, "type") || "dxa";
          if (wType === "pct" && wVal > 0) {
            widthStyle = `width:${(wVal / 50).toFixed(1)}%;`;
          } else if (wType === "dxa" && totalGridW > 0 && wVal > 0) {
            widthStyle = `width:${((wVal / totalGridW) * 100).toFixed(1)}%;`;
          }
        } else if (totalGridW > 0 && colWidths[colIdx]) {
          let sumW = 0;
          for (let k = 0; k < colspan; k++) sumW += colWidths[colIdx + k] || 0;
          if (sumW > 0) widthStyle = `width:${((sumW / totalGridW) * 100).toFixed(1)}%;`;
        }

        const va = findChild(tcPr, "w:vAlign");
        if (va) {
          const vVal = (getAttr(va.attrs, "val") || "").toLowerCase();
          if (vVal === "top" || vVal === "bottom" || vVal === "center") {
            vAlign = vVal === "center" ? "middle" : vVal;
          }
        }
      }

      colIdx += colspan;

      const cellParts: string[] = [];
      for (const ch of tc.children) {
        if (ch.tag === "w:p") {
          cellParts.push(renderParagraph(ch, true));
        } else if (ch.tag === "w:tbl") {
          cellParts.push(renderTable(ch));
        }
      }

      const nonEmptyParts = cellParts.filter((part) => {
        const stripped = part.replace(/<[^>]+>/g, "").replace(/&nbsp;|\s/g, "");
        return stripped.length > 0 || part.includes("<table");
      });
      const cellInner =
        nonEmptyParts.length > 0 ? nonEmptyParts.join("") : cellParts[0] || "<p>&nbsp;</p>";

      const cellBorders = tcPr ? hasVisibleBorders(findChild(tcPr, "w:tcBorders")) : null;
      const showCellBorder =
        tableHasBorders === false ? cellBorders === true : cellBorders !== false;
      const borderStyle = showCellBorder ? "border:1.5px solid #000;" : "border:none;";

      html += `<td${colspan > 1 ? ` colspan="${colspan}"` : ""} style="${borderStyle}padding:5pt 7pt;vertical-align:${vAlign};${widthStyle}">${cellInner}</td>`;
    }

    html += `</tr>`;
  }

  html += `</table>`;
  return html;
}

function alignEdirneHeader(html: string): string {
  // "SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞINA" + altındaki "EDİRNE" ifadesini
  // BAŞKANLIĞINA kelimesinin en sağına hizalar.
  return html.replace(
    /<p[^>]*>[\s\S]*?(SOSYAL\s+YARDIMLAŞMA\s+VE\s+DAYANIŞMA\s+VAKFI\s+BAŞKANLIĞINA)[\s\S]*?<\/p>\s*<p[^>]*>[\s\S]*?(EDİRNE)[\s\S]*?<\/p>/i,
    (_m, titleText, cityText) =>
      `<div style="width:fit-content;margin:0 auto 6pt auto;text-align:center;"><div style="font-weight:bold;">${titleText.trim()}</div><div style="text-align:right;font-weight:bold;">${cityText.trim()}</div></div>`
  ).replace(
    /<p[^>]*>[\s\S]*?(SOSYAL\s+YARDIMLAŞMA\s+VE\s+DAYANIŞMA\s+VAKFI\s+BAŞKANLIĞINA)[\s\S]*?<br\s*\/?>[\s\S]*?(EDİRNE)[\s\S]*?<\/p>/i,
    (_m, titleText, cityText) =>
      `<div style="width:fit-content;margin:0 auto 6pt auto;text-align:center;"><div style="font-weight:bold;">${titleText.trim()}</div><div style="text-align:right;font-weight:bold;">${cityText.trim()}</div></div>`
  );
}

export async function convertDocxBufferToStyledHtml(buffer: Buffer): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(buffer);
    const docXmlFile = zip.file("word/document.xml");
    if (docXmlFile) {
      const xmlText = await docXmlFile.async("string");
      const root = parseXml(xmlText);
      const docNode = findChild(root, "w:document");
      const bodyNode = docNode ? findChild(docNode, "w:body") : undefined;

      if (bodyNode) {
        let html = "";
        for (const ch of bodyNode.children) {
          if (ch.tag === "w:p") {
            html += renderParagraph(ch, false);
          } else if (ch.tag === "w:tbl") {
            html += renderTable(ch);
          }
        }
        if (html.trim()) return alignEdirneHeader(html);
      }
    }
  } catch (err) {
    console.warn("docxToHtml XML parser fallback to mammoth:", err);
  }

  const fallback = await mammoth.convertToHtml({ buffer });
  return alignEdirneHeader((fallback.value || "").trim() || "<p></p>");
}
