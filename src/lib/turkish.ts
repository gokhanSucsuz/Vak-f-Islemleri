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
 * Sütun başlıklarını boşluk, noktalama, bölü, alt çizgi ve Türkçe karakterlerden arındırarak
 * esnek ve hatasız eşleştirilmesini sağlar.
 * Örn: "MAHALLE / KÖY" -> "mahallekoy", "YARDIM TÜRÜ " -> "yardimturu"
 */
export function cleanHeaderKey(key: string): string {
  if (!key) return "";
  return key
    .replace(/\r?\n|\r/g, " ")
    .replace(/[\s\-_/\\.:,;()[\]{}*+]/g, "")
    .replace(/Ğ/g, "g").replace(/ğ/g, "g")
    .replace(/Ü/g, "u").replace(/ü/g, "u")
    .replace(/Ş/g, "s").replace(/ş/g, "s")
    .replace(/İ/g, "i").replace(/ı/g, "i").replace(/I/g, "i")
    .replace(/Ö/g, "o").replace(/ö/g, "o")
    .replace(/Ç/g, "c").replace(/ç/g, "c")
    .toLowerCase()
    .trim();
}

/**
 * Regex özel karakterlerini güvenli bir şekilde kaçırır
 */
export function escapeRegex(text: string): string {
  if (!text) return "";
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

/**
 * Türkçe karakter uyumlu esnek Regex arama deseni üretir.
 * Örneğin "c" yazıldığında [cçCÇ], "i" yazıldığında [ıIİi] desenini döndürerek
 * veritabanı veya istemci tarafında mükemmel eşleşme sağlar.
 */
export function toTurkishRegexPattern(text: string): string {
  if (!text) return "";
  const escaped = escapeRegex(text);
  return escaped
    .replace(/[cçCÇ]/g, "[cçCÇ]")
    .replace(/[gğGĞ]/g, "[gğGĞ]")
    .replace(/[ıIİi]/g, "[ıIİi]")
    .replace(/[oöOÖ]/g, "[oöOÖ]")
    .replace(/[sşSŞ]/g, "[sşSŞ]")
    .replace(/[uüUÜ]/g, "[uüUÜ]");
}

/**
 * Türkçe karakter uyumlu metin arama kontrolü.
 * Hem orijinal Türkçe yerel karakterlerle hem de normalize edilmiş halleriyle kontrol eder.
 * Çoklu kelime desteği sağlar (kullanıcı birden fazla kelime girdiğinde her kelimenin metinde bulunmasını arar).
 * Boşluk veya normalize edilmiş boşluk hatasıyla tüm kayıtların eşleşmesini kesin olarak engeller.
 */
export function turkishIncludes(source: string, search: string): boolean {
  if (!search) return true;
  const cleanSearch = search.trim();
  if (!cleanSearch) return true;
  if (!source) return false;
  const cleanSource = source.trim();
  if (!cleanSource) return false;

  const searchTokens = cleanSearch.split(/\s+/).filter(Boolean);
  if (searchTokens.length === 0) return true;

  const sourceTr = toTurkishLower(cleanSource);
  const sourceNorm = normalizeTurkish(cleanSource);

  return searchTokens.every((token) => {
    const tokenTr = toTurkishLower(token);
    if (sourceTr.includes(tokenTr)) return true;

    const tokenNorm = normalizeTurkish(token);
    if (tokenNorm && sourceNorm.includes(tokenNorm)) return true;

    return false;
  });
}

/**
 * Metin içindeki 11 haneli TC Kimlik Numarasını ayıklar
 */
export function extractTC(text: string): string | null {
  if (!text) return null;
  const match = text.match(/\b\d{11}\b/) || text.match(/\d{11}/);
  return match ? match[0] : null;
}

/**
 * Metin içindeki 11 haneli T.C. Kimlik Numarasını ayıklar ve metinden temizler
 * Örn: "12345678901 AHMET YILMAZ" -> { tc: "12345678901", cleanText: "AHMET YILMAZ" }
 */
export function extractAndCleanTC(text: string): { tc: string | null; cleanText: string } {
  if (!text) return { tc: null, cleanText: "" };
  const str = String(text).trim();
  const match = str.match(/\b\d{11}\b/) || str.match(/\d{11}/);
  if (!match) {
    return { tc: null, cleanText: str };
  }
  const tc = match[0];
  const cleanText = str
    .replace(tc, "")
    .replace(/[()\[\]\-–—:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { tc, cleanText };
}

/**
 * Excel serial number, tarih stringi veya metin içindeki tarihi ayıklar
 * Eğer geçerli bir tarih yoksa null döner (varsayılan tarih atanmaz).
 */
export function parseDateOrExtractDate(val: any): { date: Date | null; remainingText: string } {
  if (val === undefined || val === null || val === "") {
    return { date: null, remainingText: "" };
  }

  // Zaten JS Date nesnesi
  if (val instanceof Date && !isNaN(val.getTime())) {
    return { date: val, remainingText: "" };
  }

  // Excel serial number (örn: 44927 -> 2023-01-01)
  if (typeof val === "number" && val > 20000 && val < 70000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + val * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return { date, remainingText: "" };
    }
  }

  const str = String(val).trim();

  // Desen 1: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY
  const matchDMY = str.match(/\b(\d{1,2})[./\-](\d{1,2})[./\-](\d{4})\b/);
  if (matchDMY) {
    const day = parseInt(matchDMY[1], 10);
    const month = parseInt(matchDMY[2], 10) - 1;
    const year = parseInt(matchDMY[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      const remainingText = str
        .replace(matchDMY[0], "")
        .replace(/[()\[\]\-–—:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { date, remainingText };
    }
  }

  // Desen 2: YYYY-MM-DD, YYYY.MM.DD
  const matchYMD = str.match(/\b(\d{4})[./\-](\d{1,2})[./\-](\d{1,2})\b/);
  if (matchYMD) {
    const year = parseInt(matchYMD[1], 10);
    const month = parseInt(matchYMD[2], 10) - 1;
    const day = parseInt(matchYMD[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) {
      const remainingText = str
        .replace(matchYMD[0], "")
        .replace(/[()\[\]\-–—:]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      return { date, remainingText };
    }
  }

  return { date: null, remainingText: str };
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
    "Eşinin Adı Soyadı",
    "Yardım Türü",
    "Kayıt / Başvuru Tarihi",
    "Mahalle / Köy",
    "Telefon",
    "Adres",
    "Durum",
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

    const dateStr = r.applicationDate
      ? new Date(r.applicationDate).toLocaleDateString("tr-TR")
      : r.createdAt
      ? new Date(r.createdAt).toLocaleDateString("tr-TR")
      : "";

    const rowData = [
      idx + 1,
      r.applicationNo ? `#${r.applicationNo}` : "-",
      r.tcNo || "-",
      r.applicantName || "(Boş Dosya)",
      r.spouseName || "-",
      r.helpType || "-",
      dateStr || "-",
      r.neighborhood || "-",
      r.phone || "-",
      r.address || "-",
      r.fileStatus || (isNameEmpty ? "Boş Dosya" : "Aktif"),
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

/**
 * Edirne Merkez Mahalleleri (24 Resmi Mahalle + Yerel Kayıtlar)
 */
export const EDIRNE_MAHALLELERI = [
  "1. MURAT", "1.MURAT", "BİRİNCİ MURAT", "I. MURAT",
  "100. YIL", "100.YIL",
  "ABDURRAHMAN",
  "ATATÜRK",
  "BABADEMİRTAŞ", "BABA DEMİRTAŞ",
  "BARIŞ",
  "BARUTLUK",
  "BELEDİYE EVLERİ",
  "CUMHURİYET",
  "ÇAVUŞBEY", "ÇAVUŞ BEY",
  "DİLAVERBEY", "DİLAVER BEY", "DOĞANDİLAVERBEY", "DOĞAN DİLAVER BEY",
  "DURSUNLU",
  "FATİH",
  "İSTASYON",
  "IZGIN",
  "KARAAĞAÇ", "KARA AĞAÇ",
  "KOCASİNAN", "KOCA SİNAN",
  "KOZLUK",
  "KURTULUŞ",
  "MEDRESE ALİ BEY", "MEDRESE ALİBEY", "MEDRESEALİBEY",
  "MENZİLAHIR", "MENZİL AHIR",
  "MEYDAN",
  "MIZRAKLI",
  "MİMAR SİNAN", "MİMARSİNAN",
  "MİTHATPAŞA", "MİTHAT PAŞA",
  "NİŞANCIPAŞA", "NİŞANCI PAŞA",
  "SABUNİ",
  "SARICAPAŞA", "SARICA PAŞA",
  "ŞÜKRÜPAŞA", "ŞÜKRÜ PAŞA",
  "TALATPAŞA", "TALAT PAŞA",
  "UMURBEY", "UMUR BEY",
  "YANCIKÇI ŞAHİN", "YANCIKÇIŞAHİN",
  "YENİİMARET", "YENİ İMARET",
  "YEŞİLYURT",
  "YILDIRIM BEYAZIT", "YILDIRIM BEYAZID", "YILDIRIM BEYAZIT MAH",
  "YILDIRIM HACI SARRAF", "YILDIRIM HACISARRAF", "HACI SARRAF",
  "ZAVİYE"
];

/**
 * Edirne Merkez Köyleri (38 Köy + Varyasyonlar)
 */
export const EDIRNE_KOYLERI = [
  "AHİ", "AHİKÖY", "AHİ KÖYÜ",
  "AVARIZ",
  "BOSNA", "BOSNAKÖY", "BOSNA KÖYÜ",
  "BUDAKDOĞANCA",
  "BÜYÜKDÖLLÜK", "BÜYÜK DÖLLÜK",
  "BÜYÜKİSMAİLCE", "BÜYÜKİSMAİLÇE", "BÜYÜK İSMAİLCE",
  "DEĞİRMENYANI", "DEĞİRMEN YANI",
  "DEĞİRMENYENİ", "DEĞİRMEN YENİ", "DEĞİRMENYENİKÖY",
  "DEMİRHANLI",
  "DOYRAN",
  "EKMEKÇİ",
  "ELÇİLİ",
  "ESKİKADIN", "ESKİ KADIN",
  "HACIUMUR", "HACI UMUR",
  "HASANAĞA", "HASAN AĞA",
  "HATİP", "HATİPKÖY", "HATİP KÖY",
  "HIDIRAĞA", "HIDIR AĞA",
  "İSKENDER", "İSKENDERKÖY", "İSKENDER KÖY",
  "KARAKASIM",
  "KARAYUSUF", "KARA YUSUF",
  "KAYAPA",
  "KEMAL", "KEMALKÖY", "KEMAL KÖY",
  "KORUCU", "KORUCUKÖY",
  "KÖŞENÇİFTLİĞİ", "KÖŞEN ÇİFTLİĞİ",
  "KÜÇÜKDÖLLÜK", "KÜÇÜK DÖLLÜK",
  "MENEKŞESOFULAR", "MENEKŞE SOFULAR",
  "MURATÇALI",
  "MUSABEYLİ",
  "ORHANİYE",
  "SARAYAKPINAR", "SARAY AKPINAR",
  "SAZLIDERE",
  "SUAKACAĞI", "SU AKACAĞI",
  "TAYAKADIN", "TAYA KADIN",
  "UZGAÇ",
  "ÜYÜKLÜTATAR", "ÜYÜKLÜ TATAR",
  "YENİKADIN", "YENİ KADIN",
  "YOLÜSTÜ"
];

function normalizeForLocationMatch(s: string): string {
  if (!s) return "";
  return String(s)
    .replace(/Ğ/g, "g").replace(/ğ/g, "g")
    .replace(/Ü/g, "u").replace(/ü/g, "u")
    .replace(/Ş/g, "s").replace(/ş/g, "s")
    .replace(/İ/g, "i").replace(/ı/g, "i").replace(/I/g, "i")
    .replace(/Ö/g, "o").replace(/ö/g, "o")
    .replace(/Ç/g, "c").replace(/ç/g, "c")
    .toLowerCase()
    .replace(/[\s\-_/\\.:,;()[\]{}*+]/g, "")
    .trim();
}

// Canonical lookup tablosu
const EDIRNE_LOCATION_MAP = new Map<string, string>();

for (const m of EDIRNE_MAHALLELERI) {
  const norm = normalizeForLocationMatch(m);
  const canon = m.toLocaleUpperCase("tr-TR");
  EDIRNE_LOCATION_MAP.set(norm, canon);
  EDIRNE_LOCATION_MAP.set(normalizeForLocationMatch(m + "MAHALLESI"), canon);
  EDIRNE_LOCATION_MAP.set(normalizeForLocationMatch(m + "MAH"), canon);
}

for (const k of EDIRNE_KOYLERI) {
  const norm = normalizeForLocationMatch(k);
  const canon = k.toLocaleUpperCase("tr-TR");
  EDIRNE_LOCATION_MAP.set(norm, canon);
  EDIRNE_LOCATION_MAP.set(normalizeForLocationMatch(k + "KOYU"), canon);
  EDIRNE_LOCATION_MAP.set(normalizeForLocationMatch(k + "KOY"), canon);
}

/**
 * Verilen metnin Edirne Merkez mahalle veya köy adı olup olmadığını ayırt eder.
 * Mahalle veya köy ise standart/kanonik adını döner, değilse null döner.
 * Telefon numaralarını, tarihleri, yardım türlerini (GSS, ŞNT, YB+) ve notları filtreler.
 */
export function matchEdirneMahalleKoy(val: any): string | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;

  // Rakam, telefon veya T.C. kontrolü
  const digitsOnly = str.replace(/\D/g, "");
  if (digitsOnly.length >= 7) return null;
  if (/^\d+$/.test(str)) return null;
  if (/^\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}$/.test(str)) return null;

  // Yardım türleri veya sistem metinlerini hariç tut
  const upper = str.toLocaleUpperCase("tr-TR");
  if (
    upper.includes("GSS") ||
    upper.includes("ŞNT") ||
    upper.includes("SNT") ||
    upper.includes("YB+") ||
    upper.includes("YARDIM") ||
    upper.includes("AKTARIM") ||
    upper.includes("EVRAK") ||
    upper.includes("PROJE") ||
    upper.includes("TAKİP") ||
    upper.includes("TAKIP")
  ) {
    return null;
  }

  const norm = normalizeForLocationMatch(str);
  if (!norm || norm.length < 3) return null;

  // 1. Doğrudan eşleşme
  if (EDIRNE_LOCATION_MAP.has(norm)) {
    return EDIRNE_LOCATION_MAP.get(norm)!;
  }

  // 2. "mahallesi", "mah", "koyu", "koy" eklerini temizleyerek kontrol
  const stripped = norm.replace(/mahallesi$|mah$|koyu$|koy$/g, "");
  if (EDIRNE_LOCATION_MAP.has(stripped)) {
    return EDIRNE_LOCATION_MAP.get(stripped)!;
  }

  // 3. Eşleşme kontrolü
  for (const [key, canon] of EDIRNE_LOCATION_MAP.entries()) {
    if (key.length >= 4 && norm === key) {
      return canon;
    }
  }

  return null;
}

/**
 * Bir veri satırının aslında Excel sütun başlığı olup olmadığını tespit eder.
 * Kullanıcıların Excel içine araya kopyaladığı mükerrer başlık satırlarının veri olarak eklenmesini önler.
 */
export function isHeaderRow(row: Record<string, any>): boolean {
  if (!row || typeof row !== "object") return false;

  const headerKeywords = [
    "basvuruno",
    "adisoyadi",
    "adsoyad",
    "esininadi",
    "esininadisoyadi",
    "yardimturu",
    "mahallekoy",
    "mahalle",
    "koy",
    "basvurutarihi",
    "kayittarihi",
    "sirano",
    "tcno",
    "tckimlikno",
    "esiyakiniadisoyadi",
    "esiyakinitcno",
    "uyrugu",
    "mahallesikoyu",
    "mahallesikoy",
    "mahallekoyu",
  ];

  let matches = 0;
  for (const [key, val] of Object.entries(row)) {
    if (val === undefined || val === null) continue;
    const cleanK = cleanHeaderKey(key);
    const cleanV = cleanHeaderKey(String(val));
    if (!cleanV) continue;

    if (headerKeywords.includes(cleanV)) {
      matches++;
    }

    // Sütun adı ile hücre içeriği aynıysa (örn: "BAŞVURU NO" sütununda "BAŞVURU NO" yazıyorsa)
    if (cleanK && cleanV && cleanK === cleanV && headerKeywords.includes(cleanK)) {
      return true;
    }
  }

  return matches >= 2;
}

