import * as XLSX from "xlsx";

/**
 * Türkçe karakter uyumlu küçük harfe dönüştürme
 */
export function toTurkishLower(str: string): string {
  if (!str) return "";
  return str.toLocaleLowerCase("tr-TR");
}

/**
 * Türkçe karakter uyumlu büyük harfe dönüştürme
 */
export function toTurkishUpper(str: string): string {
  if (!str) return "";
  return str.toLocaleUpperCase("tr-TR");
}

/**
 * Türkçe karakterleri ASCII benzerlerine dönüştürerek esnek arama yapılmasını sağlar
 * Örneğin kullanıcı "ayse" yazdığında "Ayşe", "ismail" yazdığında "İsmail" eşleşebilir.
 */
export function normalizeTurkish(str: string): string {
  if (!str) return "";
  return str
    .replace(/Ğ/g, "g")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/ü/g, "u")
    .replace(/Ş/g, "s")
    .replace(/ş/g, "s")
    .replace(/İ/g, "i")
    .replace(/ı/g, "i")
    .replace(/I/g, "i")
    .replace(/Ö/g, "o")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "c")
    .replace(/ç/g, "c")
    .toLowerCase()
    .trim();
}

/**
 * Türkçe karakter uyumlu metin arama kontrolü.
 * Hem orijinal Türkçe yerel karakterlerle hem de normalize edilmiş halleriyle kontrol eder.
 */
export function turkishIncludes(source: string, search: string): boolean {
  if (!search) return true;
  if (!source) return false;

  const sourceTr = toTurkishLower(source);
  const searchTr = toTurkishLower(search);
  if (sourceTr.includes(searchTr)) return true;

  const sourceNorm = normalizeTurkish(source);
  const searchNorm = normalizeTurkish(search);
  return sourceNorm.includes(searchNorm);
}

/**
 * Metin içindeki 11 haneli TC Kimlik Numarasını ayıklar
 */
export function extractTC(text: string): string | null {
  if (!text) return null;
  const match = text.match(/\b\d{11}\b/);
  return match ? match[0] : null;
}

/**
 * Verileri Türkçe karakter uyumlu şekilde Excel (.xlsx) dosyası olarak dışa aktarır
 */
export function exportToExcel(data: any[], fileName: string, sheetName = "Sayfa1") {
  if (!data || data.length === 0) {
    alert("Dışa aktarılacak veri bulunamadı.");
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Otomatik sütun genişliği hesaplama
  const colWidths = Object.keys(data[0] || {}).map((key) => {
    const maxLen = Math.max(
      key.length,
      ...data.map((item) => (item[key] ? String(item[key]).length : 0))
    );
    return { wch: Math.min(Math.max(maxLen + 3, 12), 50) };
  });
  worksheet["!cols"] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const cleanFileName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(workbook, cleanFileName, { bookType: "xlsx" });
}

/**
 * Başvuru ve Hane Dosyaları için Kurumsal Başlıklı, Otomatik Sütun Genişlikli ve Özet Satırlı Şık Excel Çıktısı
 */
export function exportStyledApplicationExcel(
  records: any[],
  fileName: string,
  options?: {
    institutionName?: string;
    reportTitle?: string;
    filterInfo?: string;
  }
) {
  if (!records || records.length === 0) {
    alert("Dışa aktarılacak kayıt bulunamadı.");
    return;
  }

  // Antet ve Başlık Satırları
  const title1 = options?.institutionName || "T.C. SOSYAL YARDIMLAŞMA VE DAYANIŞMA VAKFI BAŞKANLIĞI";
  const title2 = options?.reportTitle || "HANE VE BAŞVURU DOSYALARI CETVELİ";
  const title3 = `Rapor Tarihi: ${new Date().toLocaleDateString("tr-TR")} ${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} | ${options?.filterInfo || `Toplam: ${records.length} Kayıt`}`;

  // Temel Sütun Başlıkları
  const baseHeaders = [
    "Sıra",
    "Başvuru / Hane No",
    "T.C. Kimlik No",
    "Adı Soyadı",
    "Telefon",
    "Adres / Mahalle",
    "Durum",
    "Kayıt Tarihi",
    "Açıklama / Notlar",
  ];

  // Excel'den aktarılmış dinamik ek sütunları keşfet
  const extraKeysSet = new Set<string>();
  records.forEach((r) => {
    if (r.extraData && typeof r.extraData === "object") {
      Object.keys(r.extraData).forEach((k) => extraKeysSet.add(k));
    }
  });
  const extraHeaders = Array.from(extraKeysSet);
  const allHeaders = [...baseHeaders, ...extraHeaders];

  // Satır Dizisi (AOA)
  const rows: any[][] = [];
  rows.push([title1]); // Satır 1: Kurum Başlığı
  rows.push([title2]); // Satır 2: Belge Başlığı
  rows.push([title3]); // Satır 3: Rapor ve Filtre Bilgisi
  rows.push([]);       // Satır 4: Boşluk
  rows.push(allHeaders); // Satır 5: Tablo Başlıkları

  let activeCount = 0;
  let emptyCount = 0;

  records.forEach((r, idx) => {
    const isNameEmpty = !r.applicantName || r.applicantName.trim() === "";
    if (isNameEmpty) emptyCount++;
    else activeCount++;

    const rowData = [
      idx + 1,
      r.applicationNo ? `#${r.applicationNo}` : "-",
      r.tcNo || "-",
      r.applicantName || "(Boş Dosya)",
      r.phone || "-",
      r.address || "-",
      r.fileStatus || (isNameEmpty ? "Boş Dosya" : "Aktif"),
      r.createdAt ? new Date(r.createdAt).toLocaleDateString("tr-TR") : "-",
      r.notes || "-",
    ];

    extraHeaders.forEach((key) => {
      rowData.push(r.extraData?.[key] ?? "-");
    });

    rows.push(rowData);
  });

  // Özet İcmal Satırı
  rows.push([]); // Boşluk
  const summaryRow = [
    "GENEL TOPLAM",
    `Toplam ${records.length} Kayıt (${activeCount} Dolu Dosya, ${emptyCount} Boş Dosya)`,
  ];
  rows.push(summaryRow);

  const worksheet = XLSX.utils.aoa_to_sheet(rows);

  // Başlıklar için hücre birleştirme (Merges)
  const totalCols = allHeaders.length;
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(totalCols - 1, 4) } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: Math.max(totalCols - 1, 4) } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: Math.max(totalCols - 1, 4) } },
    { s: { r: rows.length - 1, c: 1 }, e: { r: rows.length - 1, c: Math.max(totalCols - 1, 4) } },
  ];

  // Otomatik sütun genişlikleri hesaplama
  worksheet["!cols"] = allHeaders.map((header, cIdx) => {
    let maxLen = header.length;
    for (let rIdx = 4; rIdx < rows.length - 2; rIdx++) {
      const cellVal = rows[rIdx]?.[cIdx];
      if (cellVal !== undefined && cellVal !== null) {
        maxLen = Math.max(maxLen, String(cellVal).length);
      }
    }
    return { wch: Math.min(Math.max(maxLen + 4, 12), 55) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Başvuru Dosyaları");

  const cleanFileName = fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
  XLSX.writeFile(workbook, cleanFileName, { bookType: "xlsx" });
}
