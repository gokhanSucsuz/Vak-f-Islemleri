import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
} from "docx";

type RunStyle = {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
};

function collectTextRuns(node: Node, style: RunStyle = {}): TextRun[] {
  const runs: TextRun[] = [];

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent || "";
    if (text) {
      runs.push(
        new TextRun({
          text,
          bold: style.bold,
          italics: style.italics,
          underline: style.underline ? {} : undefined,
          font: "Calibri",
          size: 22, // 11pt
        })
      );
    }
    return runs;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return runs;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (tag === "br") {
    runs.push(new TextRun({ break: 1 }));
    return runs;
  }

  const nextStyle: RunStyle = {
    bold: style.bold || tag === "strong" || tag === "b" || el.style.fontWeight === "bold",
    italics: style.italics || tag === "em" || tag === "i" || el.style.fontStyle === "italic",
    underline:
      style.underline ||
      tag === "u" ||
      (el.style.textDecoration || "").includes("underline"),
  };

  for (const child of Array.from(el.childNodes)) {
    runs.push(...collectTextRuns(child, nextStyle));
  }

  return runs;
}

function getAlignment(el: HTMLElement) {
  const align = (el.style.textAlign || el.getAttribute("align") || "").toLowerCase();
  if (align === "center") return AlignmentType.CENTER;
  if (align === "right") return AlignmentType.RIGHT;
  if (align === "justify") return AlignmentType.JUSTIFIED;
  return AlignmentType.LEFT;
}

function htmlToDocxChildren(html: string): Array<Paragraph | Table> {
  const container = document.createElement("div");
  container.innerHTML = html || "<p></p>";

  const blocks: Array<Paragraph | Table> = [];

  const processNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = (node.textContent || "").trim();
      if (txt) {
        blocks.push(
          new Paragraph({
            children: [new TextRun({ text: txt, font: "Calibri", size: 22 })],
          })
        );
      }
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();

    if (tag === "table") {
      const rows = Array.from(el.querySelectorAll("tr")).map((tr) => {
        const cells = Array.from(tr.querySelectorAll("th, td")).map((td) => {
          const runs = collectTextRuns(td, {
            bold: td.tagName.toLowerCase() === "th",
          });
          return new TableCell({
            children: [
              new Paragraph({
                children: runs.length ? runs : [new TextRun("")],
              }),
            ],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" },
            },
          });
        });
        return new TableRow({ children: cells });
      });

      if (rows.length > 0) {
        blocks.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          })
        );
      }
      return;
    }

    if (tag === "ul" || tag === "ol") {
      const items = Array.from(el.children).filter(
        (c) => c.tagName.toLowerCase() === "li"
      );
      items.forEach((li, idx) => {
        const prefix = tag === "ol" ? `${idx + 1}. ` : "• ";
        const runs = collectTextRuns(li);
        blocks.push(
          new Paragraph({
            children: [
              new TextRun({ text: prefix, bold: true, font: "Calibri", size: 22 }),
              ...runs,
            ],
            spacing: { after: 80 },
          })
        );
      });
      return;
    }

    if (tag === "h1" || tag === "h2" || tag === "h3") {
      const runs = collectTextRuns(el, { bold: true });
      blocks.push(
        new Paragraph({
          heading:
            tag === "h1"
              ? HeadingLevel.HEADING_1
              : tag === "h2"
              ? HeadingLevel.HEADING_2
              : HeadingLevel.HEADING_3,
          alignment: getAlignment(el),
          children: runs.length ? runs : [new TextRun("")],
          spacing: { before: 120, after: 120 },
        })
      );
      return;
    }

    if (tag === "p" || tag === "div" || tag === "blockquote") {
      // Eğer içinde başka blok elemanları varsa alt elemanları işle
      const hasBlockChildren = Array.from(el.children).some((c) =>
        ["p", "div", "h1", "h2", "h3", "ul", "ol", "table"].includes(
          c.tagName.toLowerCase()
        )
      );
      if (hasBlockChildren) {
        Array.from(el.childNodes).forEach(processNode);
        return;
      }

      const runs = collectTextRuns(el);
      blocks.push(
        new Paragraph({
          alignment: getAlignment(el),
          children: runs.length ? runs : [new TextRun("")],
          spacing: { after: 100 },
        })
      );
      return;
    }

    const fallbackRuns = collectTextRuns(el);
    if (fallbackRuns.length > 0) {
      blocks.push(new Paragraph({ children: fallbackRuns }));
    }
  };

  Array.from(container.childNodes).forEach(processNode);

  if (blocks.length === 0) {
    blocks.push(new Paragraph({ children: [new TextRun("")] }));
  }

  return blocks;
}

export async function downloadPetitionAsDocx(htmlContent: string, fileBaseName: string) {
  const children = htmlToDocxChildren(htmlContent);
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1134, // ~20mm
              right: 1134,
              bottom: 1134,
              left: 1134,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (fileBaseName || "Dilekce").replace(/[\\/:*?"<>|]/g, "_");
  a.href = url;
  a.download = `${safeName}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
