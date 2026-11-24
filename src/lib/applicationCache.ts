import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";
import "@/models/User";
import { normalizeTurkish } from "@/lib/turkish";

export interface CachedAppRecord {
  doc: any;
  _normAppNo: string;
  _normTc: string;
  _normSpouseTc: string;
  _normName: string;
  _normSpouse: string;
  _normHaystack: string;
}

export interface SheetSummary {
  name: string;
  count: number;
  columnHeaders: string[];
}

export interface ApplicationCacheData {
  items: CachedAppRecord[];
  totalCount: number;
  emptyCount: number;
  activeCount: number;
  sheets: SheetSummary[];
  highestBySheet: Record<string, any>;
  highestOverall: any;
  loadedAt: number;
}

const g = globalThis as unknown as {
  __appFilesCache?: ApplicationCacheData | null;
  __appFilesCachePromise?: Promise<ApplicationCacheData> | null;
};

const FRESH_TTL_MS = 5 * 60 * 1000;
const MAX_STALE_TTL_MS = 30 * 60 * 1000;

export function invalidateApplicationCache() {
  g.__appFilesCache = null;
  g.__appFilesCachePromise = null;
}

export function peekApplicationCache(): ApplicationCacheData | null {
  const existing = g.__appFilesCache;
  if (!existing) return null;
  const age = Date.now() - existing.loadedAt;
  if (age >= FRESH_TTL_MS && !g.__appFilesCachePromise) {
    // Stale-while-revalidate: mevcut önbelleği 0ms'de dön, arka planda sessizce tazele
    void refreshApplicationCacheInBackground();
  }
  if (age < MAX_STALE_TTL_MS) {
    return existing;
  }
  return null;
}

export function warmApplicationCache() {
  if (!g.__appFilesCache && !g.__appFilesCachePromise) {
    void refreshApplicationCacheInBackground();
  }
}

async function refreshApplicationCacheInBackground(): Promise<ApplicationCacheData> {
  if (g.__appFilesCachePromise) {
    return g.__appFilesCachePromise;
  }

  g.__appFilesCachePromise = (async () => {
    await dbConnect();
    const rawDocs = await ApplicationFile.find({})
      .sort({ applicationNoSeq: -1, createdAt: -1 })
      .lean();

    let emptyCount = 0;
    const sheetMap = new Map<string, { count: number; columnHeaders: string[] }>();
    const highestBySheet: Record<string, any> = {};
    let highestOverall: any = null;

    const items: CachedAppRecord[] = rawDocs.map((doc: any) => {
      const isEmpty =
        !doc.applicantName ||
        String(doc.applicantName).trim() === "" ||
        doc.fileStatus === "Boş Dosya";
      if (isEmpty) emptyCount++;

      const sName = doc.sheetName ? String(doc.sheetName) : "";
      if (sName) {
        const existing = sheetMap.get(sName);
        if (!existing) {
          const cleanHeaders = ((doc.columnHeaders || []) as string[])
            .filter((c) => c && typeof c === "string" && !c.startsWith("__EMPTY") && c.trim() !== "")
            .slice(0, 6);
          sheetMap.set(sName, { count: 1, columnHeaders: cleanHeaders });
        } else {
          existing.count++;
          if (existing.columnHeaders.length === 0 && Array.isArray(doc.columnHeaders)) {
            existing.columnHeaders = (doc.columnHeaders as string[])
              .filter((c) => c && typeof c === "string" && !c.startsWith("__EMPTY") && c.trim() !== "")
              .slice(0, 6);
          }
        }

        if (
          !highestBySheet[sName] ||
          (doc.applicationNoSeq || 0) > (highestBySheet[sName].applicationNoSeq || 0)
        ) {
          highestBySheet[sName] = doc;
        }
      }

      if (
        !highestOverall ||
        (doc.applicationNoSeq || 0) > (highestOverall.applicationNoSeq || 0)
      ) {
        highestOverall = doc;
      }

      const _normAppNo = normalizeTurkish(String(doc.applicationNo || "")).replace(/^#/, "");
      const _normTc = normalizeTurkish(String(doc.tcNo || ""));
      const _normSpouseTc = normalizeTurkish(String(doc.spouseTcNo || ""));
      const _normName = normalizeTurkish(String(doc.applicantName || ""));
      const _normSpouse = normalizeTurkish(String(doc.spouseName || ""));
      const _normHaystack = normalizeTurkish(
        [
          doc.applicationNo,
          doc.applicantName,
          doc.spouseName,
          doc.tcNo,
          doc.spouseTcNo,
          doc.helpType,
          doc.neighborhood,
          doc.phone,
          doc.address,
          doc.notes,
        ]
          .filter(Boolean)
          .join(" ")
      );

      return {
        doc,
        _normAppNo,
        _normTc,
        _normSpouseTc,
        _normName,
        _normSpouse,
        _normHaystack,
      };
    });

    const sheets: SheetSummary[] = Array.from(sheetMap.entries()).map(([name, val]) => ({
      name,
      count: val.count,
      columnHeaders: val.columnHeaders,
    }));

    sheets.sort((a, b) => {
      if (a.name === "YENİ BAŞVURU KAYIT") return -1;
      if (b.name === "YENİ BAŞVURU KAYIT") return 1;
      return a.name.localeCompare(b.name, "tr");
    });

    const totalCount = rawDocs.length;
    const activeCount = totalCount - emptyCount;

    const cacheData: ApplicationCacheData = {
      items,
      totalCount,
      emptyCount,
      activeCount,
      sheets,
      highestBySheet,
      highestOverall,
      loadedAt: Date.now(),
    };

    g.__appFilesCache = cacheData;
    g.__appFilesCachePromise = null;
    return cacheData;
  })().catch((err) => {
    g.__appFilesCachePromise = null;
    throw err;
  });

  return g.__appFilesCachePromise;
}

export async function getApplicationCache(): Promise<ApplicationCacheData> {
  const ready = peekApplicationCache();
  if (ready) return ready;
  return refreshApplicationCacheInBackground();
}
