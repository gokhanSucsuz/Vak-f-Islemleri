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
  decompressSlides,
  decompressSlidesCached,
  computeSlideStats,
  sanitizeSlidePlainText,
  sanitizeSlideHtmlServer,
} from "@/lib/presentationUtils";
import { parseShieldedRequestJson, respondShieldedJson } from "@/lib/payloadShield";

function sanitizeIncomingSlides(rawSlides: ISlideData[]): ISlideData[] {
  const sanitized: ISlideData[] = rawSlides.slice(0, 60).map((s): ISlideData => {
    const cleanPlain = sanitizeSlidePlainText(s.description || "");
    const cleanHtml = sanitizeSlideHtmlServer(
      typeof s.descriptionHtml === "string" ? s.descriptionHtml : "",
      cleanPlain
    );
    return {
      fullName: (s.fullName || "").replace(/\s+/g, " ").trim().slice(0, 180),
      neighborhood: (s.neighborhood || "").replace(/\s+/g, " ").trim().slice(0, 140),
      photoCount: ([0, 1, 2, 4].includes(Number(s.photoCount))
        ? Number(s.photoCount)
        : 0) as 0 | 1 | 2 | 4,
      photos: Array.isArray(s.photos)
        ? s.photos.filter((p) => typeof p === "string").slice(0, 4)
        : [],
      description: cleanPlain,
      descriptionHtml: cleanHtml,
      fontFamily: "Verdana",
      fontSize:
        s.fontSize === "auto" || !s.fontSize
          ? ("auto" as const)
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
      photoFitMode: (
        s.photoFitMode === "fill" || s.photoFitMode === "cover"
          ? s.photoFitMode
          : "contain"
      ) as "contain" | "cover" | "fill",
      templateId: s.templateId ? String(s.templateId).slice(0, 64) : undefined,
      backgroundPreset: s.backgroundPreset
        ? String(s.backgroundPreset).slice(0, 40)
        : "template",
    };
  });

  const firstValidName = sanitized.find((s) => s.fullName)?.fullName || "";
  const firstValidNeighborhood =
    sanitized.find((s) => s.neighborhood)?.neighborhood || "";

  if (!firstValidName) {
    return [];
  }

  return sanitized.map((s) => ({
    ...s,
    fullName: s.fullName || firstValidName,
    neighborhood: s.neighborhood || firstValidNeighborhood,
    fontFamily: "Verdana",
  }));
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    const userId = String((session.user as any)?.id || "");

    const { searchParams } = new URL(req.url);
    const meetingId = (searchParams.get("meetingId") || "").trim();
    const globalSearch = searchParams.get("globalSearch") === "1";
    const search = (searchParams.get("search") || "").trim().slice(0, 120);

    if (meetingId && !mongoose.Types.ObjectId.isValid(meetingId)) {
      return NextResponse.json({ error: "Geçersiz toplantı kimliği." }, { status: 400 });
    }

    // Tüm toplantılarda arama modunda boş sorgu geldiyse gereksiz veri döndürme
    if (globalSearch && !meetingId && !search) {
      return respondShieldedJson(req, userId, { presentations: [], totalMatched: 0 });
    }

    await dbConnect();
    const { turkishIncludes } = await import("@/lib/turkish");
    const LOCK_TTL_MS = 3 * 60 * 1000;
    const nowMs = Date.now();

    // =========================================================================
    // MOD 1: TÜM TOPLANTI KLASÖRLERİNDE GENEL SUNU ARA-BUL (globalSearch=1)
    // =========================================================================
    if (globalSearch && !meetingId) {
      // HIZLANDIRMA: Tüm geçmiş toplantıları tararken firstPhoto ve slidesCompressed çekilmez!
      const lightAll = await Presentation.find({})
        .select("-slidesCompressed -firstPhoto")
        .populate("createdBy", "name")
        .populate("lockedBy", "name")
        .populate(
          "meetingId",
          "title status meetingDate backgroundPreset photoFramePreset"
        )
        .sort({ createdAt: -1 })
        .limit(3000)
        .lean();

      const matchedAll = lightAll.filter((r: any) => {
        const mTitle = (r.meetingId as any)?.title || "";
        const cName = (r.createdBy as any)?.name || "";
        return (
          turkishIncludes(r.summaryTitle || "", search) ||
          (r.searchCorpus ? turkishIncludes(r.searchCorpus, search) : false) ||
          turkishIncludes(cName, search) ||
          turkishIncludes(mTitle, search)
        );
      });

      const totalMatched = matchedAll.length;
      const topMatches = matchedAll.slice(0, 60);
      const topIds = topMatches.map((r: any) => r._id);

      // Sadece eşleşen ilk 60 kaydın kapak küçük fotoğrafını (firstPhoto) çek
      const photoDocs =
        topIds.length > 0
          ? await Presentation.find({ _id: { $in: topIds } })
              .select("_id firstPhoto")
              .lean()
          : [];
      const photoMap = new Map<string, string>(
        photoDocs.map((d: any) => [String(d._id), d.firstPhoto || ""])
      );

      const mappedGlobal = topMatches.map((r: any) => {
        const isLockActive =
          Boolean(r.lockedBy) &&
          Boolean(r.lockedAt) &&
          nowMs - new Date(r.lockedAt).getTime() < LOCK_TTL_MS;

        return {
          _id: r._id,
          meetingId: (r.meetingId as any)?._id || r.meetingId,
          meetingTitle: (r.meetingId as any)?.title || "Toplantı",
          meetingStatus: (r.meetingId as any)?.status || "closed",
          meetingDate: (r.meetingId as any)?.meetingDate || null,
          meetingBackgroundPreset:
            (r.meetingId as any)?.backgroundPreset || "template",
          meetingPhotoFramePreset:
            (r.meetingId as any)?.photoFramePreset || "none",
          summaryTitle: r.summaryTitle,
          slideCount: r.slideCount || 1,
          totalPhotos: r.totalPhotos ?? 0,
          photoBytes: r.photoBytes ?? 0,
          presentationBytes: r.presentationBytes ?? 0,
          firstPhoto: photoMap.get(String(r._id)) || "",
          createdBy: r.createdBy,
          lockedBy: isLockActive ? r.lockedBy : null,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      });

      return respondShieldedJson(req, userId, {
        presentations: mappedGlobal,
        totalMatched,
      });
    }

    // =========================================================================
    // MOD 2: SEÇİLİ TEK TOPLANTI KLASÖRÜ İÇİNDE LİSTELEME & ARAMA
    // =========================================================================
    const query: any = {};
    if (meetingId) {
      query.meetingId = meetingId;
    }

    // HIZLANDIRMA: slidesCompressed (MB'larca fotoğraf) liste sorgusunda hiç çekilmez!
    const records = await Presentation.find(query)
      .select("-slidesCompressed")
      .populate("createdBy", "name")
      .populate("lockedBy", "name")
      .populate("meetingId", "title status meetingDate backgroundPreset photoFramePreset")
      .sort({ createdAt: -1 })
      .limit(300)
      .lean();

    // Eski kayıtlarda kart özet alanları (totalPhotos === null) henüz yazılmamışsa bir kez hesapla ve arka planda kaydet
    const missingIds = records
      .filter((r: any) => r.totalPhotos === null || r.totalPhotos === undefined)
      .map((r: any) => r._id);

    const legacyStatsMap = new Map<
      string,
      {
        slideCount: number;
        totalPhotos: number;
        photoBytes: number;
        presentationBytes: number;
        firstPhoto: string;
        searchCorpus: string;
      }
    >();

    if (missingIds.length > 0) {
      const fullMissing = await Presentation.find({ _id: { $in: missingIds } })
        .select("slidesCompressed slideCount")
        .lean();

      await Promise.all(
        fullMissing.map(async (m: any) => {
          const slides = await decompressSlides(m.slidesCompressed);
          const stats = computeSlideStats(slides, m.slidesCompressed?.length || 0);
          const corpus = slides
            .map((s) => `${s.fullName} ${s.neighborhood} ${s.description || ""}`)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 2400);
          const computed = {
            slideCount: m.slideCount || slides.length,
            ...stats,
            searchCorpus: corpus,
          };
          legacyStatsMap.set(String(m._id), computed);

          // Arka planda veritabanına kalıcı olarak yaz (bir daha asla açılmasın)
          void Presentation.findByIdAndUpdate(m._id, {
            $set: {
              totalPhotos: stats.totalPhotos,
              photoBytes: stats.photoBytes,
              presentationBytes: stats.presentationBytes,
              firstPhoto: stats.firstPhoto,
              searchCorpus: corpus,
            },
          }).catch(() => {});
        })
      );
    }

    const mapped = records.map((r: any) => {
      const legacy = legacyStatsMap.get(String(r._id));
      const isLockActive =
        Boolean(r.lockedBy) &&
        Boolean(r.lockedAt) &&
        nowMs - new Date(r.lockedAt).getTime() < LOCK_TTL_MS;

      return {
        _id: r._id,
        meetingId: (r.meetingId as any)?._id || r.meetingId,
        meetingTitle: (r.meetingId as any)?.title || "",
        meetingStatus: (r.meetingId as any)?.status || "open",
        meetingDate: (r.meetingId as any)?.meetingDate || null,
        meetingBackgroundPreset:
          (r.meetingId as any)?.backgroundPreset || "template",
        meetingPhotoFramePreset:
          (r.meetingId as any)?.photoFramePreset || "none",
        summaryTitle: r.summaryTitle,
         _searchCorpus: legacy ? legacy.searchCorpus : r.searchCorpus || "",
        slideCount: legacy ? legacy.slideCount : r.slideCount || 1,
        totalPhotos: legacy ? legacy.totalPhotos : r.totalPhotos ?? 0,
        photoBytes: legacy ? legacy.photoBytes : r.photoBytes ?? 0,
        presentationBytes: legacy ? legacy.presentationBytes : r.presentationBytes ?? 0,
        firstPhoto: legacy ? legacy.firstPhoto : r.firstPhoto || "",
        createdBy: r.createdBy,
        lockedBy: isLockActive ? r.lockedBy : null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });

    // DİKKAT: Klasör içi aramada YALNIZCA bu toplantıdaki slayt alanlarına (isim, mahalle, açıklama, hazırlayan) bakılır!
    const filtered = (
      search
        ? mapped.filter(
            (m) =>
              turkishIncludes(m.summaryTitle || "", search) ||
              (m._searchCorpus ? turkishIncludes(m._searchCorpus, search) : false) ||
              turkishIncludes((m.createdBy as any)?.name || "", search)
          )
        : mapped
    ).map(({ _searchCorpus: _omit, ...rest }) => rest);

    return respondShieldedJson(req, userId, { presentations: filtered });
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

    const body = await parseShieldedRequestJson<{
      action?: "copyToOpenMeeting";
      sourcePresentationId?: string;
      slideIndices?: number[];
      targetMeetingId?: string;
      meetingId?: string;
      slides?: ISlideData[];
    }>(req, String(userId));

    await dbConnect();
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);

    // =========================================================================
    // GÜVENLİ SUNUCU TARAFLI KOPYALAMA: Eski / Kapatılmış Toplantıdan Açık Toplantıya Aktarım
    // Kaynak sunu salt okunur kalır; açık toplantıda yeni bağımsız bir kayıt oluşturulur.
    // =========================================================================
    if (body.action === "copyToOpenMeeting" || body.sourcePresentationId) {
      const srcId = String(body.sourcePresentationId || "").trim();
      if (!mongoose.Types.ObjectId.isValid(srcId)) {
        return NextResponse.json(
          { error: "Kopyalanacak kaynak sunu kimliği geçersiz." },
          { status: 400 }
        );
      }

      let targetMeeting: any = null;
      if (body.targetMeetingId && mongoose.Types.ObjectId.isValid(body.targetMeetingId)) {
        targetMeeting = await PresentationMeeting.findById(body.targetMeetingId).lean();
      } else {
        targetMeeting = await PresentationMeeting.findOne({ status: "open" })
          .sort({ createdAt: -1 })
          .lean();
      }

      if (!targetMeeting || targetMeeting.status !== "open") {
        return NextResponse.json(
          {
            error:
              "Şu anda açık bir toplantı bulunmuyor. Sunuyu kopyalayabilmek için önce yeni bir toplantı açılmalıdır.",
          },
          { status: 400 }
        );
      }

      const isManager = perms.canManagePresentations;
      const isAuthorizedStaff =
        perms.canManagePresentations ||
        (Boolean(targetMeeting.authorizedUserId) &&
          String(targetMeeting.authorizedUserId) === String(userId));

      if (targetMeeting.isLocked && !isManager && !isAuthorizedStaff) {
        return NextResponse.json(
          {
            error:
              "Açık toplantı sıralama/kapatma için kilitlenmiştir. Sadece yönetici ve yetkili personel sunu kopyalayabilir.",
          },
          { status: 403 }
        );
      }

      const sourceRecord = (await Presentation.findById(srcId)
        .populate("meetingId", "title status")
        .lean()) as any;
      if (!sourceRecord) {
        return NextResponse.json(
          { error: "Kopyalanmak istenen kaynak sunu bulunamadı." },
          { status: 404 }
        );
      }

      const sourceSlides = await decompressSlidesCached(
        String(sourceRecord._id),
        sourceRecord.updatedAt,
        sourceRecord.slidesCompressed
      );
      if (!sourceSlides || sourceSlides.length === 0) {
        return NextResponse.json(
          { error: "Kaynak sunuda kopyalanabilecek slayt sayfası bulunamadı." },
          { status: 400 }
        );
      }

      let pickedSlides: ISlideData[] = sourceSlides;
      if (Array.isArray(body.slideIndices) && body.slideIndices.length > 0) {
        const uniqueIdx = Array.from(
          new Set(
            body.slideIndices
              .map((n) => Math.trunc(Number(n)))
              .filter((n) => Number.isFinite(n) && n >= 0 && n < sourceSlides.length)
          )
        );
        if (uniqueIdx.length === 0) {
          return NextResponse.json(
            { error: "Seçilen slayt sayfası geçersiz." },
            { status: 400 }
          );
        }
        pickedSlides = uniqueIdx.map((idx) => sourceSlides[idx]);
      }

      const finalCopiedSlides = sanitizeIncomingSlides(pickedSlides);
      if (finalCopiedSlides.length === 0) {
        return NextResponse.json(
          { error: "Kopyalanan slaytlarda geçerli Ad Soyad bilgisi bulunamadı." },
          { status: 400 }
        );
      }

      const summaryTitle = Array.from(
        new Set(
          finalCopiedSlides.map((s) =>
            s.neighborhood ? `${s.fullName} (${s.neighborhood})` : s.fullName
          )
        )
      ).join(" | ");
      const searchCorpus = finalCopiedSlides
        .map((s) => `${s.fullName} ${s.neighborhood} ${s.description || ""}`)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2400);

      const slidesCompressed = await compressSlides(finalCopiedSlides);
      const stats = computeSlideStats(finalCopiedSlides, slidesCompressed.length);

      const createdCopy = await Presentation.create({
        meetingId: targetMeeting._id,
        summaryTitle,
        searchCorpus,
        slideCount: finalCopiedSlides.length,
        totalPhotos: stats.totalPhotos,
        photoBytes: stats.photoBytes,
        presentationBytes: stats.presentationBytes,
        firstPhoto: stats.firstPhoto,
        slidesCompressed,
        createdBy: userId,
      });

      const fromTitle = (sourceRecord.meetingId as any)?.title || "Eski Toplantı";
      void Log.create({
        userId,
        action: "SUNU_YENI_TOPLANTIYA_KOPYALANDI",
        details: `"${fromTitle}" dosyasından "${targetMeeting.title}" açık toplantısına ${finalCopiedSlides.length} sayfa kopyalandı: ${summaryTitle}`,
      }).catch(() => {});

      const presentationCard = {
        _id: createdCopy._id,
        meetingId: String(targetMeeting._id),
        meetingTitle: targetMeeting.title || "",
        meetingStatus: targetMeeting.status || "open",
        summaryTitle,
        slideCount: finalCopiedSlides.length,
        totalPhotos: stats.totalPhotos,
        photoBytes: stats.photoBytes,
        presentationBytes: stats.presentationBytes,
        firstPhoto: stats.firstPhoto,
        createdBy: {
          _id: userId,
          name: session.user.name || "Personel",
        },
        lockedBy: null,
        createdAt: createdCopy.createdAt,
        updatedAt: createdCopy.updatedAt,
      };

      return respondShieldedJson(
        req,
        String(userId),
        {
          success: true,
          presentationCard,
          targetMeetingId: String(targetMeeting._id),
          targetMeetingTitle: targetMeeting.title || "",
        },
        201
      );
    }

    const { meetingId, slides } = body;

    if (!meetingId || !mongoose.Types.ObjectId.isValid(meetingId)) {
      return NextResponse.json(
        { error: "Lütfen geçerli ve aktif bir toplantı seçin." },
        { status: 400 }
      );
    }

    if (!Array.isArray(slides) || slides.length === 0) {
      return NextResponse.json(
        { error: "En az bir sunu sayfası eklemelisiniz." },
        { status: 400 }
      );
    }

    const finalSlides = sanitizeIncomingSlides(slides);
    if (finalSlides.length === 0) {
      return NextResponse.json(
        { error: "Adı Soyadı alanı zorunludur." },
        { status: 400 }
      );
    }

    const meeting = (await PresentationMeeting.findById(meetingId).lean()) as any;
    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }
    if (meeting.status === "closed") {
      return NextResponse.json(
        { error: "Bu toplantı kapatıldığı için salt okunurdur; yeni slayt eklenemez." },
        { status: 400 }
      );
    }

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
    const searchCorpus = finalSlides
      .map((s) => `${s.fullName} ${s.neighborhood} ${s.description || ""}`)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2400);

    const slidesCompressed = await compressSlides(finalSlides);
    const stats = computeSlideStats(finalSlides, slidesCompressed.length);

    const created = await Presentation.create({
      meetingId,
      summaryTitle,
      searchCorpus,
      slideCount: finalSlides.length,
      totalPhotos: stats.totalPhotos,
      photoBytes: stats.photoBytes,
      presentationBytes: stats.presentationBytes,
      firstPhoto: stats.firstPhoto,
      slidesCompressed,
      createdBy: userId,
    });

    void Log.create({
      userId,
      action: "SUNU_OLUSTURULDU",
      details: `${finalSlides.length} sayfalık sunu kaydedildi: ${summaryTitle}`,
    }).catch(() => {});

    const presentationCard = {
      _id: created._id,
      meetingId: String(meeting._id),
      meetingTitle: meeting.title || "",
      meetingStatus: meeting.status || "open",
      summaryTitle,
      slideCount: finalSlides.length,
      totalPhotos: stats.totalPhotos,
      photoBytes: stats.photoBytes,
      presentationBytes: stats.presentationBytes,
      firstPhoto: stats.firstPhoto,
      createdBy: {
        _id: userId,
        name: session.user.name || "Personel",
      },
      lockedBy: null,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };

    return respondShieldedJson(req, String(userId), { success: true, presentationCard }, 201);
  } catch (error: any) {
    console.error("POST /api/presentations error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu kaydedilemedi." },
      { status: 500 }
    );
  }
}
