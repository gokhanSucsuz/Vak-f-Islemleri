import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Presentation, { ISlideData } from "@/models/Presentation";
import PresentationMeeting from "@/models/PresentationMeeting";
import Log from "@/models/Log";
import {
  compressSlides,
  decompressSlidesCached,
  computeSlideStats,
  sanitizeSlidePlainText,
  sanitizeSlideHtmlServer,
} from "@/lib/presentationUtils";
import { parseShieldedRequestJson, respondShieldedJson } from "@/lib/payloadShield";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    const userId = String((session.user as any)?.id || "");

    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Geçersiz sunu kimliği." }, { status: 400 });
    }
    await dbConnect();

    const record = (await Presentation.findById(id)
      .populate("createdBy", "name")
      .populate("meetingId", "title status meetingDate backgroundPreset photoFramePreset")
      .lean()) as any;

    if (!record) {
      return NextResponse.json({ error: "Sunu kaydı bulunamadı." }, { status: 404 });
    }

    const slides = await decompressSlidesCached(
      String(record._id),
      record.updatedAt,
      record.slidesCompressed
    );

    return respondShieldedJson(req, userId, {
      presentation: {
        _id: record._id,
        meetingId: (record.meetingId as any)?._id || record.meetingId,
        meetingTitle: (record.meetingId as any)?.title || "",
        meetingStatus: (record.meetingId as any)?.status || "open",
        meetingDate: (record.meetingId as any)?.meetingDate || null,
        meetingBackgroundPreset: (record.meetingId as any)?.backgroundPreset || "template",
        meetingPhotoFramePreset: (record.meetingId as any)?.photoFramePreset || "none",
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
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Geçersiz sunu kimliği." }, { status: 400 });
    }
    const body = await parseShieldedRequestJson<{ slides: ISlideData[] }>(
      req,
      String(userId)
    );
    const { slides } = body;

    if (!Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json(
        { error: "En az bir sunu sayfası olmalıdır." },
        { status: 400 }
      );
    }

    await dbConnect();
    const { getEffectivePermissions } = await import("@/lib/permissions");
    // HIZLANDIRMA: Eski slidesCompressed verisini veritabanından okumadan sadece üst veriyi al
    const [record, perms] = await Promise.all([
      Presentation.findById(id)
        .select("meetingId createdBy lockedBy lockedAt")
        .lean() as Promise<any>,
      getEffectivePermissions(session),
    ]);

    if (!record) {
      return NextResponse.json({ error: "Sunu bulunamadı." }, { status: 404 });
    }

    const meeting = (await PresentationMeeting.findById(record.meetingId).lean()) as any;
    if (meeting?.status === "closed") {
      return NextResponse.json(
        { error: "Toplantı kapatıldığı için salt okunurdur; düzenleme yapılamaz." },
        { status: 400 }
      );
    }

    const isManager = perms.canManagePresentations;
    const isAuthorizedStaff =
      perms.canManagePresentations ||
      (Boolean(meeting?.authorizedUserId) &&
        String(meeting?.authorizedUserId) === String(userId));

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

    const LOCK_TTL_MS = 3 * 60 * 1000;
    if (
      record.lockedBy &&
      String(record.lockedBy) !== String(userId) &&
      record.lockedAt &&
      Date.now() - new Date(record.lockedAt).getTime() < LOCK_TTL_MS
    ) {
      const populatedLock = (await Presentation.findById(id)
        .select("lockedBy")
        .populate("lockedBy", "name")
        .lean()) as any;
      const lockerName = populatedLock?.lockedBy?.name || "başka bir kullanıcı";
      return NextResponse.json(
        {
          error: `Bu sunu şu anda ${lockerName} tarafından düzenleniyor. Aynı anda yalnızca bir kişi düzenleme yapabilir.`,
        },
        { status: 423 }
      );
    }

    const sanitizedSlides: ISlideData[] = slides.map((s) => {
      const cleanPlain = sanitizeSlidePlainText(s.description || "");
      const cleanHtml = sanitizeSlideHtmlServer(
        typeof s.descriptionHtml === "string" ? s.descriptionHtml : "",
        cleanPlain
      );
      return {
        fullName: (s.fullName || "").replace(/\s+/g, " ").trim(),
        neighborhood: (s.neighborhood || "").replace(/\s+/g, " ").trim(),
        photoCount: ([0, 1, 2, 4].includes(Number(s.photoCount))
          ? Number(s.photoCount)
          : 0) as 0 | 1 | 2 | 4,
        photos: Array.isArray(s.photos) ? s.photos.slice(0, 4) : [],
        originalPhotos: Array.isArray(s.originalPhotos)
          ? s.originalPhotos.filter((p) => typeof p === "string").slice(0, 4)
          : undefined,
        description: cleanPlain,
        descriptionHtml: cleanHtml,
        fontFamily: "Verdana",
        fontSize:
          s.fontSize === "auto" || !s.fontSize
            ? "auto"
            : Math.min(24, Math.max(5.5, Number(s.fontSize))),
        titleFontSize: Math.min(
          26,
          Math.max(
            s.fontSize && s.fontSize !== "auto"
              ? Math.min(24, Math.max(5.5, Number(s.fontSize))) + 1
              : 14,
            Number(s.titleFontSize ?? 20)
          )
        ),
        titleBold: s.titleBold !== false,
        ...(s.descTopPct !== undefined && s.descTopPct !== null
          ? { descTopPct: Math.min(68, Math.max(20, Number(s.descTopPct))) }
          : {}),
        ...(s.descBottomPct !== undefined && s.descBottomPct !== null
          ? { descBottomPct: Math.min(98, Math.max(65, Number(s.descBottomPct))) }
          : {}),
        photoWidthPct: Math.min(52, Math.max(20, Number(s.photoWidthPct ?? 41))),
        photoHeightPct: Math.min(44, Math.max(22, Number(s.photoHeightPct ?? 41.6))),
        photoLeftPct: Math.min(30, Math.max(0, Number(s.photoLeftPct ?? 3.2))),
        photoFitMode:
          s.photoFitMode === "fill" || s.photoFitMode === "cover"
            ? s.photoFitMode
            : "contain",
        templateId: s.templateId ? String(s.templateId) : undefined,
        backgroundPreset: s.backgroundPreset ? String(s.backgroundPreset).slice(0, 40) : "template",
      };
    });

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
      fontFamily: "Verdana",
    }));

    const slidesCompressed = await compressSlides(finalSlides);
    const stats = computeSlideStats(finalSlides, slidesCompressed.length);
    const summaryTitle = Array.from(
      new Set(
        finalSlides.map((s) =>
          s.neighborhood ? `${s.fullName} (${s.neighborhood})` : s.fullName
        )
      )
    ).join(" | ");
    const searchCorpus = finalSlides
      .map((s) => `${s.fullName} ${s.neighborhood} ${s.description || ""}`)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2400);

    const updated = (await Presentation.findByIdAndUpdate(
      id,
      {
        $set: {
          slidesCompressed,
          slideCount: finalSlides.length,
          totalPhotos: stats.totalPhotos,
          photoBytes: stats.photoBytes,
          presentationBytes: stats.presentationBytes,
          firstPhoto: stats.firstPhoto,
          summaryTitle,
          searchCorpus,
          updatedBy: userId,
          lockedBy: null,
          lockedAt: null,
        },
      },
      { new: true }
    )
      .select("-slidesCompressed")
      .populate("createdBy", "name")
      .populate("meetingId", "title status")
      .lean()) as any;

    void Log.create({
      userId,
      action: "SUNU_GUNCELLENDI",
      details: `Sunu güncellendi: ${summaryTitle}`,
    }).catch(() => {});

    const presentationCard = updated
      ? {
          _id: updated._id,
          meetingId: (updated.meetingId as any)?._id || updated.meetingId,
          meetingTitle: (updated.meetingId as any)?.title || "",
          meetingStatus: (updated.meetingId as any)?.status || "open",
          summaryTitle: updated.summaryTitle,
          slideCount: updated.slideCount,
          totalPhotos: stats.totalPhotos,
          photoBytes: stats.photoBytes,
          presentationBytes: stats.presentationBytes,
          firstPhoto: stats.firstPhoto,
          createdBy: updated.createdBy,
          lockedBy: null,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
        }
      : null;

    return respondShieldedJson(req, String(userId), { success: true, presentationCard });
  } catch (error: any) {
    console.error("PUT /api/presentations/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu güncellenemedi." },
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
    const userId = (session?.user as any)?.id;
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Geçersiz sunu kimliği." }, { status: 400 });
    }
    const body = await req.json();
    const action = body?.action as "lock" | "heartbeat" | "unlock";
    const LOCK_TTL_MS = 3 * 60 * 1000;

    await dbConnect();

    if (action === "unlock") {
      await Presentation.updateOne(
        { _id: id, lockedBy: userId },
        { $set: { lockedBy: null, lockedAt: null } }
      );
      return NextResponse.json({ success: true });
    }

    if (action === "heartbeat") {
      await Presentation.updateOne(
        { _id: id, lockedBy: userId },
        { $set: { lockedAt: new Date() } }
      );
      return NextResponse.json({ success: true });
    }

    if (action === "lock") {
      const record = (await Presentation.findById(id)
        .select("meetingId createdBy")
        .lean()) as any;
      if (!record) {
        return NextResponse.json({ error: "Sunu bulunamadı." }, { status: 404 });
      }

      const { getEffectivePermissions } = await import("@/lib/permissions");
      const [meeting, perms] = await Promise.all([
        PresentationMeeting.findById(record.meetingId).lean() as Promise<any>,
        getEffectivePermissions(session),
      ]);

      if (meeting?.status === "closed") {
        return NextResponse.json(
          { error: "Toplantı kapatıldığı için salt okunurdur; düzenleme yapılamaz." },
          { status: 400 }
        );
      }

      const isManager = perms.canManagePresentations;
      const isAuthorizedStaff =
        perms.canManagePresentations ||
        (Boolean(meeting?.authorizedUserId) &&
          String(meeting?.authorizedUserId) === String(userId));

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

      const staleCutoff = new Date(Date.now() - LOCK_TTL_MS);
      const locked = await Presentation.findOneAndUpdate(
        {
          _id: id,
          $or: [
            { lockedBy: null },
            { lockedBy: { $exists: false } },
            { lockedBy: userId },
            { lockedAt: { $lt: staleCutoff } },
            { lockedAt: null },
          ],
        },
        { $set: { lockedBy: userId, lockedAt: new Date() } },
        { new: true }
      )
        .select("_id")
        .lean();

      if (!locked) {
        const current = (await Presentation.findById(id)
          .select("lockedBy")
          .populate("lockedBy", "name")
          .lean()) as any;
        const lockerName = current?.lockedBy?.name || "başka bir kullanıcı";
        return NextResponse.json(
          {
            error: `Bu sunu şu anda ${lockerName} tarafından düzenleniyor. Aynı anda yalnızca bir kişi düzenleme yapabilir.`,
            lockedBy: current?.lockedBy || null,
          },
          { status: 423 }
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Geçersiz kilit işlemi." }, { status: 400 });
  } catch (error: any) {
    console.error("PATCH /api/presentations/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Düzenleme kilidi işlemi başarısız." },
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
    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Geçersiz sunu kimliği." }, { status: 400 });
    }
    await dbConnect();
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const [record, perms] = await Promise.all([
      Presentation.findById(id)
        .select("meetingId createdBy summaryTitle slideCount")
        .lean() as Promise<any>,
      getEffectivePermissions(session),
    ]);

    if (!record) {
      return NextResponse.json({ error: "Sunu bulunamadı." }, { status: 404 });
    }

    const meeting = (await PresentationMeeting.findById(record.meetingId).lean()) as any;
    if (meeting?.status === "closed") {
      return NextResponse.json(
        { error: "Toplantı kapatıldığı için salt okunurdur; silme yapılamaz." },
        { status: 400 }
      );
    }

    const isManager = perms.canManagePresentations;
    const isAuthorizedStaff =
      perms.canManagePresentations ||
      (Boolean(meeting?.authorizedUserId) &&
        String(meeting?.authorizedUserId) === String(userId));

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
    void Log.create({
      userId,
      action: "SUNU_SILINDI",
      details: `Sunu kaydı silindi: ${record.summaryTitle}`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      deletedId: id,
      slideCount: record.slideCount || 1,
    });
  } catch (error: any) {
    console.error("DELETE /api/presentations/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu silinemedi." },
      { status: 500 }
    );
  }
}
