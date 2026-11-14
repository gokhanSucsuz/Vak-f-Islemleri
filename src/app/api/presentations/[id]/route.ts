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

    const record = await Presentation.findById(id)
      .populate("createdBy", "name")
      .populate("meetingId", "title status");

    if (!record) {
      return NextResponse.json({ error: "Sunu kaydı bulunamadı." }, { status: 404 });
    }

    const slides = await decompressSlides(record.slidesCompressed);

    return NextResponse.json({
      presentation: {
        _id: record._id,
        meetingId: (record.meetingId as any)?._id || record.meetingId,
        meetingTitle: (record.meetingId as any)?.title || "",
        meetingStatus: (record.meetingId as any)?.status || "open",
        summaryTitle: record.summaryTitle,
        slideCount: record.slideCount,
        slides,
        createdBy: record.createdBy,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("GET /api/presentations/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu detayı alınamadı." },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const role = (session?.user as any)?.role;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const { slides } = body as { slides: ISlideData[] };

    if (!Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json(
        { error: "En az bir sunu sayfası olmalıdır." },
        { status: 400 }
      );
    }

    await dbConnect();
    const record = await Presentation.findById(id);
    if (!record) {
      return NextResponse.json({ error: "Sunu bulunamadı." }, { status: 404 });
    }

    const meeting = await PresentationMeeting.findById(record.meetingId);
    if (meeting?.status === "closed") {
      return NextResponse.json(
        { error: "Toplantı kapatıldığı için salt okunurdur; düzenleme yapılamaz." },
        { status: 400 }
      );
    }

    const isManager = role === "superadmin" || role === "manager";
    const isAuthorizedStaff =
      Boolean(meeting?.authorizedUserId) &&
      String(meeting?.authorizedUserId) === String(userId);

    if (meeting?.isLocked && !isManager && !isAuthorizedStaff) {
      return NextResponse.json(
        {
          error:
            "Toplantı slaytları sıralama/kapatma için kilitlendi. Sadece yönetici ve yetkili personel işlem yapabilir.",
        },
        { status: 403 }
      );
    }

    if (!isManager && !isAuthorizedStaff && String(record.createdBy) !== String(userId)) {
      return NextResponse.json(
        { error: "Sadece kendi oluşturduğunuz sunuları düzenleyebilirsiniz." },
        { status: 403 }
      );
    }

    const sanitizedSlides: ISlideData[] = slides.map((s) => ({
      fullName: (s.fullName || "").trim(),
      neighborhood: (s.neighborhood || "").trim(),
      photoCount: ([0, 1, 2, 4].includes(Number(s.photoCount))
        ? Number(s.photoCount)
        : 0) as 0 | 1 | 2 | 4,
      photos: Array.isArray(s.photos) ? s.photos.slice(0, 4) : [],
      description: (s.description || "").trim(),
      descriptionHtml: typeof s.descriptionHtml === "string" ? s.descriptionHtml : "",
      fontFamily: (s.fontFamily || "Verdana").trim() || "Verdana",
      fontSize:
        s.fontSize === "auto" || !s.fontSize
          ? "auto"
          : Math.min(20, Math.max(7, Number(s.fontSize))),
      titleFontSize: Math.min(
        36,
        Math.max(
          s.fontSize && s.fontSize !== "auto"
            ? Math.min(20, Math.max(7, Number(s.fontSize))) + 1
            : 14,
          Number(s.titleFontSize ?? 20)
        )
      ),
      titleBold: s.titleBold !== false,
      descTopPct: Math.min(65, Math.max(44.5, Number(s.descTopPct ?? 46))),
      descBottomPct: Math.min(97.5, Math.max(72, Number(s.descBottomPct ?? 96.5))),
      photoWidthPct: Math.min(52, Math.max(20, Number(s.photoWidthPct ?? 41))),
      photoHeightPct: Math.min(44, Math.max(22, Number(s.photoHeightPct ?? 41.6))),
      photoFitMode:
        s.photoFitMode === "fill" || s.photoFitMode === "cover"
          ? s.photoFitMode
          : "contain",
      templateId: s.templateId ? String(s.templateId) : undefined,
      backgroundPreset: s.backgroundPreset ? String(s.backgroundPreset).slice(0, 40) : "template",
    }));

    const firstValidName = sanitizedSlides.find((s) => s.fullName)?.fullName || "";
    const firstValidNeighborhood =
      sanitizedSlides.find((s) => s.neighborhood)?.neighborhood || "";

    if (!firstValidName) {
      return NextResponse.json(
        { error: "Adı Soyadı alanı zorunludur." },
        { status: 400 }
      );
    }

    const finalSlides = sanitizedSlides.map((s) => ({
      ...s,
      fullName: s.fullName || firstValidName,
      neighborhood: s.neighborhood || firstValidNeighborhood,
    }));

    record.slidesCompressed = await compressSlides(finalSlides);
    record.slideCount = finalSlides.length;
    record.summaryTitle = Array.from(
      new Set(
        finalSlides.map((s) =>
          s.neighborhood ? `${s.fullName} (${s.neighborhood})` : s.fullName
        )
      )
    ).join(" | ");
    record.updatedBy = userId;
    await record.save();

    await Log.create({
      userId,
      action: "SUNU_GUNCELLENDI",
      details: `Sunu güncellendi: ${record.summaryTitle}`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PUT /api/presentations/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu güncellenemedi." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const role = (session?.user as any)?.role;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    await dbConnect();
    const record = await Presentation.findById(id);
    if (!record) {
      return NextResponse.json({ error: "Sunu bulunamadı." }, { status: 404 });
    }

    const meeting = await PresentationMeeting.findById(record.meetingId);
    if (meeting?.status === "closed") {
      return NextResponse.json(
        { error: "Toplantı kapatıldığı için salt okunurdur; silme yapılamaz." },
        { status: 400 }
      );
    }

    const isManager = role === "superadmin" || role === "manager";
    const isAuthorizedStaff =
      Boolean(meeting?.authorizedUserId) &&
      String(meeting?.authorizedUserId) === String(userId);

    if (meeting?.isLocked && !isManager && !isAuthorizedStaff) {
      return NextResponse.json(
        {
          error:
            "Toplantı slaytları sıralama/kapatma için kilitlendi. Sadece yönetici ve yetkili personel silebilir.",
        },
        { status: 403 }
      );
    }

    if (!isManager && !isAuthorizedStaff && String(record.createdBy) !== String(userId)) {
      return NextResponse.json(
        { error: "Sadece kendi oluşturduğunuz sunuları silebilirsiniz." },
        { status: 403 }
      );
    }

    await Presentation.findByIdAndDelete(id);
    await Log.create({
      userId,
      action: "SUNU_SILINDI",
      details: `Sunu kaydı silindi: ${record.summaryTitle}`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/presentations/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu silinemedi." },
      { status: 500 }
    );
  }
}
