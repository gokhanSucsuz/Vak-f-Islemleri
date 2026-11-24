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

    const [meeting, presentations] = await Promise.all([
      PresentationMeeting.findById(id)
        .populate("openedBy", "name")
        .populate("closedBy", "name")
        .populate("authorizedUserId", "name email")
        .lean() as Promise<any>,
      Presentation.find({ meetingId: id })
        .populate("createdBy", "name")
        .sort({ createdAt: 1 })
        .lean() as Promise<any[]>,
    ]);

    if (!meeting) {
      return NextResponse.json({ error: "Toplantı bulunamadı." }, { status: 404 });
    }

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
        isLocked: Boolean(meeting.isLocked),
        authorizedUserId: meeting.authorizedUserId || null,
        backgroundPreset: meeting.backgroundPreset || "template",
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

    if (!session?.user || !userId) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const { action, presentationOrder, authorizedUserId, backgroundPreset } = body;

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
