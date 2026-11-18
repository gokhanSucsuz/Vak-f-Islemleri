import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  AlignmentType,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  Footer,
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
    bold:
      el.style.fontWeight === "normal" || el.style.fontWeight === "400"
        ? false
        : style.bold ||
          tag === "strong" ||
          tag === "b" ||
          el.style.fontWeight === "bold" ||
          Number(el.style.fontWeight) >= 600,
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

function cssLengthToTwips(val: string | undefined): number | undefined {
  if (!val) return undefined;
  const trimmed = val.trim().toLowerCase();
  const num = parseFloat(trimmed);
  if (isNaN(num) || num <= 0) return undefined;
  if (trimmed.endsWith("cm")) return Math.round(num * 567);
  if (trimmed.endsWith("mm")) return Math.round(num * 56.7);
  if (trimmed.endsWith("in")) return Math.round(num * 1440);
  if (trimmed.endsWith("px")) return Math.round(num * 15);
  return Math.round(num * 20); // pt default
}

function getParagraphIndent(el: HTMLElement) {
  const firstLine = cssLengthToTwips(el.style.textIndent);
  const left = cssLengthToTwips(el.style.paddingLeft || el.style.marginLeft);
  if (!firstLine && !left) return undefined;
  return {
    ...(firstLine ? { firstLine } : {}),
    ...(left ? { left } : {}),
  };
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
      const tableBorderless =
        el.getAttribute("data-borderless") === "true" ||
        el.style.borderStyle === "none" ||
        el.style.border === "none" ||
        el.style.borderWidth === "0px";
      const rows = Array.from(el.querySelectorAll("tr")).map((tr) => {
        const rowUpper = (tr.textContent || "").trim().toLocaleUpperCase("tr-TR");
        const minCellLines = !tableBorderless ? (/\b[İI]MZA\b/.test(rowUpper) ? 3 : 2) : 1;
        const cells = Array.from(tr.querySelectorAll("th, td")).map((td) => {
          const tdEl = td as HTMLElement;
          const cellBorderless =
            tableBorderless ||
            tdEl.style.borderStyle === "none" ||
            tdEl.style.border === "none" ||
            tdEl.style.borderWidth === "0px";
          const isHeaderCell = td.tagName.toLowerCase() === "th";
          const cellParagraphs = Array.from(td.querySelectorAll("p"));
          const childrenParagraphs =
            cellParagraphs.length > 0
              ? cellParagraphs.map((pEl) => {
                  const pRuns = collectTextRuns(pEl, { bold: isHeaderCell });
                  return new Paragraph({
                    alignment: getAlignment(pEl as HTMLElement),
                    children: pRuns.length ? pRuns : [new TextRun("")],
                  });
                })
              : [
                  (() => {
                    const runs = collectTextRuns(td, { bold: isHeaderCell });
                    return new Paragraph({
                      children: runs.length ? runs : [new TextRun("")],
                    });
                  })(),
                ];
          while (childrenParagraphs.length < minCellLines) {
            childrenParagraphs.push(new Paragraph({ children: [new TextRun("")] }));
          }
          const borderDef = cellBorderless
            ? { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
            : { style: BorderStyle.SINGLE, size: 4, color: "94A3B8" };
          return new TableCell({
            children: childrenParagraphs,
            borders: {
              top: borderDef,
              bottom: borderDef,
              left: borderDef,
              right: borderDef,
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
      // "SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞINA" + "EDİRNE" özel hizalı başlık bloğu
      const rawUpper = (el.textContent || "").trim().toLocaleUpperCase("tr-TR");
      if (
        tag === "div" &&
        rawUpper.includes("SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞINA") &&
        rawUpper.includes("EDİRNE")
      ) {
        const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
        const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
        blocks.push(
          new Table({
            alignment: AlignmentType.CENTER,
            width: { size: 6200, type: WidthType.DXA },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    borders: cellBorders,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: 20 },
                        children: [
                          new TextRun({
                            text: "SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞINA",
                            bold: true,
                            font: "Calibri",
                            size: 22,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    borders: cellBorders,
                    children: [
                      new Paragraph({
                        alignment: AlignmentType.RIGHT,
                        spacing: { after: 240 },
                        children: [
                          new TextRun({
                            text: "EDİRNE",
                            bold: true,
                            font: "Calibri",
                            size: 22,
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              }),
            ],
          })
        );
        return;
      }

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

      const isPetitionIntro = /muhtaçlığım\s+nedeniyle/i.test(rawUpper);
      const isBilgilerinizeArz = /bilgilerinize\s+arz\s+ederim/i.test(rawUpper);
      const marginBefore = cssLengthToTwips(el.style.marginTop);
      const marginAfter = cssLengthToTwips(el.style.marginBottom);
      const introRaw = (el.textContent || "").trim();
      const introLower =
        introRaw.charAt(0).toLocaleUpperCase("tr-TR") +
        introRaw
          .slice(1)
          .toLocaleLowerCase("tr-TR")
          .replace(/\bvakfınızca\b/g, "Vakfınızca")
          .replace(/\bkanun\b/g, "Kanun");
      const runs = isPetitionIntro
        ? [
            new TextRun({
              text: introLower,
              font: "Calibri",
              size: 18, // 9pt (başlıktan küçük punto)
            }),
          ]
        : collectTextRuns(el);
      blocks.push(
        new Paragraph({
          alignment: getAlignment(el),
          indent: getParagraphIndent(el),
          children: runs.length ? runs : [new TextRun("")],
          spacing: isPetitionIntro
            ? { before: 240, after: 240 }
            : isBilgilerinizeArz
            ? {
                ...(marginBefore ? { before: marginBefore } : {}),
                after: Math.max(marginAfter || 0, 1440), // En az 6 satır boşluk
              }
            : {
                ...(marginBefore ? { before: marginBefore } : {}),
                after: marginAfter || 100,
              },
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

export async function downloadPetitionAsDocx(
  htmlContent: string,
  fileBaseName: string,
  staffInfo?: { name?: string; title?: string }
) {
  const children = htmlToDocxChildren(htmlContent);

  const staffName = staffInfo?.name?.trim() || "Personel";
  const staffTitle = staffInfo?.title?.trim() || "Personel";
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const footerCells = [
    new TableCell({
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "Babademirtaş Mahallesi Sebil Sokak No:15/EDİRNE",
              font: "Calibri",
              size: 18,
              color: "64748B",
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Telefon No: 0 (284) 2120957 Faks No: 0(284) 2120957",
              font: "Calibri",
              size: 18,
              color: "64748B",
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "e-Posta: edirnesydv@gmail.com",
              font: "Calibri",
              size: 18,
              color: "64748B",
            }),
          ],
        }),
      ],
    }),
    new TableCell({
      borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
      children: [
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({
              text: `Bilgi için: ${staffName}`,
              font: "Calibri",
              size: 18,
              color: "64748B",
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({
              text: staffTitle,
              font: "Calibri",
              size: 18,
              color: "64748B",
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.LEFT,
          children: [
            new TextRun({
              text: "Telefon No: 0 (284) 2120957",
              font: "Calibri",
              size: 18,
              color: "64748B",
            }),
          ],
        }),
      ],
    }),
  ];

  const footerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: footerCells })],
  });

  try {
    const res = await fetch("/logo-vakif.jpg");
    if (res.ok) {
      const arrayBuffer = await res.arrayBuffer();
      const logoParagraph = new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 140 },
        children: [
          new ImageRun({
            data: new Uint8Array(arrayBuffer),
            transformation: { width: 58, height: 58 },
            type: "jpg",
          }),
        ],
      });
      children.unshift(logoParagraph);
    }
  } catch {
    // Logo fetch fail olsa bile Word indirme işlemi devam etsin
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 794, // ~14mm
              right: 850, // ~15mm
              bottom: 1134, // ~20mm (footer alanı dahil)
              left: 850, // ~15mm
            },
          },
        },
        footers: {
          default: new Footer({
            children: [footerTable],
          }),
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
