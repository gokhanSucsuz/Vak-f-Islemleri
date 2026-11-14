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
    await purgeExpiredMeetingPhotos();

    const meetings = await PresentationMeeting.find({})
      .populate("openedBy", "name")
      .populate("closedBy", "name")
      .sort({ createdAt: -1 })
      .limit(50);

    const presCounts = await Presentation.aggregate([
      {
        $group: {
          _id: "$meetingId",
          recordCount: { $sum: 1 },
          totalSlides: { $sum: "$slideCount" },
        },
      },
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
        openedBy: m.openedBy,
        closedBy: m.closedBy,
        closedAt: m.closedAt,
        downloadedAt: m.downloadedAt,
        photosExpireAt: m.photosExpireAt,
        photosPurged: m.photosPurged,
        photosPurgedAt: m.photosPurgedAt,
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
    const role = (session?.user as any)?.role;
    const userId = (session?.user as any)?.id;

    if (!session?.user || (role !== "superadmin" && role !== "manager")) {
      return NextResponse.json(
        { error: "Toplantı açma yetkisi sadece yöneticilere aittir." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const title = (body.title || "").trim();
    const meetingDate = body.meetingDate ? new Date(body.meetingDate) : new Date();

    if (!title) {
      return NextResponse.json({ error: "Toplantı başlığı zorunludur." }, { status: 400 });
    }

    await dbConnect();

    const meeting = await PresentationMeeting.create({
      title,
      meetingDate,
      status: "open",
      openedBy: userId,
    });

    await Log.create({
      userId,
      action: "TOPLANTI_ACILDI",
      details: `Sunu toplantısı açıldı: ${title}`,
    });

    return NextResponse.json({ success: true, meeting }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/presentations/meetings error:", error);
    return NextResponse.json(
      { error: error.message || "Toplantı açılırken hata oluştu." },
      { status: 500 }
    );
  }
}
