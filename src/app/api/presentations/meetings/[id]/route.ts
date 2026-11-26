import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import PresentationMeeting from "@/models/PresentationMeeting";
import Presentation, { ISlideData } from "@/models/Presentation";
import PresentationTemplate from "@/models/PresentationTemplate";
import Log from "@/models/Log";
import {
  decompressSlidesCached,
  compressPptxArchive,
  decompressPptxArchive,
  buildMeetingArchiveSignature,
  pruneOldMeetingArchives,
} from "@/lib/presentationUtils";
import { respondShieldedJson } from "@/lib/payloadShield";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const fastMode = searchParams.get("fast") === "1";
    const downloadCombined = searchParams.get("downloadCombined") === "1";
    const filterAuthor = (searchParams.get("author") || "").trim();
    await dbConnect();

    if (downloadCombined) {
      const meetingDoc = await PresentationMeeting.findById(id);
      if (!meetingDoc) {
        return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
      }

      const lightMeta = (await Presentation.find({ meetingId: id })
        .select("_id updatedAt createdAt")
        .sort({ createdAt: 1 })
        .lean()) as Array<{ _id: any; updatedAt?: Date }>;

      const byId = new Map(lightMeta.map((d) => [String(d._id), d]));
      const orderedLight: Array<{ _id: any; updatedAt?: Date }> = [];
      const seen = new Set<string>();
      for (const pid of meetingDoc.presentationOrder || []) {
        const hit = byId.get(String(pid));
        if (hit && !seen.has(String(hit._id))) {
          orderedLight.push(hit);
          seen.add(String(hit._id));
        }
      }
      for (const d of lightMeta) {
        if (!seen.has(String(d._id))) {
          orderedLight.push(d);
          seen.add(String(d._id));
        }
      }

      const activeCover = (await PresentationTemplate.findOne({
        templateKind: "cover",
        isActiveCover: true,
      })
        .select("_id updatedAt")
        .lean()) as { _id?: any; updatedAt?: Date } | null;
      const coverStamp = activeCover
        ? `${String(activeCover._id)}:${activeCover.updatedAt ? new Date(activeCover.updatedAt).getTime() : 0}`
        : "none";

      const expectedSig = buildMeetingArchiveSignature({
        orderedDocs: orderedLight,
        backgroundPreset: meetingDoc.backgroundPreset,
        photoFramePreset: meetingDoc.photoFramePreset,
        coverStamp,
      });

      if (
        !meetingDoc.combinedPptxCompressed ||
        meetingDoc.combinedPptxCompressed.length === 0 ||
        meetingDoc.combinedPptxHash !== expectedSig
      ) {
        return new NextResponse(null, {
          status: 204,
          headers: { "X-Archive-Signature": expectedSig },
        });
      }

      const rawPptx = await decompressPptxArchive(meetingDoc.combinedPptxCompressed);
      if (!rawPptx || rawPptx.length === 0) {
        return new NextResponse(null, { status: 204 });
      }

      if (!meetingDoc.downloadedAt) {
        const now = new Date();
        meetingDoc.downloadedAt = now;
        meetingDoc.photosExpireAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
        meetingDoc.photosPurged = false;
        void meetingDoc.save().catch(() => {});
      }

      const safeTitle = (meetingDoc.title || "Toplanti_Sunumu").replace(/[\\/:*?"<>|]/g, "_");
      return new NextResponse(new Uint8Array(rawPptx), {
        status: 200,
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(
            `${safeTitle}.pptx`
          )}`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const meeting = (await PresentationMeeting.findById(id)
      .select("-combinedPptxCompressed")
      .populate("openedBy", "name")
      .populate("closedBy", "name")
      .populate("authorizedUserId", "name email")
      .lean()) as any;

    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }

    // Hızlı açılış modunda önce hafif üst veriyi çek, yalnızca ilk 3 sununun ağır fotoğraflarını aç!
    const metaDocs = (await Presentation.find({ meetingId: id })
      .select("-slidesCompressed")
      .populate("createdBy", "name")
      .sort({ createdAt: 1 })
      .lean()) as any[];

    const metaById = new Map<string, any>();
    for (const doc of metaDocs) {
      metaById.set(String(doc._id), doc);
    }

    const orderedMetaDocs: any[] = [];
    const seenIds = new Set<string>();
    if (Array.isArray(meeting.presentationOrder) && meeting.presentationOrder.length > 0) {
      for (const pid of meeting.presentationOrder) {
        const found = metaById.get(String(pid));
        if (found && !seenIds.has(String(found._id))) {
          orderedMetaDocs.push(found);
          seenIds.add(String(found._id));
        }
      }
    }
    for (const doc of metaDocs) {
      if (!seenIds.has(String(doc._id))) {
        orderedMetaDocs.push(doc);
        seenIds.add(String(doc._id));
      }
    }

    // Hangi kayıtların tam slayt verisi hemen açılacak?
    const matchingForFast = filterAuthor
      ? orderedMetaDocs.filter(
          (d) => ((d.createdBy as any)?.name || "Personel") === filterAuthor
        )
      : orderedMetaDocs;

    const eagerIds = fastMode
      ? new Set(matchingForFast.slice(0, 3).map((d) => String(d._id)))
      : new Set(orderedMetaDocs.map((d) => String(d._id)));

    const fullDocs =
      eagerIds.size > 0
        ? ((await Presentation.find({ _id: { $in: Array.from(eagerIds) } })
            .select("slidesCompressed updatedAt")
            .lean()) as any[])
        : [];

    const slidesById = new Map<string, ISlideData[]>();
    await Promise.all(
      fullDocs.map(async (fd) => {
        const slides = await decompressSlidesCached(
          String(fd._id),
          fd.updatedAt,
          fd.slidesCompressed
        );
        slidesById.set(String(fd._id), slides);
      })
    );

    type RecordGroup = {
      presentationId: string;
      summaryTitle: string;
      authorName: string;
      slideCount: number;
      firstPhoto: string;
      createdAt: Date;
      isPartial?: boolean;
      slides: ISlideData[];
    };

    const hasDeferred = fastMode && orderedMetaDocs.length > eagerIds.size;

    const orderedPresentations: RecordGroup[] = orderedMetaDocs.map((pres) => {
      const pid = String(pres._id);
      const authorName = (pres.createdBy as any)?.name || "Personel";
      const loadedSlides = slidesById.get(pid);

      if (loadedSlides) {
        const firstPhoto =
          pres.firstPhoto ||
          loadedSlides.find((s) => s.photos?.length > 0)?.photos?.[0] ||
          "";
        return {
          presentationId: pid,
          summaryTitle: pres.summaryTitle,
          authorName,
          slideCount: loadedSlides.length,
          firstPhoto,
          createdAt: pres.createdAt,
          isPartial: false,
          slides: loadedSlides,
        };
      }

      // Arka planda yüklenene kadar hafif yer tutucu slaytlar
      const count = Math.max(1, Number(pres.slideCount) || 1);
      const stubSlides: ISlideData[] = Array.from({ length: count }, (_, idx) => ({
        fullName: pres.summaryTitle || "Yükleniyor...",
        neighborhood: "",
        photoCount: pres.firstPhoto && idx === 0 ? 1 : 0,
        photos: pres.firstPhoto && idx === 0 ? [pres.firstPhoto] : [],
        description: "Slayt detayları arka planda yükleniyor...",
        descriptionHtml: "",
        fontFamily: "Verdana",
        fontSize: "auto",
      }));

      return {
        presentationId: pid,
        summaryTitle: pres.summaryTitle,
        authorName,
        slideCount: count,
        firstPhoto: pres.firstPhoto || "",
        createdAt: pres.createdAt,
        isPartial: true,
        slides: stubSlides,
      };
    });

    const userId = String((session.user as any)?.id || "");
    return respondShieldedJson(req, userId, {
      meeting: {
        _id: meeting._id,
        title: meeting.title,
        meetingDate: meeting.meetingDate,
        status: meeting.status,
        isLocked: Boolean(meeting.isLocked),
        authorizedUserId: meeting.authorizedUserId || null,
        backgroundPreset: meeting.backgroundPreset || "template",
        photoFramePreset: meeting.photoFramePreset || "none",
        transitionPreset: (meeting as any).transitionPreset || "kurumsal_kaydir",
        openedBy: meeting.openedBy,
        closedBy: meeting.closedBy,
        closedAt: meeting.closedAt,
        downloadedAt: meeting.downloadedAt,
        photosExpireAt: meeting.photosExpireAt,
        photosPurged: meeting.photosPurged,
        photosPurgedAt: meeting.photosPurgedAt,
      },
      hasDeferred,
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

    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const {
      action,
      presentationOrder,
      authorizedUserId,
      backgroundPreset,
      photoFramePreset,
      transitionPreset,
    } = body;

    await dbConnect();
    const meeting = await PresentationMeeting.findById(id);
    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }

    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);
    const isManager = perms.canManagePresentations;
    const isAuthorizedStaff =
      perms.canManagePresentations ||
      (Boolean(meeting.authorizedUserId) &&
        String(meeting.authorizedUserId) === String(userId));

    // İndirme zamanlayıcısı (kapatılmış toplantı da indirilebilir)
    if (action === "markDownloaded") {
      if (!meeting.downloadedAt) {
        const now = new Date();
        meeting.downloadedAt = now;
        meeting.photosExpireAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
        meeting.photosPurged = false;
        await meeting.save();
        await Log.create({
          userId,
          action: "TOPLANTI_SLAYDI_INDIRILDI",
          details: `Birleştirilmiş toplantı sunusu indirildi (12 saat foto silme zamanlayıcısı başladı): ${meeting.title}`,
        });
      }
      return NextResponse.json({
        success: true,
        meeting: {
          _id: meeting._id,
          status: meeting.status,
          isLocked: Boolean(meeting.isLocked),
          downloadedAt: meeting.downloadedAt,
          photosExpireAt: meeting.photosExpireAt,
          photosPurged: meeting.photosPurged,
        },
      });
    }

    // Kapatılmış toplantıyı 12 saat içinde tekrar açma (Yönetici veya yetkili personel)
    if (action === "reopen") {
      if (!isManager && !isAuthorizedStaff) {
        return NextResponse.json(
          { error: "Bu işlem için yönetici veya toplantı yetkili personeli olmalısınız." },
          { status: 403 }
        );
      }
      if (meeting.status !== "closed") {
        return NextResponse.json(
          { error: "Sadece kapatılmış toplantılar tekrar açılabilir." },
          { status: 400 }
        );
      }
      const closedMs = meeting.closedAt ? new Date(meeting.closedAt).getTime() : 0;
      if (!closedMs || Date.now() - closedMs > 12 * 60 * 60 * 1000) {
        return NextResponse.json(
          { error: "Kapatılan toplantı yalnızca kapatıldıktan sonraki 12 saat içinde tekrar açılabilir." },
          { status: 400 }
        );
      }
      const anotherOpen = await PresentationMeeting.findOne({
        _id: { $ne: meeting._id },
        status: "open",
      });
      if (anotherOpen) {
        return NextResponse.json(
          {
            error: `Şu anda açık olan başka bir toplantı (${anotherOpen.title}) bulunduğu için bu toplantı tekrar açılamaz. Önce açık toplantıyı kapatın.`,
          },
          { status: 400 }
        );
      }

      meeting.status = "open";
      meeting.isLocked = false;
      meeting.closedBy = undefined;
      meeting.closedAt = undefined;
      if (!meeting.photosPurged) {
        meeting.downloadedAt = undefined;
        meeting.photosExpireAt = undefined;
      }
      await meeting.save();

      await Log.create({
        userId,
        action: "TOPLANTI_TEKRAR_ACILDI",
        details: `Kapatılan toplantı 12 saat içinde tekrar açıldı: ${meeting.title}`,
      });

      return NextResponse.json({
        success: true,
        meeting: {
          _id: meeting._id,
          status: meeting.status,
          isLocked: Boolean(meeting.isLocked),
          closedAt: meeting.closedAt,
          downloadedAt: meeting.downloadedAt,
          photosExpireAt: meeting.photosExpireAt,
          photosPurged: meeting.photosPurged,
        },
      });
    }

    // Tam ekran sunum slayt geçiş efekti seçimi yalnızca Süper Admin'e aittir (açık/kapalı tüm toplantılarda seçilebilir)
    if (action === "setTransitionPreset") {
      if (role !== "superadmin") {
        return NextResponse.json(
          {
            error:
              "Tam ekran sunum slayt geçiş efektini değiştirme yetkisi yalnızca Süper Admin'e aittir.",
          },
          { status: 403 }
        );
      }
      meeting.transitionPreset = transitionPreset
        ? String(transitionPreset).slice(0, 40)
        : "kurumsal_kaydir";
      await meeting.save();
      void Log.create({
        userId,
        action: "TOPLANTI_GECIS_EFEKTI_GUNCELLENDI",
        details: `Toplantı (${meeting.title}) tam ekran slayt geçiş efekti güncellendi: ${meeting.transitionPreset}`,
      }).catch(() => {});
      return NextResponse.json({
        success: true,
        meeting: {
          _id: meeting._id,
          transitionPreset: meeting.transitionPreset,
        },
      });
    }

    // Kapatılmış toplantı sistem üzerinde tamamen salt okunurdur
    if (meeting.status === "closed") {
      return NextResponse.json(
        {
          error:
            "Bu toplantı kapatıldığı için sistem üzerinde salt okunurdur. Sadece birleştirilmiş sunu indirilip bilgisayarınızda düzenlenebilir.",
        },
        { status: 400 }
      );
    }

    // Yetkili personel atama ve değiştirme yalnızca Süper Admin'e aittir
    if (action === "setAuthorizedUser") {
      if (role !== "superadmin") {
        return NextResponse.json(
          { error: "Yetkili personel belirleme işlemi yalnızca Süper Admin'e aittir." },
          { status: 403 }
        );
      }
      meeting.authorizedUserId = authorizedUserId || undefined;
      await meeting.save();
      await Log.create({
        userId,
        action: "TOPLANTI_YETKILI_ATANDI",
        details: `Toplantı (${meeting.title}) için yetkili personel güncellendi.`,
      });
      const populated = await PresentationMeeting.findById(id).populate(
        "authorizedUserId",
        "name email"
      );
      return NextResponse.json({
        success: true,
        meeting: {
          _id: meeting._id,
          authorizedUserId: populated?.authorizedUserId || null,
        },
      });
    }

    // Toplantı arka plan teması sadece yönetici veya yetkili personel tarafından değiştirilebilir
    if (action === "setBackgroundPreset") {
      if (!isManager && !isAuthorizedStaff) {
        return NextResponse.json(
          { error: "Arka plan teması sadece yönetici veya toplantı yetkili personeli tarafından değiştirilebilir." },
          { status: 403 }
        );
      }
      meeting.backgroundPreset = backgroundPreset
        ? String(backgroundPreset).slice(0, 40)
        : "template";
      await meeting.save();
      await Log.create({
        userId,
        action: "TOPLANTI_ARKAPLAN_GUNCELLENDI",
        details: `Toplantı (${meeting.title}) arka plan teması güncellendi: ${meeting.backgroundPreset}`,
      });
      return NextResponse.json({
        success: true,
        meeting: {
          _id: meeting._id,
          backgroundPreset: meeting.backgroundPreset,
        },
      });
    }

    // Toplantı fotoğraflarına toplu kurumsal çerçeve ekleme / değiştirme yalnızca Süper Admin'e aittir
    if (action === "setPhotoFramePreset") {
      if (role !== "superadmin") {
        return NextResponse.json(
          {
            error:
              "Fotoğraflara toplu çerçeve ekleme ve değiştirme yetkisi yalnızca Süper Admin'e aittir.",
          },
          { status: 403 }
        );
      }
      meeting.photoFramePreset = photoFramePreset
        ? String(photoFramePreset).slice(0, 40)
        : "none";
      await meeting.save();
      await Log.create({
        userId,
        action: "TOPLANTI_CERCEVE_GUNCELLENDI",
        details: `Aktif toplantı (${meeting.title}) içindeki tüm sunular için fotoğraf çerçevesi güncellendi: ${meeting.photoFramePreset}`,
      });
      return NextResponse.json({
        success: true,
        meeting: {
          _id: meeting._id,
          photoFramePreset: meeting.photoFramePreset,
        },
      });
    }

    // Sıralama, kilitleme ve kapatma: Yönetici veya yetki verilen personel yapabilir
    if (!isManager && !isAuthorizedStaff) {
      return NextResponse.json(
        { error: "Bu işlem için yönetici veya toplantı yetkili personeli olmalısınız." },
        { status: 403 }
      );
    }

    if (Array.isArray(presentationOrder)) {
      meeting.presentationOrder = presentationOrder.map((pid: any) => String(pid));
    }

    if (action === "lock") {
      meeting.isLocked = true;
      await Log.create({
        userId,
        action: "TOPLANTI_KILITLENDI",
        details: `Toplantı slaytları sıralama/kapatma için kilitlendi: ${meeting.title}`,
      });
    } else if (action === "unlock") {
      meeting.isLocked = false;
      await Log.create({
        userId,
        action: "TOPLANTI_KILIDI_ACILDI",
        details: `Toplantı slayt kilidi açıldı: ${meeting.title}`,
      });
    } else if (action === "close") {
      meeting.status = "closed";
      meeting.isLocked = true;
      meeting.closedBy = userId;
      meeting.closedAt = new Date();
      await Log.create({
        userId,
        action: "TOPLANTI_KAPATILDI",
        details: `Toplantı kapatıldı ve salt okunur hale getirildi: ${meeting.title}`,
      });
    }

    await meeting.save();

    return NextResponse.json({
      success: true,
      meeting: {
        _id: meeting._id,
        status: meeting.status,
        isLocked: Boolean(meeting.isLocked),
        closedAt: meeting.closedAt,
        downloadedAt: meeting.downloadedAt,
        photosExpireAt: meeting.photosExpireAt,
        photosPurged: meeting.photosPurged,
        combinedPptxSize: meeting.combinedPptxSize || 0,
        combinedPptxUpdatedAt: meeting.combinedPptxUpdatedAt || null,
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

/**
 * İndirilen birleştirilmiş toplantı sunusunu (.pptx) kayıpsız Brotli + AES-256-GCM ile
 * sıkıştırılmış olarak toplantı kaydında saklar; eski toplantı önbelleklerini otomatik temizler.
 */
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
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 400 });
    }

    await dbConnect();
    const meeting = await PresentationMeeting.findById(id);
    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }

    const lightMeta = (await Presentation.find({ meetingId: id })
      .select("_id updatedAt createdAt")
      .sort({ createdAt: 1 })
      .lean()) as Array<{ _id: any; updatedAt?: Date }>;

    const byId = new Map(lightMeta.map((d) => [String(d._id), d]));
    const orderedLight: Array<{ _id: any; updatedAt?: Date }> = [];
    const seen = new Set<string>();
    for (const pid of meeting.presentationOrder || []) {
      const hit = byId.get(String(pid));
      if (hit && !seen.has(String(hit._id))) {
        orderedLight.push(hit);
        seen.add(String(hit._id));
      }
    }
    for (const d of lightMeta) {
      if (!seen.has(String(d._id))) {
        orderedLight.push(d);
        seen.add(String(d._id));
      }
    }

    const activeCover = (await PresentationTemplate.findOne({
      templateKind: "cover",
      isActiveCover: true,
    })
      .select("_id updatedAt")
      .lean()) as { _id?: any; updatedAt?: Date } | null;
    const coverStamp = activeCover
      ? `${String(activeCover._id)}:${activeCover.updatedAt ? new Date(activeCover.updatedAt).getTime() : 0}`
      : "none";

    const signature = buildMeetingArchiveSignature({
      orderedDocs: orderedLight,
      backgroundPreset: meeting.backgroundPreset,
      photoFramePreset: meeting.photoFramePreset,
      coverStamp,
    });

    const rawBuf = Buffer.from(await file.arrayBuffer());
    const compressedBuf = await compressPptxArchive(rawBuf);
    const now = new Date();

    meeting.combinedPptxCompressed = compressedBuf;
    meeting.combinedPptxHash = signature;
    meeting.combinedPptxSize = compressedBuf.length;
    meeting.combinedPptxUpdatedAt = now;
    if (!meeting.downloadedAt) {
      meeting.downloadedAt = now;
      meeting.photosExpireAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      meeting.photosPurged = false;
    }
    await meeting.save();

    // VDS disk alanını korumak için yalnızca son 5 toplantının birleştirilmiş ikili arşivini tut
    void pruneOldMeetingArchives(5);

    return NextResponse.json({
      success: true,
      combinedPptxSize: compressedBuf.length,
      rawPptxSize: rawBuf.length,
      combinedPptxUpdatedAt: now,
    });
  } catch (error: any) {
    console.error("PUT /api/presentations/meetings/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Sıkıştırılmış sunum arşivi kaydedilemedi." },
      { status: 500 }
    );
  }
}
