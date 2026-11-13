/**
 * Tarih ve saat işlemleri için yerel (Türkiye) ve UTC tutarlılığı sağlayan yardımcı fonksiyonlar.
 */

/**
 * Verilen tarihi (veya bugünü) yerel saat dilimine göre "YYYY-MM-DD" formatına çevirir.
 * Gece 00:00-03:00 arası UTC kayması nedeniyle bir önceki günün çıkmasını engeller.
 */
export function toLocalDateInputValue(date?: string | Date | null): string {
  const d = date ? new Date(date) : new Date();
  if (isNaN(d.getTime())) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * "YYYY-MM-DD" formatındaki başlangıç tarihini yerel günün başlangıcına (00:00:00.000) çevirip ISO string döndürür.
 */
export function toLocalDayStartISO(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T00:00:00`).toISOString();
  }
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/**
 * "YYYY-MM-DD" formatındaki bitiş tarihini yerel günün sonuna (23:59:59.999) çevirip ISO string döndürür.
 */
export function toLocalDayEndISO(dateStr: string): string {
  if (!dateStr) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T23:59:59.999`).toISOString();
  }
  const d = new Date(dateStr);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

/**
 * Sunucu tarafında "YYYY-MM-DD" gelen teslim tarihini öğlen UTC (12:00:00.000Z) olarak kaydeder.
 * Böylece tüm saat dilimlerinde (UTC+3 dahil) tarih bir gün ileri veya geri kaymaz.
 */
export function parseDeliveryDate(dateInput?: string | Date | null): Date {
  if (!dateInput) return new Date();
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
    return new Date(`${dateInput.trim()}T12:00:00.000Z`);
  }
  const parsed = new Date(dateInput);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * İki tarih arasındaki takvim günü farkını Türkiye saat dilimine (Europe/Istanbul) göre hesaplar.
 * Bugün -> 0, Dün -> 1, Yarın -> -1 döndürür.
 */
export function getCalendarDaysDiff(fromDate: Date | string, toDate: Date | string = new Date()): number {
  const tz = "Europe/Istanbul";
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const fromStr = fmt.format(new Date(fromDate));
  const toStr = fmt.format(new Date(toDate));

  const fromUtc = Date.UTC(
    Number(fromStr.slice(0, 4)),
    Number(fromStr.slice(5, 7)) - 1,
    Number(fromStr.slice(8, 10))
  );
  const toUtc = Date.UTC(
    Number(toStr.slice(0, 4)),
    Number(toStr.slice(5, 7)) - 1,
    Number(toStr.slice(8, 10))
  );

  return Math.round((toUtc - fromUtc) / (1000 * 60 * 60 * 24));
}

