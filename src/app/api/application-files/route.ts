import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";
import User from "@/models/User";
import Log from "@/models/Log";
import { toTurkishRegexPattern, normalizeTurkish } from "@/lib/turkish";
import { isEncryptionEnabled } from "@/lib/encryption";
import {
  getApplicationCache,
  peekApplicationCache,
  warmApplicationCache,
  invalidateApplicationCache,
  type CachedAppRecord,
} from "@/lib/applicationCache";

function computeCachedRelevance(
  item: CachedAppRecord,
  normSearch: string,
  normTokens: string[]
): number {
  const { _normAppNo: appNo, _normTc: tc, _normSpouseTc: spouseTc, _normName: name, _normSpouse: spouse } = item;

  if (
    (tc && tc === normSearch) ||
    (spouseTc && spouseTc === normSearch) ||
    (appNo && (appNo === normSearch || appNo.endsWith(`-${normSearch}`)))
  ) {
    return 1000;
  }

  if (name === normSearch) return 900;
  if (name.startsWith(normSearch)) return 850;
  if (name.includes(normSearch)) return 800;

  if (spouse === normSearch) return 900;
  if (spouse.startsWith(normSearch)) return 820;
  if (spouse.includes(normSearch)) return 750;

  if (normTokens.length > 1 && normTokens.every((t) => name.includes(t))) {
    return 450;
  }
  if (normTokens.length > 1 && normTokens.every((t) => spouse.includes(t))) {
    return 300;
  }

  if (
    (tc && tc.startsWith(normSearch)) ||
    (spouseTc && spouseTc.startsWith(normSearch)) ||
    (appNo && appNo.includes(normSearch))
  ) {
    return 150;
  }

  return 50;
}

async function checkManagePermission(session: any): Promise<boolean> {
  const { getEffectivePermissions } = await import("@/lib/permissions");
  return (await getEffectivePermissions(session)).canManageApplications;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const status = searchParams.get("status") || "all"; // "all" | "empty" | "active" | "passive" | "archive"
    const dateStart = searchParams.get("dateStart");
    const dateEnd = searchParams.get("dateEnd");
    // Varsayılan sıralama: Son kayıttan ilk kayıta doğru (no_desc)
    const sortBy = searchParams.get("sortBy") || "no_desc";
    const sheet = searchParams.get("sheet");
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.max(parseInt(searchParams.get("limit") || "50", 10), 1);
    const fetchAll = searchParams.get("all") === "true";
    const isWarmPing = searchParams.get("warm") === "1";
    const isFastInit = searchParams.get("fast") === "1";

    if (isWarmPing) {
      warmApplicationCache();
      return NextResponse.json({ warming: true, cacheWarm: Boolean(peekApplicationCache()) });
    }

    const canManage = await checkManagePermission(session);
    const readyCache = peekApplicationCache();

    // HIZLI LAZY-LOAD YOLU: Önbellek henüz soğuksa sayfanın açılışını veya dosya numarası aramasını ASLA bekletme!
    // Arka planda önbelleği ısıtırken en büyük numaralı dosyaları doğrudan MongoDB indeksinden ~15ms'de döndür.
    const isPureFileNoSearch = Boolean(search) && /^[#0-9\-]+$/.test(search) && search.replace(/\D/g, "").length <= 10;
    if (!readyCache && !fetchAll && (isFastInit || isPureFileNoSearch)) {
      warmApplicationCache();

      const sheetNamesRaw: string[] = await ApplicationFile.distinct("sheetName");
      const cleanSheetNames = sheetNamesRaw
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .sort((a, b) => {
          if (a === "YENİ BAŞVURU KAYIT") return -1;
          if (b === "YENİ BAŞVURU KAYIT") return 1;
          return a.localeCompare(b, "tr");
        });

      let activeSheet = sheet && sheet !== "all" ? sheet : "";
      if (!activeSheet && cleanSheetNames.length > 0) {
        activeSheet = cleanSheetNames.includes("YENİ BAŞVURU KAYIT")
          ? "YENİ BAŞVURU KAYIT"
          : cleanSheetNames[0];
      }

      const fastQuery: any = {};
      if (activeSheet) fastQuery.sheetName = activeSheet;

      if (isPureFileNoSearch) {
        const rawNo = search.replace(/^#/, "").trim();
        const digits = rawNo.replace(/\D/g, "");
        const seqNum = digits ? parseInt(digits, 10) : NaN;
        const escaped = rawNo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        fastQuery.$or = [
          { applicationNo: rawNo },
          { applicationNo: { $regex: escaped, $options: "i" } },
          ...(!isNaN(seqNum) ? [{ applicationNoSeq: seqNum }] : []),
        ];
      } else if (status === "empty") {
        fastQuery.fileStatus = "Boş Dosya";
      } else if (status === "active") {
        fastQuery.fileStatus = "Aktif";
      } else if (status === "passive") {
        fastQuery.fileStatus = "Pasif";
      } else if (status === "archive") {
        fastQuery.fileStatus = "Arşiv";
      }

      const skip = (page - 1) * limit;
      const [fastRecords, fastMatchedCount, totalEst] = await Promise.all([
        ApplicationFile.find(fastQuery)
          .sort({ applicationNoSeq: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        ApplicationFile.countDocuments(fastQuery),
        ApplicationFile.estimatedDocumentCount(),
      ]);

      const highestDoc = fastRecords[0] || null;
      let sheetPrefix = "";
      let nextSeqNumber = 1;
      let fullNextApplicationNo = "1";
      if (highestDoc && (highestDoc as any).applicationNo) {
        const match = String((highestDoc as any).applicationNo)
          .trim()
          .match(/^(.*?)(0*[1-9]\d*|0)$/);
        if (match) {
          sheetPrefix = match[1];
          const num = parseInt(match[2], 10);
          nextSeqNumber = !isNaN(num) ? num + 1 : 1;
          fullNextApplicationNo = `${sheetPrefix}${nextSeqNumber}`;
        }
      } else if (activeSheet === "YENİ BAŞVURU KAYIT") {
        sheetPrefix = "102201-";
        nextSeqNumber = 1;
        fullNextApplicationNo = "102201-1";
      }

      let activeColumns: string[] = [];
      if (fastRecords.length > 0) {
        const r0: any = fastRecords[0];
        activeColumns =
          Array.isArray(r0.columnHeaders) && r0.columnHeaders.length > 0
            ? r0.columnHeaders
            : r0.extraData && typeof r0.extraData === "object"
            ? Object.keys(r0.extraData)
            : [];
      }
      activeColumns = activeColumns
        .filter((c) => c && typeof c === "string" && !c.startsWith("__EMPTY") && c.trim() !== "")
        .slice(0, 6);

      const fastSheets = cleanSheetNames.map((name) => ({
        name,
        count: name === activeSheet ? fastMatchedCount : 0,
        columnHeaders: name === activeSheet ? activeColumns : [],
      }));

      return NextResponse.json({
        records: fastRecords,
        canManage,
        cacheWarm: false,
        activeSheet,
        activeColumns,
        sheets: fastSheets,
        pagination: {
          page,
          limit,
          totalRecords: fastMatchedCount,
          totalPages: Math.ceil(fastMatchedCount / limit) || 1,
        },
        stats: {
          totalCount: totalEst || fastMatchedCount,
          emptyCount: 0,
          activeCount: fastMatchedCount,
          nextApplicationNo: fullNextApplicationNo,
          nextSeqNumber,
          sheetPrefix,
        },
      });
    }

    const cache = readyCache || (await getApplicationCache());

    let activeSheet = sheet && sheet !== "all" ? sheet : "";
    if (!activeSheet && cache.sheets.length > 0) {
      const hasYeni = cache.sheets.some((s) => s.name === "YENİ BAŞVURU KAYIT");
      activeSheet = hasYeni ? "YENİ BAŞVURU KAYIT" : cache.sheets[0].name;
    }

    const startMs = dateStart ? new Date(dateStart).getTime() : null;
    const endMs = dateEnd ? new Date(dateEnd).setHours(23, 59, 59, 999) : null;

    let filteredItems = cache.items.filter((item) => {
      const doc = item.doc;
      if (activeSheet && doc.sheetName !== activeSheet) return false;

      if (status === "empty") {
        const isEmpty =
          !doc.applicantName ||
          String(doc.applicantName).trim() === "" ||
          doc.fileStatus === "Boş Dosya";
        if (!isEmpty) return false;
      } else if (status === "active") {
        const isEmpty = !doc.applicantName || String(doc.applicantName).trim() === "";
        if (isEmpty || ["Boş Dosya", "Pasif", "Arşiv"].includes(doc.fileStatus)) return false;
      } else if (status === "passive") {
        if (doc.fileStatus !== "Pasif") return false;
      } else if (status === "archive") {
        if (doc.fileStatus !== "Arşiv") return false;
      }

      if (startMs !== null || endMs !== null) {
        const cMs = doc.createdAt ? new Date(doc.createdAt).getTime() : 0;
        if (startMs !== null && cMs < startMs) return false;
        if (endMs !== null && cMs > endMs) return false;
      }

      return true;
    });

    if (sortBy !== "no_desc") {
      filteredItems = [...filteredItems].sort((a, b) => {
        const da = a.doc;
        const db = b.doc;
        if (sortBy === "no_asc") {
          return (da.applicationNoSeq || 0) - (db.applicationNoSeq || 0);
        }
        if (sortBy === "date_desc") {
          return new Date(db.createdAt || 0).getTime() - new Date(da.createdAt || 0).getTime();
        }
        if (sortBy === "date_asc") {
          return new Date(da.createdAt || 0).getTime() - new Date(db.createdAt || 0).getTime();
        }
        if (sortBy === "name_asc") {
          return String(da.applicantName || "").localeCompare(String(db.applicantName || ""), "tr");
        }
        if (sortBy === "name_desc") {
          return String(db.applicantName || "").localeCompare(String(da.applicantName || ""), "tr");
        }
        return (db.applicationNoSeq || 0) - (da.applicationNoSeq || 0);
      });
    }

    let records: any[] = [];
    let totalMatched = 0;

    if (search) {
      const normSearch = normalizeTurkish(search.replace(/\s+/g, " "));
      const normTokens = normSearch.split(/\s+/).filter(Boolean);

      const matchedItems = filteredItems.filter((item) =>
        normTokens.every((t) => item._normHaystack.includes(t))
      );

      const scored = matchedItems.map((item) => ({
        doc: item.doc,
        score: computeCachedRelevance(item, normSearch, normTokens),
      }));
      scored.sort((a, b) => b.score - a.score);

      const hasExact = scored.some((item) => item.score >= 900);
      const hasPhrase = scored.some((item) => item.score >= 600);
      const filteredScored = hasExact
        ? scored.filter((item) => item.score >= 900)
        : hasPhrase
        ? scored.filter((item) => item.score >= 600)
        : scored;

      const ranked = filteredScored.map((item) => ({
        ...item.doc,
        _exactMatch: item.score >= 600,
      }));
      totalMatched = ranked.length;

      if (fetchAll) {
        records = ranked;
      } else {
        const skip = (page - 1) * limit;
        records = ranked.slice(skip, skip + limit);
      }
    } else {
      totalMatched = filteredItems.length;
      if (fetchAll) {
        records = filteredItems.map((i) => i.doc);
      } else {
        const skip = (page - 1) * limit;
        records = filteredItems.slice(skip, skip + limit).map((i) => i.doc);
      }
    }

    const totalPages = fetchAll ? 1 : Math.ceil(totalMatched / limit) || 1;
    const { totalCount, emptyCount, activeCount, sheets } = cache;
    const highestRecord = activeSheet
      ? cache.highestBySheet[activeSheet]
      : cache.highestOverall;

    let sheetPrefix = "";
    let nextSeqNumber = 1;
    let fullNextApplicationNo = "1";

    if (highestRecord && highestRecord.applicationNo) {
      const match = String(highestRecord.applicationNo).trim().match(/^(.*?)(0*[1-9]\d*|0)$/);
      if (match) {
        sheetPrefix = match[1];
        const num = parseInt(match[2], 10);
        nextSeqNumber = !isNaN(num) ? num + 1 : 1;
        fullNextApplicationNo = `${sheetPrefix}${nextSeqNumber}`;
      }
    } else if (activeSheet === "YENİ BAŞVURU KAYIT") {
      sheetPrefix = "102201-";
      nextSeqNumber = 1;
      fullNextApplicationNo = "102201-1";
    }

    // Aktif sekmenin veya mevcut kayıtların Excel sütun başlıkları (En fazla 6 gerçek sütun)
    let activeColumns: string[] = [];
    if (activeSheet) {
      const found = sheets.find((s) => s.name === activeSheet);
      if (found && found.columnHeaders.length > 0) {
        activeColumns = found.columnHeaders;
      }
    }
    if (activeColumns.length === 0 && records.length > 0) {
      activeColumns =
        records[0].columnHeaders && records[0].columnHeaders.length > 0
          ? records[0].columnHeaders
          : records[0].extraData
          ? Object.keys(records[0].extraData)
          : [];
    }

    activeColumns = activeColumns
      .filter((c) => c && typeof c === "string" && !c.startsWith("__EMPTY") && c.trim() !== "")
      .slice(0, 6);

    return NextResponse.json({
      records,
      canManage,
      cacheWarm: true,
      sheets,
      activeSheet,
      activeColumns,
      pagination: {
        page,
        limit,
        totalRecords: totalMatched,
        totalPages,
      },
      stats: {
        totalCount,
        emptyCount,
        activeCount,
        nextApplicationNo: fullNextApplicationNo,
        nextSeqNumber,
        sheetPrefix,
      },
    });
  } catch (error: any) {
    console.error("GET /api/application-files error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const canManage = await checkManagePermission(session);
    if (!canManage) {
      return NextResponse.json(
        { error: "Manuel kayıt ekleme yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    await dbConnect();
    const body = await req.json();
    const {
      applicationNo,
      sheetName,
      applicantName,
      spouseName,
      tcNo,
      spouseTcNo,
      helpType,
      neighborhood,
      phone,
      address,
      applicationDate,
      fileStatus,
      notes,
      extraData,
      targetRecordId,
    } = body;

    const trimmedAppNo = (applicationNo || "").toString().trim();
    const targetSheet = (sheetName || "Sayfa 1").trim();
    if (!trimmedAppNo) {
      return NextResponse.json(
        { error: "Başvuru / Dosya Numarası zorunludur." },
        { status: 400 }
      );
    }

    const numericSeq = parseInt(trimmedAppNo.replace(/\D/g, ""), 10) || 0;
    const isNameEmpty = !applicantName || applicantName.trim() === "";
    const resolvedStatus = fileStatus
      ? fileStatus
      : isNameEmpty
      ? "Boş Dosya"
      : "Aktif";

    // Boş bir dosyayı doldurma senaryosu
    if (targetRecordId) {
      const existing = await ApplicationFile.findById(targetRecordId);
      if (!existing) {
        return NextResponse.json(
          { error: "Güncellenecek boş dosya kaydı bulunamadı." },
          { status: 404 }
        );
      }

      if (trimmedAppNo !== existing.applicationNo) {
        const dup = await ApplicationFile.findOne({
          applicationNo: trimmedAppNo,
          sheetName: targetSheet,
          _id: { $ne: targetRecordId },
        });
        if (dup) {
          return NextResponse.json(
            {
              error: `Başvuru / Dosya No (${trimmedAppNo}) "${targetSheet}" sekmesinde zaten kayıtlı! Aynı sekmede aynı numarada birden fazla dosya oluşturulamaz.`,
            },
            { status: 409 }
          );
        }
      }

      existing.applicationNo = trimmedAppNo;
      existing.applicationNoSeq = numericSeq;
      existing.sheetName = targetSheet;
      existing.applicantName = (applicantName || "").trim();
      existing.spouseName = (spouseName || "").trim();
      existing.tcNo = (tcNo || "").trim();
      existing.spouseTcNo = (spouseTcNo || "").trim();
      existing.helpType = (helpType || "").trim();
      existing.neighborhood = (neighborhood || "").trim();
      existing.phone = (phone || "").trim();
      existing.address = (address || "").trim();
      existing.applicationDate = applicationDate ? new Date(applicationDate) : null;
      existing.notes = (notes || "").trim();
      existing.fileStatus = resolvedStatus;
      if (extraData) existing.extraData = { ...existing.extraData, ...extraData };
      existing.updatedBy = session.user.id;

      await existing.save();
      invalidateApplicationCache();

      try {
        await Log.create({
          userId: session.user.id,
          action: "Boş Dosya Dolduruldu",
          details: `Başvuru No: ${trimmedAppNo}, Kişi: ${existing.applicantName || "Boş"}`,
        });
      } catch (err) {
        console.error("Log error:", err);
      }

      return NextResponse.json({
        message: "Boş dosya başarıyla dolduruldu ve kaydedildi.",
        record: existing,
      });
    }

    // Yeni kayıt oluşturma senaryosu (Başvuru No kendi sekmesi içinde tekil/birincil anahtardır)
    const duplicate = await ApplicationFile.findOne({
      applicationNo: trimmedAppNo,
      sheetName: targetSheet,
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `Başvuru / Dosya No (${trimmedAppNo}) "${targetSheet}" sekmesinde zaten kayıtlı! Aynı sekmede aynı numarada birden fazla dosya oluşturulamaz.`,
        },
        { status: 409 }
      );
    }

    const newRecord = new ApplicationFile({
      applicationNo: trimmedAppNo,
      applicationNoSeq: numericSeq,
      sheetName: targetSheet,
      applicantName: (applicantName || "").trim(),
      spouseName: (spouseName || "").trim(),
      tcNo: (tcNo || "").trim(),
      spouseTcNo: (spouseTcNo || "").trim(),
      helpType: (helpType || "").trim(),
      neighborhood: (neighborhood || "").trim(),
      phone: (phone || "").trim(),
      address: (address || "").trim(),
      applicationDate: applicationDate ? new Date(applicationDate) : null,
      fileStatus: resolvedStatus,
      notes: (notes || "").trim(),
      extraData: extraData || {},
      createdBy: session.user.id,
      updatedBy: session.user.id,
    });

    await newRecord.save();
    invalidateApplicationCache();

    try {
      await Log.create({
        userId: session.user.id,
        action: "Yeni Dosya Kaydı Eklendi",
        details: `Başvuru No: ${trimmedAppNo}, Kişi: ${newRecord.applicantName || "Boş Dosya"}`,
      });
    } catch (err) {
      console.error("Log error:", err);
    }

    return NextResponse.json(
      { message: "Dosya kaydı başarıyla eklendi.", record: newRecord },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/application-files error:", error);
    if (error?.code === 11000) {
      return NextResponse.json(
        { error: "Bu Başvuru / Dosya Numarası sistemde zaten kayıtlı. Aynı numarada birden fazla dosya olamaz." },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Sunucu hatası" },
      { status: 500 }
    );
  }
}
