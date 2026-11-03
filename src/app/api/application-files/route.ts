import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";
import User from "@/models/User";
import Log from "@/models/Log";

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
    const sortBy = searchParams.get("sortBy") || "no_asc";

    const canManage = await checkManagePermission(session);

    // Filter Query
    const query: any = {};

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

    // Arama Filtresi
    if (search) {
      const searchRegex = new RegExp(search, "i");
      const searchConditions: any[] = [
        { applicationNo: searchRegex },
        { applicantName: searchRegex },
        { tcNo: searchRegex },
        { phone: searchRegex },
        { address: searchRegex },
        { notes: searchRegex },
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    // Sıralama
    let sortOptions: any = { applicationNoSeq: 1, applicationNo: 1 };
    if (sortBy === "no_desc") {
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

    // Retrieve records
    const records = await ApplicationFile.find(query)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .sort(sortOptions)
      .lean();

    // Stats
    const totalCount = await ApplicationFile.countDocuments();
    const emptyCount = await ApplicationFile.countDocuments({
      $or: [{ applicantName: { $in: ["", null] } }, { fileStatus: "Boş Dosya" }],
    });
    const activeCount = totalCount - emptyCount;

    // Find highest applicationNoSeq to compute next number
    const highestRecord = await ApplicationFile.findOne()
      .sort({ applicationNoSeq: -1 })
      .select("applicationNoSeq applicationNo")
      .lean();

    const nextApplicationNo = highestRecord?.applicationNoSeq
      ? highestRecord.applicationNoSeq + 1
      : 1;

    return NextResponse.json({
      records,
      canManage,
      stats: {
        totalCount,
        emptyCount,
        activeCount,
        nextApplicationNo,
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
      applicantName,
      tcNo,
      phone,
      address,
      fileStatus,
      notes,
      extraData,
      targetRecordId, // If user is filling an existing empty file
    } = body;

    const trimmedAppNo = (applicationNo || "").toString().trim();
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

    // Scenario A: Filling an existing empty record
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
      existing.applicantName = (applicantName || "").trim();
      existing.tcNo = (tcNo || "").trim();
      existing.phone = (phone || "").trim();
      existing.address = (address || "").trim();
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

    // Scenario B: Creating a new record
    const duplicate = await ApplicationFile.findOne({ applicationNo: trimmedAppNo });
    if (duplicate) {
      return NextResponse.json(
        {
          error: `Başvuru / Dosya No (${trimmedAppNo}) sistemde zaten kayıtlı! Lütfen farklı bir numara kullanın.`,
        },
        { status: 409 }
      );
    }

    const newRecord = new ApplicationFile({
      applicationNo: trimmedAppNo,
      applicationNoSeq: numericSeq,
      applicantName: (applicantName || "").trim(),
      tcNo: (tcNo || "").trim(),
      phone: (phone || "").trim(),
      address: (address || "").trim(),
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
