import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";
import User from "@/models/User";
import Log from "@/models/Log";
import { toTurkishRegexPattern } from "@/lib/turkish";

async function checkManagePermission(session: any): Promise<boolean> {
  if (!session?.user) return false;
  if (session.user.role === "superadmin") return true;
  await dbConnect();
  const dbUser = await User.findById(session.user.id).select("canManageApplications role");
  return Boolean(dbUser?.role === "superadmin" || dbUser?.canManageApplications);
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

    const canManage = await checkManagePermission(session);

    // Filtre Sorgusu (Her sekme tamamen ayrı ve bağımsız listelenir)
    const query: any = {};

    let activeSheet = sheet && sheet !== "all" ? sheet : "";
    if (!activeSheet) {
      const distinctSheets = await ApplicationFile.distinct("sheetName");
      if (distinctSheets && distinctSheets.length > 0) {
        activeSheet = distinctSheets.includes("YENİ BAŞVURU KAYIT")
          ? "YENİ BAŞVURU KAYIT"
          : distinctSheets[0];
      }
    }
    if (activeSheet) {
      query.sheetName = activeSheet;
    }

    if (status === "empty") {
      query.$or = [
        { applicantName: { $in: ["", null] } },
        { fileStatus: "Boş Dosya" },
      ];
    } else if (status === "active") {
      query.applicantName = { $nin: ["", null] };
      query.fileStatus = { $nin: ["Boş Dosya", "Pasif", "Arşiv"] };
    } else if (status === "passive") {
      query.fileStatus = "Pasif";
    } else if (status === "archive") {
      query.fileStatus = "Arşiv";
    }

    // Tarih Filtresi
    if (dateStart || dateEnd) {
      query.createdAt = {};
      if (dateStart) {
        query.createdAt.$gte = new Date(dateStart);
      }
      if (dateEnd) {
        const end = new Date(dateEnd);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Arama Filtresi (Tüm ana alanlarda çoklu kelime ve Türkçe uyumlu arar)
    if (search) {
      const tokens = search.split(/\s+/).filter(Boolean);
      const tokenConditions = tokens.map((token) => {
        const pattern = toTurkishRegexPattern(token);
        const tokenRegex = new RegExp(pattern, "i");
        return {
          $or: [
            { applicationNo: tokenRegex },
            { applicantName: tokenRegex },
            { spouseName: tokenRegex },
            { tcNo: tokenRegex },
            { spouseTcNo: tokenRegex },
            { helpType: tokenRegex },
            { neighborhood: tokenRegex },
            { phone: tokenRegex },
            { address: tokenRegex },
            { notes: tokenRegex },
          ],
        };
      });

      if (query.$or) {
        query.$and = [{ $or: query.$or }, ...tokenConditions];
        delete query.$or;
      } else {
        query.$and = query.$and ? [...query.$and, ...tokenConditions] : tokenConditions;
      }
    }

    // Sıralama (Varsayılan: Son kayıttan ilk kayıta)
    let sortOptions: any = { applicationNoSeq: -1, createdAt: -1 };
    if (sortBy === "no_asc") {
      sortOptions = { applicationNoSeq: 1, applicationNo: 1 };
    } else if (sortBy === "no_desc") {
      sortOptions = { applicationNoSeq: -1, applicationNo: -1 };
    } else if (sortBy === "date_desc") {
      sortOptions = { createdAt: -1 };
    } else if (sortBy === "date_asc") {
      sortOptions = { createdAt: 1 };
    } else if (sortBy === "name_asc") {
      sortOptions = { applicantName: 1 };
    } else if (sortBy === "name_desc") {
      sortOptions = { applicantName: -1 };
    }

    // Sayfalama (Pagination)
    let queryExec = ApplicationFile.find(query)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort(sortOptions);

    if (!fetchAll) {
      const skip = (page - 1) * limit;
      queryExec = queryExec.skip(skip).limit(limit);
    }

    const records = await queryExec.lean();
    const totalMatched = await ApplicationFile.countDocuments(query);
    const totalPages = fetchAll ? 1 : Math.ceil(totalMatched / limit) || 1;

    // Genel İstatistikler
    const totalCount = await ApplicationFile.countDocuments();
    const emptyCount = await ApplicationFile.countDocuments({
      $or: [{ applicantName: { $in: ["", null] } }, { fileStatus: "Boş Dosya" }],
    });
    const activeCount = totalCount - emptyCount;

    // Aktif sekmeye göre sıradaki en yüksek numara ve sekme ön eki
    const highestRecord = await ApplicationFile.findOne(
      activeSheet ? { sheetName: activeSheet } : {}
    )
      .sort({ applicationNoSeq: -1 })
      .select("applicationNoSeq applicationNo")
      .lean();

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

    // Sistemde kayıtlı tüm sekmeleri ve kayıt sayılarını getir
    const sheetsAgg = await ApplicationFile.aggregate([
      {
        $group: {
          _id: "$sheetName",
          count: { $sum: 1 },
          columnHeaders: { $first: "$columnHeaders" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const sheets = sheetsAgg
      .filter((s) => s._id)
      .map((s) => ({
        name: s._id as string,
        count: s.count as number,
        columnHeaders: ((s.columnHeaders || []) as string[])
          .filter((c) => c && typeof c === "string" && !c.startsWith("__EMPTY") && c.trim() !== "")
          .slice(0, 6),
      }));

    // YENİ BAŞVURU KAYIT sekmesi varsayılan olarak her zaman en başta yer alsın
    sheets.sort((a, b) => {
      if (a.name === "YENİ BAŞVURU KAYIT") return -1;
      if (b.name === "YENİ BAŞVURU KAYIT") return 1;
      return a.name.localeCompare(b.name, "tr");
    });

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

    // Yeni kayıt oluşturma senaryosu
    const duplicate = await ApplicationFile.findOne({
      applicationNo: trimmedAppNo,
      sheetName: targetSheet,
    });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `Başvuru / Dosya No (${trimmedAppNo}) "${targetSheet}" sekmesinde zaten kayıtlı! Lütfen farklı bir numara kullanın.`,
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
    return NextResponse.json(
      { error: error.message || "Sunucu hatası" },
      { status: 500 }
    );
  }
}
