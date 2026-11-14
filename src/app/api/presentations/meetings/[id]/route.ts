import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import PresentationMeeting from "@/models/PresentationMeeting";
import Presentation from "@/models/Presentation";
import Log from "@/models/Log";
import {
  decompressSlides,
  purgeExpiredMeetingPhotos,
} from "@/lib/presentationUtils";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    await dbConnect();
    await purgeExpiredMeetingPhotos();

    const meeting = await PresentationMeeting.findById(id)
      .populate("openedBy", "name")
      .populate("closedBy", "name");

    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }

    const presentations = await Presentation.find({ meetingId: id })
      .populate("createdBy", "name")
      .sort({ createdAt: 1 });

    // Tüm slaytları düzleştir (presentationId + slideIndex bazında)
    type FlatSlide = {
      key: string;
      presentationId: string;
      slideIndex: number;
      authorName: string;
      createdAt: Date;
      fullName: string;
      neighborhood: string;
      photoCount: 0 | 1 | 2 | 4;
      photos: string[];
      description: string;
    };

    const flatMap = new Map<string, FlatSlide>();
    const defaultList: FlatSlide[] = [];

    for (const pres of presentations) {
      const slides = await decompressSlides(pres.slidesCompressed);
      const authorName = (pres.createdBy as any)?.name || "Personel";
      slides.forEach((s, idx) => {
        const key = `${pres._id}_${idx}`;
        const item: FlatSlide = {
          key,
          presentationId: String(pres._id),
          slideIndex: idx,
          authorName,
          createdAt: pres.createdAt,
          fullName: s.fullName || "",
          neighborhood: s.neighborhood || "",
          photoCount: s.photoCount ?? (s.photos?.length ? 1 : 0),
          photos: Array.isArray(s.photos) ? s.photos : [],
          description: s.description || "",
        };
        flatMap.set(key, item);
        defaultList.push(item);
      });
    }

    // Kayıtlı slideOrder varsa ona göre sırala, yeni eklenenleri sona ekle
    const orderedSlides: FlatSlide[] = [];
    const seen = new Set<string>();

    if (Array.isArray(meeting.slideOrder) && meeting.slideOrder.length > 0) {
      for (const ord of meeting.slideOrder) {
        const key = `${ord.presentationId}_${ord.slideIndex}`;
        const found = flatMap.get(key);
        if (found && !seen.has(key)) {
          orderedSlides.push(found);
          seen.add(key);
        }
      }
    }
    for (const item of defaultList) {
      if (!seen.has(item.key)) {
        orderedSlides.push(item);
        seen.add(item.key);
      }
    }

    return NextResponse.json({
      meeting: {
        _id: meeting._id,
        title: meeting.title,
        meetingDate: meeting.meetingDate,
        status: meeting.status,
        openedBy: meeting.openedBy,
        closedBy: meeting.closedBy,
        closedAt: meeting.closedAt,
        downloadedAt: meeting.downloadedAt,
        photosExpireAt: meeting.photosExpireAt,
        photosPurged: meeting.photosPurged,
        photosPurgedAt: meeting.photosPurgedAt,
      },
      slides: orderedSlides,
    });
  } catch (error: any) {
    console.error("GET /api/presentations/meetings/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Toplantı slaytları alınamadı." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as any)?.role;
    const userId = (session?.user as any)?.id;

    if (!session?.user || (role !== "superadmin" && role !== "manager")) {
      return NextResponse.json(
        { error: "Bu işlem sadece yöneticilere aittir." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const body = await req.json();
    const { action, slideOrder } = body;

    await dbConnect();
    const meeting = await PresentationMeeting.findById(id);
    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }

    if (Array.isArray(slideOrder)) {
      meeting.slideOrder = slideOrder.map((s: any) => ({
        presentationId: String(s.presentationId),
        slideIndex: Number(s.slideIndex),
      }));
    }

    if (action === "close") {
      meeting.status = "closed";
      meeting.closedBy = userId;
      meeting.closedAt = new Date();
      await Log.create({
        userId,
        action: "TOPLANTI_KAPATILDI",
        details: `Toplantı kapatıldı: ${meeting.title}`,
      });
    } else if (action === "reopen") {
      meeting.status = "open";
      meeting.closedAt = undefined;
      await Log.create({
        userId,
        action: "TOPLANTI_YENIDEN_ACILDI",
        details: `Toplantı tekrar açıldı: ${meeting.title}`,
      });
    } else if (action === "markDownloaded") {
      const now = new Date();
      meeting.downloadedAt = now;
      // İndirildikten 12 saat sonra fotoğraflar otomatik silinir
      meeting.photosExpireAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      meeting.photosPurged = false;
      await Log.create({
        userId,
        action: "TOPLANTI_SLAYDI_INDIRILDI",
        details: `Toplu toplantı sunusu indirildi (12 saat foto silme zamanlayıcısı başladı): ${meeting.title}`,
      });
    }

    await meeting.save();

    return NextResponse.json({
      success: true,
      meeting: {
        _id: meeting._id,
        status: meeting.status,
        closedAt: meeting.closedAt,
        downloadedAt: meeting.downloadedAt,
        photosExpireAt: meeting.photosExpireAt,
        photosPurged: meeting.photosPurged,
      },
    });
  } catch (error: any) {
    console.error("PATCH /api/presentations/meetings/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Toplantı güncellenemedi." },
      { status: 500 }
    );
  }
}
