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

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const meetingId = searchParams.get("meetingId") || "";
    const search = (searchParams.get("search") || "").trim();

    await dbConnect();
    await purgeExpiredMeetingPhotos();

    const query: any = {};
    if (meetingId) {
      query.meetingId = meetingId;
    }

    const records = await Presentation.find(query)
      .populate("createdBy", "name")
      .populate("lockedBy", "name")
      .populate("meetingId", "title status")
      .sort({ createdAt: -1 })
      .limit(200);

    const LOCK_TTL_MS = 3 * 60 * 1000;
    const nowMs = Date.now();
    const dataUriByteSize = (dataUri: string) => {
      if (!dataUri) return 0;
      const commaIdx = dataUri.indexOf(",");
      const b64 = commaIdx >= 0 ? dataUri.slice(commaIdx + 1) : dataUri;
      const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
      return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
    };

    const mapped = await Promise.all(
      records.map(async (r) => {
        const slides = await decompressSlides(r.slidesCompressed);
        const totalPhotos = slides.reduce(
          (sum, s) => sum + (Array.isArray(s.photos) ? s.photos.length : 0),
          0
        );
        const photoBytes = slides.reduce(
          (sum, s) =>
            sum +
            (Array.isArray(s.photos)
              ? s.photos.reduce((pSum, p) => pSum + dataUriByteSize(p), 0)
              : 0),
          0
        );
        const presentationBytes = r.slidesCompressed?.length || 0;
        const isLockActive =
          Boolean(r.lockedBy) &&
          Boolean(r.lockedAt) &&
          nowMs - new Date(r.lockedAt).getTime() < LOCK_TTL_MS;
        return {
          _id: r._id,
          meetingId: (r.meetingId as any)?._id || r.meetingId,
          meetingTitle: (r.meetingId as any)?.title || "",
          meetingStatus: (r.meetingId as any)?.status || "open",
          summaryTitle: r.summaryTitle,
          slideCount: r.slideCount || slides.length,
          totalPhotos,
          photoBytes,
          presentationBytes,
          firstPhoto: slides.find((s) => s.photos?.length > 0)?.photos?.[0] || "",
          createdBy: r.createdBy,
          lockedBy: isLockActive ? r.lockedBy : null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      })
    );

    const { turkishIncludes } = await import("@/lib/turkish");
    const filtered = search
      ? mapped.filter(
          (m) =>
            turkishIncludes(m.summaryTitle || "", search) ||
            turkishIncludes((m.createdBy as any)?.name || "", search) ||
            turkishIncludes(m.meetingTitle || "", search)
        )
      : mapped;

    return NextResponse.json({ presentations: filtered });
  } catch (error: any) {
    console.error("GET /api/presentations error:", error);
    return NextResponse.json(
      { error: error.message || "Sunular alınamadı." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const body = await req.json();
    const { meetingId, slides } = body as {
      meetingId: string;
      slides: ISlideData[];
    };

    if (!meetingId) {
      return NextResponse.json(
        { error: "Lütfen aktif bir toplantı seçin." },
        { status: 400 }
      );
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json(
        { error: "En az bir sunu sayfası eklemelisiniz." },
        { status: 400 }
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
          : Math.min(24, Math.max(7, Number(s.fontSize))),
      titleFontSize: Math.min(
        26,
        Math.max(
          s.fontSize && s.fontSize !== "auto"
            ? Math.min(24, Math.max(7, Number(s.fontSize))) + 1
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

    await dbConnect();
    const meeting = await PresentationMeeting.findById(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }
    if (meeting.status === "closed") {
      return NextResponse.json(
        { error: "Bu toplantı kapatıldığı için salt okunurdur; yeni slayt eklenemez." },
        { status: 400 }
      );
    }

    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);
    const isManager = perms.canManagePresentations;
    const isAuthorizedStaff =
      perms.canManagePresentations ||
      (Boolean(meeting.authorizedUserId) &&
        String(meeting.authorizedUserId) === String(userId));

    if (meeting.isLocked && !isManager && !isAuthorizedStaff) {
      return NextResponse.json(
        {
          error:
            "Toplantı slaytları sıralama/kapatma için kilitlendi. Sadece yönetici ve yetkili personel işlem yapabilir.",
        },
        { status: 403 }
      );
    }

    const summaryTitle = Array.from(
      new Set(
        finalSlides.map((s) =>
          s.neighborhood ? `${s.fullName} (${s.neighborhood})` : s.fullName
        )
      )
    ).join(" | ");

    const slidesCompressed = await compressSlides(finalSlides);

    const created = await Presentation.create({
      meetingId,
      summaryTitle,
      slideCount: sanitizedSlides.length,
      slidesCompressed,
      createdBy: userId,
    });

    await Log.create({
      userId,
      action: "SUNU_OLUSTURULDU",
      details: `${sanitizedSlides.length} sayfalık sunu kaydedildi: ${summaryTitle}`,
    });

    return NextResponse.json({ success: true, presentation: created }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/presentations error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu kaydedilemedi." },
      { status: 500 }
    );
  }
}
