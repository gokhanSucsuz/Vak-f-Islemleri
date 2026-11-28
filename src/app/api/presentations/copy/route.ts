import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Presentation, { ISlideData } from "@/models/Presentation";
import PresentationMeeting from "@/models/PresentationMeeting";
import Log from "@/models/Log";
import {
  compressSlides,
  decompressSlides,
  computeSlideStats,
} from "@/lib/presentationUtils";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const body = await req.json();
    const { sourcePresentationId, targetMeetingId } = body as {
      sourcePresentationId: string;
      targetMeetingId?: string;
    };

    if (!sourcePresentationId) {
      return NextResponse.json(
        { error: "Kopyalanacak sunu ID'si belirtilmelidir." },
        { status: 400 }
      );
    }

    await dbConnect();

    // 1. Kaynak sunuyu ve bağlı olduğu toplantıyı getir
    const sourceRecord = (await Presentation.findById(sourcePresentationId)
      .populate("meetingId", "title status isLocked")
      .lean()) as any;

    if (!sourceRecord) {
      return NextResponse.json(
        { error: "Kopyalanacak kaynak sunu bulunamadı." },
        { status: 404 }
      );
    }

    const sourceMeeting = sourceRecord.meetingId as any;
    const isOwnRecord = String(sourceRecord.createdBy) === String(userId);

    // İŞ KURALI:
    // "aktif toplantı dosyası içinde farklı personel diğer personelin sunusunu kopyalayamasın.
    // sadece eski kapatılmış sonlandırılmış toplantılardaki farklı kullanıcıların sunularını
    // aktif toplantı dosyasına slayt olarak kopyalayıp düzenleyebilsin."
    if (sourceMeeting?.status === "open" && !isOwnRecord) {
      return NextResponse.json(
        {
          error:
            "Aktif toplantı dosyasındaki diğer personellere ait sunular kopyalanamaz. Yalnızca kapatılmış/sonlandırılmış toplantılardaki sunuları aktif toplantıya kopyalayabilirsiniz.",
        },
        { status: 403 }
      );
    }

    // 2. Hedef aktif toplantıyı belirle
    let targetMeeting: any = null;
    if (targetMeetingId) {
      targetMeeting = await PresentationMeeting.findById(targetMeetingId).lean();
    } else {
      // Eğer hedef toplantı belirtilmemişse, en son açık (aktif) toplantıyı bul
      targetMeeting = await PresentationMeeting.findOne({ status: "open" })
        .sort({ createdAt: -1 })
        .lean();
    }

    if (!targetMeeting) {
      return NextResponse.json(
        {
          error:
            "Sununun kopyalanacağı açık (aktif) bir toplantı bulunamadı. Lütfen önce aktif bir toplantı oluşturun veya seçin.",
        },
        { status: 400 }
      );
    }

    if (targetMeeting.status === "closed") {
      return NextResponse.json(
        { error: "Kapatılmış bir toplantıya yeni sunu eklenemez veya kopyalanamaz." },
        { status: 400 }
      );
    }

    if (targetMeeting.isLocked) {
      return NextResponse.json(
        {
          error:
            "Hedef toplantı kilitli olduğu için yeni sunu eklenemez/kopyalanamaz.",
        },
        { status: 403 }
      );
    }

    // 3. Slaytları aç ve kopyala
    const slides = await decompressSlides(sourceRecord.slidesCompressed);
    const compressed = await compressSlides(slides);
    const stats = computeSlideStats(slides, compressed.length);

    // Kopyalanan sununun yeni sahibi işlemi yapan personel olur
    const newRecord = await Presentation.create({
      meetingId: targetMeeting._id,
      summaryTitle: sourceRecord.summaryTitle,
      slideCount: sourceRecord.slideCount || slides.length,
      slidesCompressed: compressed,
      createdBy: userId,
      ...stats,
    });

    // Hedef toplantı sıralamasına ekle
    await PresentationMeeting.findByIdAndUpdate(targetMeeting._id, {
      $push: { presentationOrder: newRecord._id.toString() },
    });

    void Log.create({
      userId,
      action: "SUNU_KOPYALANDI",
      details: `Sunu kopyalandı: "${sourceRecord.summaryTitle}" (${sourceMeeting?.title || "Eski Toplantı"} -> ${targetMeeting.title})`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: "Sunu başarıyla aktif toplantıya kopyalandı.",
      presentation: {
        _id: newRecord._id,
        meetingId: targetMeeting._id,
        meetingTitle: targetMeeting.title,
        meetingStatus: targetMeeting.status,
        summaryTitle: newRecord.summaryTitle,
        slideCount: newRecord.slideCount,
        firstPhoto: newRecord.firstPhoto,
        totalPhotos: newRecord.totalPhotos,
        photoBytes: newRecord.photoBytes,
        presentationBytes: newRecord.presentationBytes,
        createdAt: newRecord.createdAt,
      },
    });
  } catch (error: any) {
    console.error("POST /api/presentations/copy error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu kopyalama işlemi başarısız oldu." },
      { status: 500 }
    );
  }
}
