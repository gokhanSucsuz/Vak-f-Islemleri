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
