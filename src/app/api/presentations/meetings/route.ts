import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import PresentationMeeting from "@/models/PresentationMeeting";
import Presentation from "@/models/Presentation";
import Log from "@/models/Log";
import { purgeExpiredMeetingPhotos } from "@/lib/presentationUtils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();

    const [meetings, presCounts] = await Promise.all([
      PresentationMeeting.find({})
        .select("-combinedPptxCompressed")
        .populate("openedBy", "name")
        .populate("closedBy", "name")
        .populate("authorizedUserId", "name email")
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Presentation.aggregate([
        {
          $group: {
            _id: "$meetingId",
            recordCount: { $sum: 1 },
            totalSlides: { $sum: "$slideCount" },
          },
        },
      ]),
    ]);

    const countMap = new Map<string, { recordCount: number; totalSlides: number }>();
    for (const c of presCounts) {
      countMap.set(String(c._id), {
        recordCount: c.recordCount,
        totalSlides: c.totalSlides,
      });
    }

    const result = meetings.map((m) => {
      const counts = countMap.get(String(m._id)) || { recordCount: 0, totalSlides: 0 };
      return {
        _id: m._id,
        title: m.title,
        meetingDate: m.meetingDate,
        status: m.status,
        isLocked: Boolean(m.isLocked),
        authorizedUserId: m.authorizedUserId || null,
        backgroundPreset: m.backgroundPreset || "template",
        photoFramePreset: (m as any).photoFramePreset || "none",
        transitionPreset: (m as any).transitionPreset || "kurumsal_kaydir",
        openedBy: m.openedBy,
        closedBy: m.closedBy,
        closedAt: m.closedAt,
        downloadedAt: m.downloadedAt,
        photosExpireAt: m.photosExpireAt,
        photosPurged: m.photosPurged,
        photosPurgedAt: m.photosPurgedAt,
        combinedPptxSize: (m as any).combinedPptxSize || 0,
        combinedPptxUpdatedAt: (m as any).combinedPptxUpdatedAt || null,
        recordCount: counts.recordCount,
        totalSlides: counts.totalSlides,
        createdAt: m.createdAt,
      };
    });

    return NextResponse.json({ meetings: result });
  } catch (error: any) {
    console.error("GET /api/presentations/meetings error:", error);
    return NextResponse.json(
      { error: error.message || "Toplantılar alınamadı." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);
    const userId = perms.userId;

    if (!session?.user || !perms.canManagePresentations) {
      return NextResponse.json(
        { error: "Toplantı açma yetkisi sadece yöneticilere ve yetkili personele aittir." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const title = (body.title || "").trim();
    const meetingDate = body.meetingDate ? new Date(body.meetingDate) : new Date();
    // Yetkili personel atamasını Süper Admin ve Müdür yapabilir
    const authorizedUserId = perms.isManager && body.authorizedUserId ? body.authorizedUserId : undefined;

    if (!title) {
      return NextResponse.json({ error: "Toplantı başlığı zorunludur." }, { status: 400 });
    }

    await dbConnect();

    const existingOpen = await PresentationMeeting.findOne({ status: "open" });
    if (existingOpen) {
      return NextResponse.json(
        {
          error: `Açık bir toplantı (${existingOpen.title}) varken yeni toplantı açılamaz. Önce mevcut toplantıyı kapatın.`,
        },
        { status: 400 }
      );
    }

    const meeting = await PresentationMeeting.create({
      title,
      meetingDate,
      status: "open",
      isLocked: false,
      ...(authorizedUserId ? { authorizedUserId } : {}),
      openedBy: userId,
    });

    void Log.create({
      userId,
      action: "TOPLANTI_ACILDI",
      details: `Sunu toplantısı açıldı: ${title}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, meeting }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/presentations/meetings error:", error);
    return NextResponse.json(
      { error: error.message || "Toplantı açılırken hata oluştu." },
      { status: 500 }
    );
  }
}
