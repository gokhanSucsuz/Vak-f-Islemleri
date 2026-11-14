import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import PresentationMeeting from "@/models/PresentationMeeting";
import Presentation, { ISlideData } from "@/models/Presentation";
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

    // Çok sayfalı sunu kayıtlarını birbirinden koparmadan kayıt bazlı sırala
    type RecordGroup = {
      presentationId: string;
      summaryTitle: string;
      authorName: string;
      slideCount: number;
      firstPhoto: string;
      createdAt: Date;
      slides: ISlideData[];
    };

    const groupMap = new Map<string, RecordGroup>();
    const defaultList: RecordGroup[] = [];

    for (const pres of presentations) {
      const slides = await decompressSlides(pres.slidesCompressed);
      const authorName = (pres.createdBy as any)?.name || "Personel";
      const firstPhoto = slides.find((s) => s.photos?.length > 0)?.photos?.[0] || "";
      const grp: RecordGroup = {
        presentationId: String(pres._id),
        summaryTitle: pres.summaryTitle,
        authorName,
        slideCount: slides.length,
        firstPhoto,
        createdAt: pres.createdAt,
        slides,
      };
      groupMap.set(grp.presentationId, grp);
      defaultList.push(grp);
    }

    const orderedPresentations: RecordGroup[] = [];
    const seen = new Set<string>();

    if (Array.isArray(meeting.presentationOrder) && meeting.presentationOrder.length > 0) {
      for (const pid of meeting.presentationOrder) {
        const found = groupMap.get(String(pid));
        if (found && !seen.has(found.presentationId)) {
          orderedPresentations.push(found);
          seen.add(found.presentationId);
        }
      }
    }
    for (const item of defaultList) {
      if (!seen.has(item.presentationId)) {
        orderedPresentations.push(item);
        seen.add(item.presentationId);
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
      orderedPresentations,
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
    const { action, presentationOrder } = body;

    await dbConnect();
    const meeting = await PresentationMeeting.findById(id);
    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }

    if (Array.isArray(presentationOrder)) {
      meeting.presentationOrder = presentationOrder.map((pid: any) => String(pid));
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
