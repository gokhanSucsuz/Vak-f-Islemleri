"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import {
  FileText,
  FilePlus2,
  FileCheck2,
  UploadCloud,
  Search,
  X,
  Printer,
  Download,
  Save,
  Eye,
  Edit3,
  Trash2,
  CopyPlus,
  ArrowLeft,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Undo2,
  Redo2,
  SlidersHorizontal,
  User as UserIcon,
  Calendar,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import ModernConfirmDialog, { DialogType } from "@/components/ModernConfirmDialog";

interface TemplateInfo {
  _id: string;
  type: "detayli" | "matbu";
  fileName: string;
  fileSize: number;
  htmlContent: string;
  uploadedBy?: { name: string; email: string };
  updatedAt: string;
}

interface PetitionRecord {
  _id: string;
  petitionType: "detayli" | "matbu";
  citizenName: string;
  tcNo: string;
  subject?: string;
  originalSize?: number;
  createdBy?: { _id: string; name: string; email: string; title?: string };
  updatedBy?: { _id: string; name: string; email: string };
  createdAt: string;
  updatedAt: string;
}

function highlightMatch(text: string, query: string): React.ReactNode {
  const clean = query.trim();
  if (!clean || !text) return text;
  const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="bg-amber-200/90 text-slate-950 font-bold rounded px-0.5">
          {part}
        </mark>
      ) : (
        part
      )
    );
  } catch {
    return text;
  }
}

export default function PetitionsPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  const isSuperAdmin = userRole === "superadmin";
  const isManager =
    userRole === "superadmin" ||
    userRole === "manager" ||
    Boolean((session?.user as any)?.authorizedModules?.includes("petitions"));

  // Templates
  const [templates, setTemplates] = useState<{
    detayli: TemplateInfo | null;
    matbu: TemplateInfo | null;
  }>({ detayli: null, matbu: null });
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [uploadingType, setUploadingType] = useState<"detayli" | "matbu" | null>(null);
  const detayliInputRef = useRef<HTMLInputElement>(null);
  const matbuInputRef = useRef<HTMLInputElement>(null);

  // List & Search State
  const [petitions, setPetitions] = useState<PetitionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "detayli" | "matbu">("all");
  const [sortBy, setSortBy] = useState<"date_desc" | "date_asc" | "name_asc" | "name_desc">(
    "date_desc"
  );
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [stats, setStats] = useState({ totalCount: 0, detayliCount: 0, matbuCount: 0 });

  // Editor Workspace State (Sayfa içi Word Editörü)
  const [editorMode, setEditorMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorType, setEditorType] = useState<"detayli" | "matbu">("detayli");
  const [citizenName, setCitizenName] = useState("");
  const [tcNo, setTcNo] = useState("");
  const [subject, setSubject] = useState("");
  const [editorInitialHtml, setEditorInitialHtml] = useState("");
  const [editorStaffInfo, setEditorStaffInfo] = useState<{ name: string; title: string }>({
    name: "",
    title: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Preview Modal State
  const [previewPetition, setPreviewPetition] = useState<
    (PetitionRecord & { htmlContent: string }) | null
  >(null);
  const [loadingContentId, setLoadingContentId] = useState<string | null>(null);

  // Confirm Dialog
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: React.ReactNode;
    type: DialogType;
    onConfirm?: () => void;
    isLoading?: boolean;
  }>({ isOpen: false, title: "", message: null, type: "danger" });

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Yazdırma işlemi öncesinde ekrandaki tüm bildirim/bilgi balonlarını temizle
  useEffect(() => {
    const handleBeforePrint = () => {
      toast.dismiss();
    };
    window.addEventListener("beforeprint", handleBeforePrint);
    return () => window.removeEventListener("beforeprint", handleBeforePrint);
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/petitions/templates");
      if (!res.ok) return;
      const data = await res.json();
      const map: { detayli: TemplateInfo | null; matbu: TemplateInfo | null } = {
        detayli: null,
        matbu: null,
      };
      for (const tpl of data.templates || []) {
        if (tpl.type === "detayli") map.detayli = tpl;
        if (tpl.type === "matbu") map.matbu = tpl;
      }
      setTemplates(map);
    } catch {
      /* ignore */
    }
  }, []);

  const fetchPetitions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: "25",
        type: typeFilter,
        sortBy,
      });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());

      const res = await fetch(`/api/petitions?${params.toString()}`);
      if (!res.ok) throw new Error("Dilekçeler alınamadı");
      const data = await res.json();
      setPetitions(data.petitions || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotalRecords(data.pagination?.totalRecords || 0);
      setStats(data.stats || { totalCount: 0, detayliCount: 0, matbuCount: 0 });
    } catch (err: any) {
      toast.error(err.message || "Liste yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, sortBy, debouncedSearch]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    fetchPetitions();
  }, [fetchPetitions]);

  // Sync editor initial HTML whenever editor opens
  useEffect(() => {
    if (editorMode && editorRef.current) {
      editorRef.current.innerHTML = editorInitialHtml || "<p></p>";
      syncLiveFieldsToEditor(citizenName, tcNo, subject);
    }
  }, [editorMode, editorInitialHtml]);

  const exitEditorMode = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = "";
    }
    setEditorMode(false);
    setEditingId(null);
    setPreviewPetition(null);
    setEditorInitialHtml("");
  }, []);

  // Tarayıcı geri tuşuna basıldığında da düzenleme/önizleme modundan temiz çıkış yap
  useEffect(() => {
    if (!editorMode) return;
    if (typeof window !== "undefined" && !window.history.state?.petitionEditor) {
      window.history.pushState({ petitionEditor: true }, "");
    }
    const onPopState = () => {
      exitEditorMode();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, [editorMode, exitEditorMode]);

  const handleUploadTemplate = async (type: "detayli" | "matbu", file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".docx")) {
      toast.error("Lütfen yalnızca .docx uzantılı Word dosyası seçin.");
      return;
    }

    setUploadingType(type);
    try {
      const fd = new FormData();
      fd.append("type", type);
      fd.append("file", file);

      const res = await fetch("/api/petitions/templates", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Şablon yüklenemedi");

      toast.success(
        `${type === "detayli" ? "Detaylı Dilekçe" : "Matbu Dilekçe"} şablonu başarıyla yüklendi.`
      );
      fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || "Şablon yükleme hatası");
    } finally {
      setUploadingType(null);
      if (detayliInputRef.current) detayliInputRef.current.value = "";
      if (matbuInputRef.current) matbuInputRef.current.value = "";
    }
  };

  const normalizePetitionTableHtml = (
    html: string,
    type?: "detayli" | "matbu"
  ): string => {
    if (typeof window === "undefined" || !html) return html;
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll<HTMLElement>("tr").forEach((tr) => {
        tr.style.removeProperty("height");
        if (!tr.getAttribute("style")?.trim()) tr.removeAttribute("style");
      });
      doc.querySelectorAll<HTMLElement>("td, th").forEach((cell) => {
        cell.style.removeProperty("height");
        if (type === "matbu") {
          cell.style.border = "none";
        } else {
          cell.style.border = "1.5px solid #000";
        }
        if (!cell.getAttribute("style")?.trim()) cell.removeAttribute("style");
        const paragraphs = Array.from(cell.querySelectorAll("p"));
        if (paragraphs.length > 0) {
          const nonEmpty = paragraphs.filter(
            (p) => (p.textContent || "").replace(/\u00a0/g, " ").trim().length > 0
          );
          if (nonEmpty.length === 0) {
            cell.innerHTML = "<p>&nbsp;</p>";
          } else {
            paragraphs.forEach((p) => {
              if ((p.textContent || "").replace(/\u00a0/g, " ").trim().length === 0) {
                p.remove();
              }
            });
          }
        }
      });

      if (type !== "matbu") {
        doc.querySelectorAll<HTMLElement>("table").forEach((tbl) => {
          tbl.removeAttribute("data-borderless");
        });
        const isCellEmpty = (cell: HTMLElement) =>
          (cell.textContent || "").replace(/\u00a0/g, " ").trim().length === 0 &&
          !cell.querySelector("table");

        const fillEmptyCellLines = (cell: HTMLElement, count: number) => {
          cell.innerHTML = Array.from({ length: count }, () => "<p>&nbsp;</p>").join("");
        };

        const ensureTrailingBlankLines = (cell: HTMLElement, count: number) => {
          const existingEmpty = Array.from(cell.querySelectorAll("p")).filter(
            (p) => (p.textContent || "").replace(/\u00a0/g, " ").trim().length === 0
          ).length;
          for (let k = existingEmpty; k < count; k++) {
            const p = doc.createElement("p");
            p.innerHTML = "&nbsp;";
            cell.appendChild(p);
          }
        };

        doc.querySelectorAll<HTMLTableRowElement>("tr").forEach((tr) => {
          const cells = Array.from(tr.children).filter(
            (c): c is HTMLElement => c.tagName === "TD" || c.tagName === "TH"
          );
          cells.forEach((cell, idx) => {
            const txt = (cell.textContent || "")
              .replace(/\u00a0/g, " ")
              .trim()
              .toLocaleUpperCase("tr-TR");
            if (!txt) return;

            let targetLines = 0;
            if (/MEDEN[İI]\s*HAL[İI]|ÇOCUKLARI|SOSYAL\s*DURUMU/.test(txt)) {
              targetLines = 6;
            } else if (/\bADRES[İI]?\b|\b[İI]MZA\b/.test(txt)) {
              targetLines = 3;
            }
            if (!targetLines) return;

            const nextCell = cells[idx + 1];
            if (nextCell && isCellEmpty(nextCell)) {
              fillEmptyCellLines(nextCell, targetLines);
              return;
            }

            if (cells.length === 1) {
              const nextTr = tr.nextElementSibling as HTMLTableRowElement | null;
              if (nextTr) {
                const nextRowCells = Array.from(nextTr.children).filter(
                  (c): c is HTMLElement => c.tagName === "TD" || c.tagName === "TH"
                );
                if (nextRowCells.length > 0 && nextRowCells.every(isCellEmpty)) {
                  nextRowCells.forEach((nc) => fillEmptyCellLines(nc, targetLines));
                  return;
                }
              }
            }

            ensureTrailingBlankLines(cell, targetLines);
          });

          // Detaylı dilekçede boş olsa bile tüm satırlar en az 2 satır, imza satırı en az 3 satır boşluk genişliğinde olsun
          const rowText = (tr.textContent || "")
            .replace(/\u00a0/g, " ")
            .trim()
            .toLocaleUpperCase("tr-TR");
          const isImzaRow = /\b[İI]MZA\b/.test(rowText);
          const minRowLines = isImzaRow ? 3 : 2;
          cells.forEach((cell, cIdx) => {
            if (cell.querySelector("table")) return;
            cell.style.minHeight = isImzaRow ? "44pt" : "28pt";
            if (isCellEmpty(cell)) {
              fillEmptyCellLines(cell, minRowLines);
            } else if (cIdx > 0 || cells.length === 1) {
              const pCount = cell.querySelectorAll("p").length;
              if (pCount < minRowLines) {
                ensureTrailingBlankLines(cell, minRowLines - pCount);
              }
            }
          });
        });
      }

      if (type !== "matbu") {
        // Ayrıntılı dilekçede başlığın altındaki "Muhtaçlığım nedeniyle..." yazısı:
        // başlık ile ve altındaki tabloyla arasında 1 boş satır, küçük harflerle ve başlıktan biraz daha küçük punto
        doc.querySelectorAll<HTMLElement>("p, div").forEach((el) => {
          if (el.querySelector("p, div, table")) return;
          const rawTxt = (el.textContent || "").replace(/[\u00a0\u2003\u2002]/g, " ").trim();
          if (/muhtaçlığım\s+nedeniyle/i.test(rawTxt)) {
            const lowerSentence =
              rawTxt.charAt(0).toLocaleUpperCase("tr-TR") +
              rawTxt
                .slice(1)
                .toLocaleLowerCase("tr-TR")
                .replace(/\bvakfınızca\b/g, "Vakfınızca")
                .replace(/\bkanun\b/g, "Kanun");
            const formattedHtml = lowerSentence.replace(
              /(\d{2}\.\d{2}\.\d{4})/,
              '<span data-petition-date="true">$1</span>'
            );
            el.innerHTML = formattedHtml;
            el.style.fontSize = "9pt";
            el.style.fontWeight = "normal";
            el.style.marginTop = "12pt";
            el.style.marginBottom = "12pt";
            el.style.lineHeight = "1.35";
          }
        });
      }

      if (type === "matbu") {
        // Matbu dilekçe: başlık ortalı, alttan ve üstten tam 1 satır boşluk (12pt)
        doc.querySelectorAll<HTMLElement>("div, p, h1, h2, h3").forEach((div) => {
          const t = (div.textContent || "").toLocaleUpperCase("tr-TR");
          if (
            (t.includes("SOSYAL YARDIMLAŞMA VE DAYANIŞMA") || t.includes("BAŞKANLIĞINA")) &&
            (t.includes("EDİRNE") || t.includes("VAKFI")) &&
            !div.querySelector("table")
          ) {
            if (div.parentElement && div.parentElement.getAttribute("data-matbu-title") === "true") {
              return;
            }
            div.style.marginTop = "12pt";
            div.style.marginBottom = "12pt";
            div.style.marginLeft = "auto";
            div.style.marginRight = "auto";
            div.setAttribute("data-matbu-title", "true");
          }
        });

        doc.querySelectorAll<HTMLElement>("table").forEach((tbl) => {
          tbl.setAttribute("data-borderless", "true");
          tbl.style.border = "none";
          tbl.style.marginTop = "0";
        });

        doc.querySelectorAll<HTMLElement>("p, td, th").forEach((el) => {
          if (el.querySelector("p, table")) return;
          const txt = (el.textContent || "").replace(/\u00a0/g, " ").trim();
          if (!txt) return;
          if (/BAŞKANLIĞINA|^EDİRNE$/i.test(txt)) return;

          if (/bilgilerinize\s+arz\s+ederim/i.test(txt)) {
            el.innerHTML = el.innerHTML.replace(/^(?:&emsp;|&ensp;|&nbsp;|\u00a0|\u2003|\s)+/gi, "");
            el.style.textIndent = "35.4pt";
            el.style.marginLeft = "0";
            el.style.paddingLeft = "0";
            el.style.marginBottom = "72pt"; // Bilgilerinize arz ederim'den sonra en az 6 satır boşluk
          } else if (/(talep|arz\s*ederim|arz\s*olunur|\barz\b)/i.test(txt)) {
            el.innerHTML = el.innerHTML.replace(/^(?:&emsp;|&ensp;|&nbsp;|\u00a0|\u2003|\s)+/gi, "");
            el.style.textIndent = "35.4pt";
            el.style.marginLeft = "0";
            el.style.paddingLeft = "0";
          }

          // Matbu dilekçede Adı Soyadı ve T.C. Kimlik No başlığı kalın, içeriği kalın olmayan punto
          const boldLabelMatch = txt.match(
            /^(Ad[ıi]\s*Soyad[ıi]|T\.?\s*C\.?\s*Kimlik\s*(?:No|Numaras[ıi])?)\s*:\s*(.*)$/i
          );
          if (boldLabelMatch && el.tagName.toLowerCase() === "p") {
            const label = boldLabelMatch[1].trim();
            const liveSpan = el.querySelector<HTMLElement>("[data-live-field]");
            if (liveSpan) {
              liveSpan.style.fontWeight = "normal";
              el.innerHTML = `<strong>${label}:</strong> ${liveSpan.outerHTML}`;
            } else {
              const rest = boldLabelMatch[2] || "\u00a0";
              el.innerHTML = `<strong>${label}:</strong> <span style="font-weight: normal;">${rest}</span>`;
            }
          }
        });
      }

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  };

  const applyPetitionDateToHtml = (
    rawHtml: string,
    targetDate: Date,
    isNewApplication: boolean
  ): string => {
    if (!rawHtml) return "<p></p>";
    const d = isNaN(targetDate.getTime()) ? new Date() : targetDate;
    const dateStr = `${String(d.getDate()).padStart(2, "0")}.${String(
      d.getMonth() + 1
    ).padStart(2, "0")}.${d.getFullYear()}`;
    const dateSpan = `<span data-petition-date="true">${dateStr}</span>`;

    let html = rawHtml
      .replace(
        /\(\s*(?:<[^>]+>\s*)*tar[iİıI]h(?:\s*<[^>]+>)*\s*\)|\[\s*(?:<[^>]+>\s*)*tar[iİıI]h(?:\s*<[^>]+>)*\s*\]|\{\{\s*(?:<[^>]+>\s*)*tar[iİıI]h(?:\s*<[^>]+>)*\s*\}\}/gi,
        dateSpan
      )
      .replace(
        /(?:[.…]|\s|<[^>]+>){2,}\/(?:[.…]|\s|<[^>]+>){2,}\/\s*(?:<[^>]+>\s*)*20\d{2}/g,
        dateSpan
      );

    if (typeof window === "undefined") return html;
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll<HTMLElement>('[data-petition-date="true"]').forEach((el) => {
        el.textContent = dateStr;
      });

      const firstTable = doc.querySelector("table");
      if (firstTable) {
        (firstTable as HTMLElement).style.marginTop = "1pt";
      }

      doc.querySelectorAll<HTMLElement>("p, div").forEach((el) => {
        const isBeforeTable =
          !firstTable ||
          Boolean(el.compareDocumentPosition(firstTable) & Node.DOCUMENT_POSITION_FOLLOWING);

        if (isBeforeTable && !el.contains(firstTable)) {
          const rawCheck = (el.textContent || "").replace(/[\u00a0\u2003\u2002]/g, " ").trim();
          if (!rawCheck && !el.querySelector("img, table")) {
            el.remove();
            return;
          }
          const rawUpper = rawCheck.toLocaleUpperCase("tr-TR");
          const isTitleElement =
            el.hasAttribute("data-matbu-title") ||
            el.style.width === "fit-content" ||
            ((rawUpper.includes("SOSYAL YARDIMLAŞMA VE DAYANIŞMA") || rawUpper.includes("BAŞKANLIĞINA")) &&
              (rawUpper.includes("EDİRNE") || rawUpper.includes("VAKFI")));

          if (isTitleElement) {
            el.style.marginTop = "12pt";
            el.style.marginBottom = "12pt";
            el.style.marginLeft = "auto";
            el.style.marginRight = "auto";
            el.style.lineHeight = "1.2";
            el.setAttribute("data-matbu-title", "true");
          } else if (el.tagName === "P") {
            el.style.marginTop = "0";
            el.style.marginBottom = "0";
            el.style.lineHeight = "1.25";
          }
        }

        if (el.querySelector("p, div, table")) return;
        const txt = (el.textContent || "").replace(/[\u00a0\u2003\u2002]/g, " ").trim();
        if (!txt) return;

        // "…./……/2026" veya "(TARİH)" kalıbı hala metinde duruyorsa değiştir
        if (/[.…]{2,}\s*\/\s*[.…]{2,}\s*\/\s*20\d{2}/.test(txt)) {
          const replaced = txt.replace(
            /[.…]{2,}\s*\/\s*[.…]{2,}\s*\/\s*20\d{2}/g,
            dateStr
          );
          el.innerHTML = `<span data-petition-date="true" style="font-weight:bold;">${replaced}</span>`;
          return;
        }

        // Yeni başvuru veya şablon kullanımında tarih mutlaka güncel sistem tarihi olmalı
        if (isNewApplication && /\d{2}[./]\d{2}[./]20\d{2}/.test(txt)) {
          if (/^\d{2}[./]\d{2}[./]20\d{2}$/.test(txt)) {
            el.innerHTML = `<span data-petition-date="true" style="font-weight:bold;">${dateStr}</span>`;
          } else if (isBeforeTable) {
            el.innerHTML = el.innerHTML.replace(/\d{2}[./]\d{2}[./]20\d{2}/g, dateStr);
          }
        }
      });

      return doc.body.innerHTML;
    } catch {
      return html;
    }
  };

  // Şablondan Yeni Dilekçe Aç ("Dilekçe Al" veya "Matbu Dilekçe Al")
  const handleStartFromTemplate = (type: "detayli" | "matbu") => {
    const tpl = templates[type];
    if (!tpl) {
      toast.error(
        `${type === "detayli" ? "Detaylı Dilekçe" : "Matbu Dilekçe"
        } şablonu henüz yönetici tarafından yüklenmemiş.`
      );
      if (isManager) setIsTemplateModalOpen(true);
      return;
    }

    let filledHtml = applyPetitionDateToHtml(tpl.htmlContent || "<p></p>", new Date(), true);

    const isDirectHtmlTemplate = (tpl.fileName || "").toLowerCase().endsWith(".html");
    if (!isDirectHtmlTemplate) {
      filledHtml = filledHtml
        .replace(
          /<p[^>]*>[\s\S]*?(SOSYAL\s+YARDIMLAŞMA\s+VE\s+DAYANIŞMA\s+VAKFI\s+BAŞKANLIĞINA)[\s\S]*?<\/p>\s*<p[^>]*>[\s\S]*?(EDİRNE)[\s\S]*?<\/p>/i,
          (_m, titleText, cityText) =>
            `<div data-matbu-title="true" style="width:fit-content;margin:12pt auto 12pt auto;text-align:center;line-height:1.2;"><div style="font-weight:bold;">${titleText.trim()}</div><div style="text-align:right;font-weight:bold;">${cityText.trim()}</div></div>`
        )
        .replace(
          /<p[^>]*>[\s\S]*?(SOSYAL\s+YARDIMLAŞMA\s+VE\s+DAYANIŞMA\s+VAKFI\s+BAŞKANLIĞINA)[\s\S]*?<br\s*\/?>[\s\S]*?(EDİRNE)[\s\S]*?<\/p>/i,
          (_m, titleText, cityText) =>
            `<div data-matbu-title="true" style="width:fit-content;margin:12pt auto 12pt auto;text-align:center;line-height:1.2;"><div style="font-weight:bold;">${titleText.trim()}</div><div style="text-align:right;font-weight:bold;">${cityText.trim()}</div></div>`
        );
      filledHtml = normalizePetitionTableHtml(filledHtml, type);
    } else if (type === "matbu") {
      filledHtml = normalizePetitionTableHtml(filledHtml, "matbu");
    }

    setEditingId(null);
    setEditorType(type);
    setCitizenName("");
    setTcNo("");
    setSubject("");
    setEditorStaffInfo({
      name: session?.user?.name || "Personel",
      title: (session?.user as any)?.title || "Personel",
    });
    setEditorInitialHtml(filledHtml);
    setEditorMode(true);
  };

  // Kayıtlı Dilekçeyi Getir (Görüntüle / Düzenle / Şablon Olarak Kullan)
  const isPetitionEditable = (rec: Pick<PetitionRecord, "createdAt" | "createdBy">) => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(rec.createdAt).getTime() >= ONE_DAY_MS) {
      return false;
    }
    return isManager || String(rec.createdBy?._id || "") === String(userId || "");
  };

  const handleOpenPetition = async (
    record: PetitionRecord,
    action: "preview" | "edit" | "useAsTemplate"
  ) => {
    if (action === "edit" && !isPetitionEditable(record)) {
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;
      const isExpired = Date.now() - new Date(record.createdAt).getTime() >= ONE_DAY_MS;
      toast.error(
        isExpired
          ? "Kaydedildikten 1 gün geçen dilekçeler düzenlenemez. Şablon olarak kullanabilirsiniz."
          : "Başka bir personelin dilekçesini düzenleyemezsiniz."
      );
      return;
    }
    setLoadingContentId(record._id);
    try {
      const res = await fetch(`/api/petitions/${record._id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dilekçe içeriği alınamadı");

      const full = data.petition;
      const savedDate = full.createdAt ? new Date(full.createdAt) : new Date();
      if (action === "preview") {
        setPreviewPetition({
          ...full,
          htmlContent: applyPetitionDateToHtml(full.htmlContent || "<p></p>", savedDate, false),
        });
      } else if (action === "edit") {
        setPreviewPetition(null);
        setEditingId(full._id);
        setEditorType(full.petitionType);
        setCitizenName(full.citizenName);
        setTcNo(full.tcNo);
        setSubject(full.subject || "");
        setEditorStaffInfo({
          name: full.createdBy?.name || session?.user?.name || "Personel",
          title: full.createdBy?.title || "Personel",
        });
        setEditorInitialHtml(
          applyPetitionDateToHtml(full.htmlContent || "<p></p>", savedDate, false)
        );
        setEditorMode(true);
      } else if (action === "useAsTemplate") {
        setPreviewPetition(null);
        setEditingId(null); // Yeni kayıt olarak kaydedilecek
        setEditorType(full.petitionType);
        setCitizenName("");
        setTcNo("");
        setSubject(full.subject || "");
        setEditorStaffInfo({
          name: session?.user?.name || "Personel",
          title: (session?.user as any)?.title || "Personel",
        });
        setEditorInitialHtml(
          normalizePetitionTableHtml(
            applyPetitionDateToHtml(full.htmlContent || "<p></p>", new Date(), true),
            full.petitionType
          )
        );
        setEditorMode(true);
        toast.success("Kayıtlı dilekçe şablon olarak açıldı. Bilgileri güncelleyip kaydedebilirsiniz.");
      }
    } catch (err: any) {
      toast.error(err.message || "İşlem başarısız");
    } finally {
      setLoadingContentId(null);
    }
  };

  const handleSetAsDefaultTemplate = async (rec: { _id: string; citizenName: string; petitionType: "detayli" | "matbu" }) => {
    setLoadingContentId(rec._id);
    try {
      const res = await fetch("/api/petitions/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setFromPetition",
          petitionId: rec._id,
          type: rec.petitionType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Varsayılan şablon güncellenemedi");
      toast.success(
        `"${rec.citizenName}" dilekçesi ${rec.petitionType === "matbu" ? "Matbu" : "Detaylı"
        } varsayılan şablonu olarak kaydedildi.`
      );
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || "İşlem başarısız");
    } finally {
      setLoadingContentId(null);
    }
  };

  const syncLiveFieldsToEditor = (nameVal: string, tcVal: string, subjectVal: string) => {
    const root = editorRef.current;
    if (!root) return;

    const normTr = (s: string) =>
      s
        .replace(/[\u00a0\u2003\u2002]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleUpperCase("tr-TR");

    const getTargetCell = (cells: HTMLElement[], idx: number): HTMLElement | undefined => {
      const next = cells[idx + 1];
      if (!next) return undefined;
      if (normTr(next.textContent || "") === ":") {
        return cells[idx + 2];
      }
      return next;
    };

    // 0. "MÜRACAATÇININ ADI SOYADI" satırında yan hücreye Adı Soyadı + T.C. Kimlik No birlikte yazılır
    root.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.children).filter(
        (c): c is HTMLElement => c.tagName === "TD" || c.tagName === "TH"
      );
      cells.forEach((cell, idx) => {
        const txt = normTr(cell.textContent || "");
        if (/^(?:MÜRACAATÇININ|BAŞVURUCUNUN)\s+(?:ADI\s*SOYADI|AD\s*SOYAD)\s*:?$/.test(txt)) {
          const targetCell = getTargetCell(cells, idx);
          if (
            targetCell &&
            !targetCell.querySelector("table") &&
            !targetCell.querySelector('[data-live-field="citizenName"]')
          ) {
            targetCell.innerHTML = `<p><span data-live-field="citizenName">\u00a0</span> — <span data-live-field="tcNo">\u00a0</span></p>`;
          }
        }
      });
    });

    const ensureFieldTargets = (
      field: "citizenName" | "tcNo" | "subject",
      labelRegex: RegExp,
      inlineRegex: RegExp
    ) => {
      // 1. Tablo satırlarında etiket hücresinin hemen sağındaki hücreyi hedefle
      root.querySelectorAll("tr").forEach((tr) => {
        const cells = Array.from(tr.children).filter(
          (c): c is HTMLElement => c.tagName === "TD" || c.tagName === "TH"
        );
        cells.forEach((cell, idx) => {
          const txt = normTr(cell.textContent || "");
          if (labelRegex.test(txt)) {
            if (field === "citizenName" || field === "tcNo") {
              cell.style.fontWeight = "bold";
            }
            const targetCell = getTargetCell(cells, idx);
            if (
              targetCell &&
              !targetCell.querySelector("table") &&
              !targetCell.querySelector(`[data-live-field="${field}"]`)
            ) {
              targetCell.innerHTML = `<p><span data-live-field="${field}" style="font-weight: normal;">\u00a0</span></p>`;
            }
          }
        });
      });

      // 2. Aynı satır/hücre içinde "Adı Soyadı :" veya "T.C. Kimlik No :" şeklinde yazılmışsa
      root.querySelectorAll<HTMLElement>("p, td, th").forEach((el) => {
        if (el.querySelector("p, table")) return;
        if (el.querySelector(`[data-live-field="${field}"]`)) return;

        // İçinde <br> ile birden fazla satır varsa satır satır kontrol et
        if (/<br\s*\/?>/i.test(el.innerHTML)) {
          const parts = el.innerHTML.split(/<br\s*\/?>/i);
          let changed = false;
          const nextParts = parts.map((partHtml) => {
            const tmp = document.createElement("div");
            tmp.innerHTML = partHtml;
            const rawLine = (tmp.textContent || "").replace(/[\u00a0\u2003\u2002]/g, " ").trim();
            const upperLine = rawLine.toLocaleUpperCase("tr-TR");
            if (inlineRegex.test(upperLine) && !tmp.querySelector(`[data-live-field="${field}"]`)) {
              const colonIdx = rawLine.indexOf(":");
              const labelPart = colonIdx >= 0 ? rawLine.slice(0, colonIdx + 1).trim() : rawLine;
              changed = true;
              if (field === "citizenName" || field === "tcNo") {
                return `<strong>${labelPart}</strong> <span data-live-field="${field}" style="font-weight: normal;">\u00a0</span>`;
              }
              return `${labelPart} <span data-live-field="${field}">\u00a0</span>`;
            }
            return partHtml;
          });
          if (changed) {
            el.innerHTML = nextParts.join("<br/>");
          }
          return;
        }

        const rawTxt = (el.textContent || "").replace(/[\u00a0\u2003\u2002]/g, " ").trim();
        const upperTxt = rawTxt.toLocaleUpperCase("tr-TR");
        if (inlineRegex.test(upperTxt)) {
          const colonIdx = rawTxt.indexOf(":");
          const labelPart = colonIdx >= 0 ? rawTxt.slice(0, colonIdx + 1).trim() : rawTxt;
          if (field === "citizenName" || field === "tcNo") {
            el.innerHTML = `<strong>${labelPart}</strong> <span data-live-field="${field}" style="font-weight: normal;">\u00a0</span>`;
          } else {
            el.innerHTML = `${labelPart} <span data-live-field="${field}">\u00a0</span>`;
          }
        }
      });
    };

    ensureFieldTargets(
      "citizenName",
      /^(?:ADI\s*SOYADI|AD\s*SOYAD|AD\s*-\s*SOYAD|İSİM\s*SOYİSİM|DİLEKÇE\s*SAHİBİ(?:\s*ADI\s*SOYADI)?)\s*:?$/,
      /^(?:ADI\s*SOYADI|AD\s*SOYAD|AD\s*-\s*SOYAD|İSİM\s*SOYİSİM|DİLEKÇE\s*SAHİBİ(?:\s*ADI\s*SOYADI)?)\s*:(?:[\s._…-]*)$/
    );
    ensureFieldTargets(
      "tcNo",
      /^(?:T\.?\s*C\.?\s*(?:KİMLİK)?\s*(?:NO|NUMARASI)?|T\.?\s*C\.?\s*K\.?\s*N\.?|TCKN|KİMLİK\s*(?:NO|NUMARASI))\s*:?$/,
      /^(?:T\.?\s*C\.?\s*(?:KİMLİK)?\s*(?:NO|NUMARASI)?|T\.?\s*C\.?\s*K\.?\s*N\.?|TCKN|KİMLİK\s*(?:NO|NUMARASI))\s*:(?:[\s._…-]*)$/
    );
    ensureFieldTargets(
      "subject",
      /^(?:TALEP\s*ETTİĞİ\s*YARDIM(?:\s*TÜRÜ)?|YARDIM\s*TÜRÜ|DİLEKÇE\s*KONUSU|KONU(?:SU)?|TALEP\s*KONUSU)\s*:?$/,
      /^(?:TALEP\s*ETTİĞİ\s*YARDIM(?:\s*TÜRÜ)?|YARDIM\s*TÜRÜ|DİLEKÇE\s*KONUSU|KONU(?:SU)?|TALEP\s*KONUSU)\s*:(?:[\s._…-]*)$/
    );

    root.querySelectorAll<HTMLElement>('[data-live-field="citizenName"]').forEach((el) => {
      el.textContent = nameVal || "\u00a0";
    });
    root.querySelectorAll<HTMLElement>('[data-live-field="tcNo"]').forEach((el) => {
      el.textContent = tcVal || "\u00a0";
    });
    root.querySelectorAll<HTMLElement>('[data-live-field="subject"]').forEach((el) => {
      el.textContent = subjectVal || "\u00a0";
    });
  };

  const handleSavePetition = async () => {
    const cleanName = citizenName.trim();
    const cleanTc = tcNo.trim();
    const htmlContent = editorRef.current?.innerHTML?.trim() || "";

    if (!cleanName || !cleanTc) {
      toast.error("Lütfen dilekçe sahibinin Adı Soyadı ve T.C. Kimlik No bilgilerini girin.");
      return;
    }
    if (!htmlContent || htmlContent === "<p></p>" || htmlContent === "<br>") {
      toast.error("Dilekçe içeriği boş olamaz.");
      return;
    }

    setSaving(true);
    try {
      const url = editingId ? `/api/petitions/${editingId}` : "/api/petitions";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petitionType: editorType,
          citizenName: cleanName,
          tcNo: cleanTc,
          subject: subject.trim(),
          htmlContent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Dilekçe kaydedilemedi");

      // Dilekçe üzerinde uyarı/bilgi balonu çıkmaması için toast kapatıldı; bildirim buton üzerinde gösterilir
      toast.dismiss();
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      if (data?.petition?._id && !editingId) {
        setEditingId(data.petition._id);
      }
      void fetchPetitions();
    } catch (err: any) {
      toast.error(err.message || "Kaydetme hatası");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePetition = (record: PetitionRecord) => {
    setConfirmState({
      isOpen: true,
      title: "Dilekçeyi Sil",
      type: "danger",
      message: (
        <span>
          <strong>{record.citizenName}</strong> ({record.tcNo}) adına kayıtlı dilekçeyi kalıcı olarak
          silmek istiyor musunuz?
        </span>
      ),
      onConfirm: async () => {
        setConfirmState((p) => ({ ...p, isLoading: true }));
        try {
          const res = await fetch(`/api/petitions/${record._id}`, { method: "DELETE" });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Silinemedi");
          toast.success("Dilekçe silindi.");
          setConfirmState((p) => ({ ...p, isOpen: false, isLoading: false }));
          fetchPetitions();
        } catch (err: any) {
          toast.error(err.message || "Silme hatası");
          setConfirmState((p) => ({ ...p, isLoading: false }));
        }
      },
    });
  };

  const execFormat = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  };

  const handlePrintCurrent = () => {
    if (editorMode && !editingId) {
      toast.error("Yazdırmak için önce dilekçeyi sisteme kaydedin.");
      return;
    }
    // Yazdırma öncesi ekrandaki tüm bildirim/bilgi balonlarını anında kapat
    toast.dismiss();
    setTimeout(() => {
      window.print();
    }, 60);
  };

  const handleDownloadEditorDocx = async () => {
    if (!editingId) {
      toast.error("Word (.docx) olarak indirmek için önce dilekçeyi sisteme kaydedin.");
      return;
    }
    const html = editorRef.current?.innerHTML || "";
    const namePart = citizenName.trim() || "Dilekce";
    const typePart = editorType === "matbu" ? "Matbu" : "Detayli";
    const { downloadPetitionAsDocx } = await import("@/lib/petitionDocx");
    await downloadPetitionAsDocx(html, `${namePart}_${typePart}_Dilekce`, editorStaffInfo);
    toast.success("Word (.docx) dosyası indirildi.");
  };

  // =========================================================================
  // SAYFA İÇİ WORD DİLEKÇE EDİTÖRÜ GÖRÜNÜMÜ
  // =========================================================================
  if (editorMode) {
    return (
      <div key="petition-editor-view" className="space-y-4">
        {/* Üst Kontrol Çubuğu (Yazdırmada Gizli) */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl shadow-sm border border-slate-200/80 space-y-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined" && window.history.state?.petitionEditor) {
                    window.history.back();
                  } else {
                    exitEditorMode();
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold"
                title="Dilekçeyi Kapat ve Ana Sayfaya Dön"
              >
                <ArrowLeft className="w-4 h-4" />
                Dilekçeyi Kapat
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-extrabold text-slate-900">
                    {editingId ? "Dilekçeyi Düzenle" : "Yeni Dilekçe Hazırla"}
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${editorType === "matbu"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                        : "bg-indigo-100 text-indigo-800 border border-indigo-200"
                      }`}
                  >
                    {editorType === "matbu" ? "Matbu Dilekçe" : "Detaylı Dilekçe"}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Şablon metni üzerinde doğrudan değişiklik yapıp yazdırabilir, Word olarak indirebilir
                  veya sisteme kaydedebilirsiniz.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!editingId && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold">
                  Yazdırma ve Word indirme kayıt sonrası aktif olur
                </span>
              )}
              <button
                type="button"
                onClick={handlePrintCurrent}
                disabled={!editingId}
                title={!editingId ? "Önce dilekçeyi sisteme kaydedin" : "Yazdır / PDF"}
                className={`px-4 py-2.5 rounded-xl bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${!editingId ? "opacity-45 cursor-not-allowed" : "hover:bg-slate-900"
                  }`}
              >
                <Printer className="w-4 h-4" />
                Yazdır / PDF
              </button>
              <button
                type="button"
                onClick={handleDownloadEditorDocx}
                disabled={!editingId}
                title={!editingId ? "Önce dilekçeyi sisteme kaydedin" : "Word (.docx) İndir"}
                className={`px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm ${!editingId ? "opacity-45 cursor-not-allowed" : "hover:bg-indigo-700"
                  }`}
              >
                <Download className="w-4 h-4" />
                Word (.docx) İndir
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSavePetition}
                className={`px-5 py-2.5 rounded-xl text-white text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-lg disabled:opacity-50 ${
                  saveSuccess
                    ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/25"
                }`}
              >
                {saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                    Kaydedildi!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {saving ? "Kaydediliyor..." : editingId ? "Değişiklikleri Kaydet" : "Sisteme Kaydet"}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Dilekçe Sahibi Bilgileri */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Dilekçe Sahibi Adı Soyadı *
              </label>
              <input
                type="text"
                value={citizenName}
                onChange={(e) => {
                  const val = e.target.value;
                  setCitizenName(val);
                  syncLiveFieldsToEditor(val, tcNo, subject);
                }}
                placeholder="Örn: Ahmet Yılmaz"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none text-sm font-semibold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                T.C. Kimlik No *
              </label>
              <input
                type="text"
                maxLength={11}
                value={tcNo}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  setTcNo(val);
                  syncLiveFieldsToEditor(citizenName, val, subject);
                }}
                placeholder="11 haneli T.C. No"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none text-sm font-mono font-bold text-slate-900"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Dilekçe Konusu / Kısa Not
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => {
                  const val = e.target.value;
                  setSubject(val);
                  syncLiveFieldsToEditor(citizenName, tcNo, val);
                }}
                placeholder="Örn: Nakdi Yardım / Eğitim / Sağlık"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-blue-500 focus:outline-none text-sm text-slate-900"
              />
            </div>
          </div>

          {/* Word Biçimlendirme Araç Çubuğu */}
          <div className="flex flex-wrap items-center gap-1 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => execFormat("undo")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="Geri Al"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => execFormat("redo")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="İleri Al"
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={() => execFormat("bold")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="Kalın"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => execFormat("italic")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="İtalik"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => execFormat("underline")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="Altı Çizili"
            >
              <Underline className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={() => execFormat("justifyLeft")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="Sola Hizala"
            >
              <AlignLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => execFormat("justifyCenter")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="Ortala"
            >
              <AlignCenter className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => execFormat("justifyRight")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="Sağa Hizala"
            >
              <AlignRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => execFormat("justifyFull")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="İki Yana Yasla"
            >
              <AlignJustify className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <button
              type="button"
              onClick={() => execFormat("insertUnorderedList")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="Madde İşaretleri"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => execFormat("insertOrderedList")}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-700"
              title="Numaralı Liste"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 mx-1" />
            <select
              onChange={(e) => {
                if (e.target.value) execFormat("fontSize", e.target.value);
              }}
              defaultValue="3"
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700"
              title="Yazı Boyutu"
            >
              <option value="2">Küçük (10pt)</option>
              <option value="3">Normal (12pt)</option>
              <option value="4">Orta (14pt)</option>
              <option value="5">Büyük (18pt)</option>
            </select>
          </div>
        </div>

        {/* Yazdırmada tarayıcı üst/alt bilgi (tarih, başlık, site linki), bildirim balonları, sağa taşma ve fazladan boş sayfa engellenir */}
        <style>{`@media print {
          @page { size: A4 portrait; margin: 0; }
          html, body {
            background: #fff !important;
            width: 210mm !important;
            height: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * { min-height: 0 !important; }
          #react-hot-toast,
          .toaster,
          [data-toaster-wrapper],
          [data-hot-toast],
          div[role="status"],
          div[aria-live="polite"],
          div[aria-live="assertive"],
          body > div[style*="fixed"],
          body > div[style*="position: fixed"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
          }
          [data-matbu-title],
          div[style*="fit-content"] {
            margin-top: 12pt !important;
            margin-bottom: 12pt !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }`}</style>

        {/* A4 Word Kağıt Alanı */}
        <div className="bg-slate-200/70 p-2 sm:p-8 rounded-3xl overflow-x-auto print:bg-white print:p-0 print:overflow-visible">
          <div className="w-[210mm] min-h-[297mm] print:w-[210mm] print:max-w-[210mm] print:h-[296mm] print:min-h-[296mm] print:box-border mx-auto bg-white shadow-xl border border-slate-200 px-10 py-8 sm:px-14 sm:py-10 text-slate-900 print:shadow-none print:border-none print:px-[14mm] print:py-[12mm] flex flex-col justify-between">
            <div>
              <div className="flex justify-center mb-3">
                <img
                  src="/logo-vakif.jpg"
                  alt="Vakıf Logosu"
                  className="w-16 h-16 object-contain rounded-full"
                />
              </div>
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                className={`w-full min-h-[225mm] print:min-h-0 text-slate-900 text-[13.5px] leading-snug focus:outline-none [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_p]:m-0 [&_p]:leading-snug [&_table]:w-full [&_table]:border-collapse [&_tr]:!h-auto [&_td]:!py-1.5 [&_td]:!px-2.5 [&_td]:!align-middle [&_td_p]:!m-0 [&_td_p]:!leading-snug [&_th]:!py-1.5 [&_th]:!px-2.5 [&_th]:!align-middle [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ${editorType === "matbu"
                    ? "[&_td]:!border-0 [&_th]:!border-0"
                    : "[&_td]:border [&_td]:border-black [&_th]:border [&_th]:border-black"
                  }`}
              />
            </div>

            {/* Standart Altbilgi (Resim 2 formatı) */}
            <div className="pt-8 mt-6 flex justify-between items-end gap-6 text-[10.5px] leading-snug text-slate-600 select-none">
              <div className="space-y-0.5">
                <p>Babademirtaş Mahallesi Sebil Sokak No:15/EDİRNE</p>
                <p>Telefon No: 0 (284) 2120957 Faks No: 0(284) 2120957</p>
                <p>e-Posta: edirnesydv@gmail.com</p>
              </div>
              <div className="space-y-0.5 text-left min-w-[200px]">
                <p>Bilgi için: {editorStaffInfo.name || session?.user?.name || "Personel"}</p>
                <p>{editorStaffInfo.title || (session?.user as any)?.title || "Personel"}</p>
                <p>Telefon No: 0 (284) 2120957</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // ANA DİLEKÇE MERKEZİ & ARAMA LİSTESİ
  // =========================================================================
  return (
    <div key="petition-main-view" className="space-y-6">
      {/* Gizli Şablon File Inputları */}
      <input
        ref={detayliInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => handleUploadTemplate("detayli", e.target.files?.[0])}
      />
      <input
        ref={matbuInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={(e) => handleUploadTemplate("matbu", e.target.files?.[0])}
      />

      {/* Kurumsal Koyu Lacivert Üst Başlık & Uyumlu Aksiyon Barı (Sunular Tasarımıyla Birebir Uyumlu) */}
      <div className="rounded-3xl p-5 sm:p-6 bg-gradient-to-r from-[#0b192c] via-[#132c52] to-[#1e3a8a] text-white shadow-xl shadow-slate-900/15 border border-slate-800/60 flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 print:hidden">
        <div className="flex items-start sm:items-center gap-3.5 min-w-0">
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-950/50 ring-1 ring-white/20 shrink-0">
            <FileText className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 border border-white/15 text-[11px] font-bold text-blue-200">
                <Sparkles className="w-3 h-3 text-amber-300" />
                Kurumsal Dilekçe Otomasyonu
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-[11px] font-bold text-emerald-200">
                Word (.docx) & A4 Çıktı
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Dilekçe İşlemleri
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/85 mt-0.5 max-w-2xl">
              Şablon üzerinden detaylı veya matbu dilekçe hazırlayın, yazdırın, Word indirin ve arşivleyin.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center justify-end gap-2.5 w-full xl:w-auto shrink-0">
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setIsTemplateModalOpen(true)}
              className="flex-1 sm:flex-none h-10.5 px-4 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 whitespace-nowrap backdrop-blur-xs transition-all active:scale-95"
            >
              <UploadCloud className="w-4 h-4 text-blue-200 shrink-0" />
              <span>Şablonları Yönet</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleStartFromTemplate("matbu")}
            className="flex-1 sm:flex-none h-11 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 whitespace-nowrap shadow-lg shadow-emerald-950/35 ring-1 ring-white/20 transition-all hover:-translate-y-0.5 active:scale-95"
          >
            <FileCheck2 className="w-4 h-4 shrink-0" />
            <span>Matbu Dilekçe Al</span>
          </button>

          <button
            type="button"
            onClick={() => handleStartFromTemplate("detayli")}
            className="flex-1 sm:flex-none h-11 px-5 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 hover:from-amber-400 hover:via-orange-500 hover:to-rose-400 text-white text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-2 whitespace-nowrap shadow-lg shadow-orange-950/35 ring-1 ring-white/25 transition-all hover:-translate-y-0.5 active:scale-95"
          >
            <FilePlus2 className="w-4 h-4 shrink-0" />
            <span>Detaylı Dilekçe Al</span>
          </button>
        </div>
      </div>

      {/* İstatistik Kartları */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-4 print:hidden">
        <div className="gov-card p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex items-center gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Toplam Dilekçe
            </p>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tabular-nums">{stats.totalCount}</h3>
          </div>
        </div>

        <div className="gov-card p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex items-center gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
            <FilePlus2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Detaylı Dilekçe
            </p>
            <h3 className="text-xl sm:text-2xl font-black text-indigo-700 tabular-nums">{stats.detayliCount}</h3>
          </div>
        </div>

        <div className="gov-card p-4 sm:p-5 rounded-2xl sm:rounded-3xl flex items-center gap-4">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <p className="text-[11px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Matbu Dilekçe
            </p>
            <h3 className="text-xl sm:text-2xl font-black text-emerald-700 tabular-nums">{stats.matbuCount}</h3>
          </div>
        </div>
      </div>

      {/* Dikkat Çekici Dilekçe Ara-Bul & Filtreleme Barı */}
      <search
        aria-label="Alınan dilekçelerde ara ve filtrele"
        className="bg-gradient-to-br from-blue-50/90 via-indigo-50/40 to-white p-4 sm:p-6 rounded-3xl shadow-md shadow-blue-900/5 border-2 border-blue-200/95 focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-500/15 transition-all space-y-3.5 sm:space-y-4 print:hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-600 text-white text-[11px] sm:text-xs font-extrabold tracking-wide shadow-sm shadow-blue-600/20">
              <Search className="w-3.5 h-3.5" aria-hidden="true" />
              DİLEKÇE ARA-BUL
            </span>
            <span className="text-xs sm:text-sm font-medium text-slate-600">
              Ad soyad, T.C. kimlik numarası veya dilekçe konusu ile anında filtreleyin
            </span>
          </div>
          {debouncedSearch.trim() && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {loading ? "Aranıyor..." : `${totalRecords} eşleşen dilekçe`}
            </span>
          )}
        </div>

        <div className="relative">
          <label htmlFor="petitions-search-input" className="sr-only">
            Dilekçe sahibinin adı soyadı, T.C. kimlik no veya konusu ile ara
          </label>
          <Search
            aria-hidden="true"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-600 w-5 h-5 pointer-events-none"
          />
          <input
            id="petitions-search-input"
            name="petitionSearch"
            type="search"
            enterKeyHint="search"
            placeholder="Dilekçe sahibinin adı soyadı, T.C. kimlik no veya konusu ile ara-bul..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full h-12 sm:h-13 pl-12 ${
              searchTerm ? "pr-28" : "pr-4"
            } rounded-2xl text-sm sm:text-base font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none transition-all ${
              searchTerm.trim()
                ? "bg-white border-2 border-blue-600 ring-4 ring-blue-500/20 shadow-md"
                : "bg-white border-2 border-blue-300/90 hover:border-blue-400 focus:border-blue-600 shadow-xs"
            }`}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-red-100 text-slate-700 hover:text-red-700 text-xs font-bold inline-flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              <span>Temizle</span>
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          {/* Tür Sekmeleri */}
          <div className="inline-flex items-center p-1 bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-x-auto">
            <button
              type="button"
              onClick={() => {
                setTypeFilter("all");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                typeFilter === "all"
                  ? "bg-blue-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tümü ({stats.totalCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeFilter("detayli");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                typeFilter === "detayli"
                  ? "bg-indigo-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Detaylı ({stats.detayliCount})
            </button>
            <button
              type="button"
              onClick={() => {
                setTypeFilter("matbu");
                setPage(1);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
                typeFilter === "matbu"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Matbu ({stats.matbuCount})
            </button>
          </div>

          {/* Sıralama */}
          <div className="flex items-center gap-2 justify-end">
            <SlidersHorizontal className="w-4 h-4 text-slate-500" aria-hidden="true" />
            <label htmlFor="petitions-sort-select" className="sr-only">
              Dilekçe sıralama ölçütü
            </label>
            <select
              id="petitions-sort-select"
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value as any);
                setPage(1);
              }}
              className="h-9.5 px-3.5 rounded-xl border border-slate-200/90 bg-white hover:border-blue-300 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-2xs"
            >
              <option value="date_desc">En Yeni Önce</option>
              <option value="date_asc">En Eski Önce</option>
              <option value="name_asc">Ad Soyad (A → Z)</option>
              <option value="name_desc">Ad Soyad (Z → A)</option>
            </select>
          </div>
        </div>
      </search>

      {/* Dilekçeler Listesi (Yatay Kaydırma Olmadan %100 Ekrana Sığan Tablo & Mobil Kartlar) */}
      <div className="gov-card rounded-3xl overflow-hidden print:hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between gap-2">
          <h2
            id="petitions-list-heading"
            className="text-sm sm:text-base font-extrabold text-slate-800 flex items-center gap-2"
          >
            <FileText className="w-4 h-4 text-blue-600" aria-hidden="true" />
            <span>Alınan Dilekçeler</span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-extrabold border border-blue-200/80 tabular-nums">
              {totalRecords}
            </span>
          </h2>
          <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">
            Görüntülemek veya yazdırmak için ilgili satıra tıklayabilirsiniz
          </span>
        </div>

        {/* Mobil Görünüm: Dilekçe Kartları */}
        <div className="md:hidden divide-y divide-slate-100">
          {loading ? (
            <div className="py-12 text-center text-slate-500 text-sm flex items-center justify-center gap-2">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Dilekçeler yükleniyor...
            </div>
          ) : petitions.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Kayıtlı dilekçe bulunamadı.
            </div>
          ) : (
            petitions.map((rec) => {
              const canDelete =
                isManager || String(rec.createdBy?._id || "") === String(userId || "");
              const canEdit = isPetitionEditable(rec);
              const isBusy = loadingContentId === rec._id;

              return (
                <div key={`mob-pet-${rec._id}`} className="p-4 space-y-2.5 bg-white">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold text-slate-900 truncate">
                        {highlightMatch(rec.citizenName, debouncedSearch)}
                      </div>
                      <div className="font-mono text-xs font-bold text-slate-600 mt-0.5">
                        TC: {highlightMatch(rec.tcNo, debouncedSearch)}
                      </div>
                    </div>
                    {rec.petitionType === "matbu" ? (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        Matbu
                      </span>
                    ) : (
                      <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        Detaylı
                      </span>
                    )}
                  </div>

                  {rec.subject && (
                    <div className="text-xs text-slate-600 line-clamp-2">
                      {highlightMatch(rec.subject, debouncedSearch)}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>{rec.createdBy?.name || "-"}</span>
                    <span className="font-mono">
                      {new Date(rec.createdAt).toLocaleDateString("tr-TR")}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleOpenPetition(rec, "preview")}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-800 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Görüntüle
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleOpenPetition(rec, "useAsTemplate")}
                        className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 inline-flex items-center gap-1"
                      >
                        <CopyPlus className="w-3.5 h-3.5" /> Şablon
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleOpenPetition(rec, "edit")}
                          aria-label="Düzenle"
                          className="p-2 rounded-xl text-indigo-600 bg-indigo-50"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeletePetition(rec)}
                          aria-label="Sil"
                          className="p-2 rounded-xl text-red-600 bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div
          role="region"
          aria-labelledby="petitions-list-heading"
          className="hidden md:block w-full overflow-hidden"
        >
          <table className="w-full table-fixed text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50/90 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th scope="col" className="py-3 px-3 w-[88px]">
                  Tür
                </th>
                <th scope="col" className="py-3 px-3 w-[25%]">
                  Dilekçe Sahibi / T.C.
                </th>
                <th scope="col" className="py-3 px-3">
                  Konu / Not
                </th>
                <th scope="col" className="py-3 px-3 w-[16%]">
                  Alan Personel
                </th>
                <th scope="col" className="py-3 px-2.5 w-[92px]">
                  Tarih
                </th>
                <th
                  scope="col"
                  className={`py-3 px-3 text-right ${
                    isSuperAdmin ? "w-[214px]" : "w-[178px]"
                  }`}
                >
                  İşlemler
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      Dilekçeler yükleniyor...
                    </div>
                  </td>
                </tr>
              ) : petitions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Kayıtlı dilekçe bulunamadı.
                  </td>
                </tr>
              ) : (
                petitions.map((rec) => {
                  const canDelete =
                    isManager || String(rec.createdBy?._id || "") === String(userId || "");
                  const canEdit = isPetitionEditable(rec);
                  const isBusy = loadingContentId === rec._id;

                  return (
                    <tr
                      key={rec._id}
                      onClick={() => handleOpenPetition(rec, "preview")}
                      className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="py-3 px-3 align-middle">
                        {rec.petitionType === "matbu" ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <FileCheck2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>Matbu</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                            <FilePlus2 className="w-3 h-3 shrink-0" aria-hidden="true" />
                            <span>Detaylı</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 align-middle min-w-0">
                        <div className="font-bold text-slate-900 group-hover:text-blue-700 truncate transition-colors">
                          {highlightMatch(rec.citizenName, debouncedSearch)}
                        </div>
                        <div className="font-mono text-xs font-semibold text-slate-500 truncate mt-0.5">
                          TC: {highlightMatch(rec.tcNo, debouncedSearch)}
                        </div>
                      </td>

                      <td className="py-3 px-3 align-middle min-w-0">
                        <div className="text-slate-600 text-xs sm:text-sm truncate">
                          {rec.subject ? highlightMatch(rec.subject, debouncedSearch) : "-"}
                        </div>
                      </td>

                      <td className="py-3 px-3 align-middle min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 text-xs font-semibold text-slate-700">
                          <UserIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                          <span className="truncate">{rec.createdBy?.name || "-"}</span>
                        </div>
                      </td>

                      <td className="py-3 px-2.5 align-middle text-xs font-mono text-slate-500 whitespace-nowrap">
                        {new Date(rec.createdAt).toLocaleDateString("tr-TR")}
                      </td>

                      <td
                        className="py-3 px-3 align-middle text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleOpenPetition(rec, "preview")}
                            aria-label="Dilekçeyi görüntüle ve yazdır"
                            className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-blue-600 text-slate-700 hover:text-white inline-flex items-center justify-center transition-colors shrink-0"
                            title="Görüntüle / Yazdır / Word İndir"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleOpenPetition(rec, "useAsTemplate")}
                            className="h-8 px-2.5 rounded-lg text-[11px] font-extrabold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors inline-flex items-center gap-1 shrink-0"
                            title="Bu dilekçeyi şablon olarak kullanıp yeni dilekçe oluştur"
                          >
                            <CopyPlus className="w-3.5 h-3.5 shrink-0" />
                            <span>Şablon</span>
                          </button>
                          {isSuperAdmin && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleSetAsDefaultTemplate(rec)}
                              aria-label="Varsayılan şablon yap"
                              className="w-8 h-8 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors inline-flex items-center justify-center shrink-0"
                              title="Bu dilekçeyi tüm özellikleri ile varsayılan şablon yap"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleOpenPetition(rec, "edit")}
                              aria-label="Dilekçeyi düzenle"
                              className="w-8 h-8 rounded-lg text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/80 transition-colors inline-flex items-center justify-center shrink-0"
                              title="Düzenle"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeletePetition(rec)}
                              aria-label="Dilekçeyi sil"
                              className="w-8 h-8 rounded-lg text-red-600 bg-red-50 hover:bg-red-100 border border-red-200/80 transition-colors inline-flex items-center justify-center shrink-0"
                              title="Sil"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Sayfalama */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50 text-xs text-slate-500">
          <span>
            Sayfa <strong>{page}</strong> / <strong>{totalPages}</strong> (Toplam {totalRecords}{" "}
            Kayıt)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700 flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Önceki
            </button>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 font-semibold text-slate-700 flex items-center gap-1"
            >
              Sonraki
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* SÜPER ADMİN ŞABLON YÖNETİM MODALI                                  */}
      {/* ================================================================= */}
      {isTemplateModalOpen && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setIsTemplateModalOpen(false)}
          />
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 space-y-5">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-600 rounded-2xl">
                  <UploadCloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Word (.docx) Dilekçe Şablonlarını Yönet
                  </h3>
                  <p className="text-xs text-slate-500">
                    Detaylı ve Matbu dilekçe şablonlarını (.docx) buradan yükleyip güncelleyebilirsiniz.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTemplateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Detaylı Dilekçe Şablonu */}
              <div className="p-4 rounded-2xl border-2 border-indigo-100 bg-indigo-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-800">
                    Detaylı Dilekçe Şablonu
                  </span>
                  {templates.detayli ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
                {templates.detayli ? (
                  <div className="text-xs text-slate-600 space-y-1">
                    <p className="font-bold text-slate-800 truncate">{templates.detayli.fileName}</p>
                    <p>
                      Güncelleme:{" "}
                      {new Date(templates.detayli.updatedAt).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Henüz şablon yüklenmemiş.</p>
                )}
                <button
                  type="button"
                  disabled={uploadingType === "detayli"}
                  onClick={() => detayliInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  {uploadingType === "detayli"
                    ? "Yükleniyor..."
                    : templates.detayli
                      ? "Şablonu Değiştir (.docx)"
                      : "Şablon Yükle (.docx)"}
                </button>
              </div>

              {/* Matbu Dilekçe Şablonu */}
              <div className="p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-1 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-800">
                    Matbu Dilekçe Şablonu
                  </span>
                  {templates.matbu ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
                {templates.matbu ? (
                  <div className="text-xs text-slate-600 space-y-1">
                    <p className="font-bold text-slate-800 truncate">{templates.matbu.fileName}</p>
                    <p>
                      Güncelleme: {new Date(templates.matbu.updatedAt).toLocaleDateString("tr-TR")}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Henüz şablon yüklenmemiş.</p>
                )}
                <button
                  type="button"
                  disabled={uploadingType === "matbu"}
                  onClick={() => matbuInputRef.current?.click()}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  <UploadCloud className="w-4 h-4" />
                  {uploadingType === "matbu"
                    ? "Yükleniyor..."
                    : templates.matbu
                      ? "Şablonu Değiştir (.docx)"
                      : "Şablon Yükle (.docx)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* DİLEKÇE ÖNİZLEME & ÇIKTI MODALI                                   */}
      {/* ================================================================= */}
      {previewPetition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:static print:p-0">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm print:hidden"
            onClick={() => setPreviewPetition(null)}
          />
          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 z-10 max-h-[92vh] flex flex-col print:max-h-none print:shadow-none print:border-none print:p-0">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 print:hidden">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">
                    {previewPetition.citizenName}
                  </h3>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${previewPetition.petitionType === "matbu"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-indigo-100 text-indigo-800"
                      }`}
                  >
                    {previewPetition.petitionType === "matbu" ? "Matbu" : "Detaylı"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-mono">
                  TC: {previewPetition.tcNo} • Alan: {previewPetition.createdBy?.name || "-"} •{" "}
                  {new Date(previewPetition.createdAt).toLocaleDateString("tr-TR")}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const rec = previewPetition;
                    setPreviewPetition(null);
                    setEditingId(null);
                    setEditorType(rec.petitionType);
                    setCitizenName("");
                    setTcNo("");
                    setSubject(rec.subject || "");
                    setEditorStaffInfo({
                      name: session?.user?.name || "Personel",
                      title: (session?.user as any)?.title || "Personel",
                    });
                    setEditorInitialHtml(
                      normalizePetitionTableHtml(
                        applyPetitionDateToHtml(rec.htmlContent || "<p></p>", new Date(), true),
                        rec.petitionType
                      )
                    );
                    setEditorMode(true);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Şablon Olarak Kullan
                </button>
                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => handleSetAsDefaultTemplate(previewPetition)}
                    className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Varsayılan Şablon Yap
                  </button>
                )}
                <button
                  type="button"
                  onClick={handlePrintCurrent}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Yazdır / PDF
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const { downloadPetitionAsDocx } = await import("@/lib/petitionDocx");
                    await downloadPetitionAsDocx(
                      previewPetition.htmlContent,
                      `${previewPetition.citizenName}_${previewPetition.petitionType}_Dilekce`,
                      {
                        name: previewPetition.createdBy?.name || "Personel",
                        title: previewPetition.createdBy?.title || "Personel",
                      }
                    );
                    toast.success("Word (.docx) dosyası indirildi.");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Word (.docx)
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewPetition(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overflow-x-auto bg-slate-100 p-2 sm:p-8 rounded-2xl mt-4 print:bg-white print:p-0 print:mt-0 print:overflow-visible">
              <style>{`@media print {
                @page { size: A4 portrait; margin: 0; }
                html, body {
                  background: #fff !important;
                  width: 210mm !important;
                  height: auto !important;
                  min-height: 0 !important;
                  margin: 0 !important;
                  padding: 0 !important;
                }
                body * { min-height: 0 !important; }
                #react-hot-toast,
                .toaster,
                [data-toaster-wrapper],
                [data-hot-toast],
                div[role="status"],
                div[aria-live="polite"],
                div[aria-live="assertive"],
                body > div[style*="fixed"],
                body > div[style*="position: fixed"] {
                  display: none !important;
                  visibility: hidden !important;
                  opacity: 0 !important;
                }
                [data-matbu-title],
                div[style*="fit-content"] {
                  margin-top: 12pt !important;
                  margin-bottom: 12pt !important;
                  margin-left: auto !important;
                  margin-right: auto !important;
                }
              }`}</style>
              <div className="w-[210mm] min-h-[260mm] print:w-[210mm] print:max-w-[210mm] print:h-[296mm] print:min-h-[296mm] print:box-border mx-auto bg-white shadow-md border border-slate-200 px-10 py-8 sm:px-14 sm:py-10 text-slate-900 print:shadow-none print:border-none print:px-[14mm] print:py-[12mm] flex flex-col justify-between">
                <div>
                  <div className="flex justify-center mb-3">
                    <img
                      src="/logo-vakif.jpg"
                      alt="Vakıf Logosu"
                      className="w-16 h-16 object-contain rounded-full"
                    />
                  </div>
                  <div
                    className={`text-slate-900 text-[13.5px] leading-snug [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-2 [&_p]:m-0 [&_p]:leading-snug [&_table]:w-full [&_table]:border-collapse [&_tr]:!h-auto [&_td]:!py-1.5 [&_td]:!px-2.5 [&_td]:!align-middle [&_td_p]:!m-0 [&_td_p]:!leading-snug [&_th]:!py-1.5 [&_th]:!px-2.5 [&_th]:!align-middle [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 ${previewPetition.petitionType === "matbu"
                        ? "[&_td]:!border-0 [&_th]:!border-0"
                        : "[&_td]:border [&_td]:border-black [&_th]:border [&_th]:border-black"
                      }`}
                    dangerouslySetInnerHTML={{ __html: previewPetition.htmlContent }}
                  />
                </div>

                {/* Standart Altbilgi (Resim 2 formatı) */}
                <div className="pt-8 mt-6 flex justify-between items-end gap-6 text-[10.5px] leading-snug text-slate-600 select-none">
                  <div className="space-y-0.5">
                    <p>Babademirtaş Mahallesi Sebil Sokak No:15/EDİRNE</p>
                    <p>Telefon No: 0 (284) 2120957 Faks No: 0(284) 2120957</p>
                    <p>e-Posta: edirnesydv@gmail.com</p>
                  </div>
                  <div className="space-y-0.5 text-left min-w-[200px]">
                    <p>Bilgi için: {previewPetition.createdBy?.name || "Personel"}</p>
                    <p>{previewPetition.createdBy?.title || "Personel"}</p>
                    <p>Telefon No: 0 (284) 2120957</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Silme Onay Modalı */}
      <ModernConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        type={confirmState.type}
        isLoading={confirmState.isLoading}
        onConfirm={confirmState.onConfirm}
        onClose={() => setConfirmState((p) => ({ ...p, isOpen: false }))}
      />
    </div>
  );
}
