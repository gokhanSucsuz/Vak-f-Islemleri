import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import zlib from "zlib";
import { promisify } from "util";
import PresentationTemplate, {
  ITemplateLayoutConfig,
} from "@/models/PresentationTemplate";
import Log from "@/models/Log";
import {
  extractPptxTemplateInfo,
  extractCoverPptxInfo,
} from "@/lib/presentationUtils";
import {
  getCachedPresentationTemplates,
  setCachedPresentationTemplates,
  invalidatePresentationTemplatesCache,
} from "@/lib/referenceCache";
import { respondShieldedJson } from "@/lib/payloadShield";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const DEFAULT_LAYOUT: ITemplateLayoutConfig = {
  mode: "classic",
  titleBox: { xPct: 47.5, yPct: 15.3, wPct: 46.2, hPct: 12.2 },
  descBox: { xPct: 3.2, yPct: 46, wPct: 93.6, hPct: 50.5 },
  photoSlots: [{ xPct: 3.2, yPct: 2.4, wPct: 41, hPct: 41.6 }],
};

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    const userId = String((session.user as any)?.id || "");
    const isWarmOnly = new URL(req.url).searchParams.get("warm") === "1";

    const cached = getCachedPresentationTemplates();
    if (cached) {
      if (isWarmOnly) {
        return NextResponse.json({ ok: true });
      }
      const slideTemplates = cached.filter((t: any) => t.templateKind !== "cover");
      const coverTemplates = cached.filter((t: any) => t.templateKind === "cover");
      const activeCoverTemplate =
        coverTemplates.find((t: any) => t.isActiveCover) || null;
      return respondShieldedJson(req, userId, {
        templates: slideTemplates,
        template: slideTemplates[0] || null,
        coverTemplates,
        activeCoverTemplate,
      });
    }

    await dbConnect();
    const lightDocs = await PresentationTemplate.find({})
      .select("-pptxCompressed")
      .populate("uploadedBy", "name")
      .sort({ createdAt: 1 })
      .lean();

    const allMapped = (
      await Promise.all(
        lightDocs.map(async (tpl: any) => {
          const kind: "slide" | "cover" =
            tpl.templateKind === "cover" ? "cover" : "slide";
          let layoutConfig = tpl.layoutConfig;
          if (kind === "slide" && (!layoutConfig || layoutConfig.version !== 3)) {
            const fullDoc = await PresentationTemplate.findById(tpl._id);
            if (fullDoc?.pptxCompressed) {
              try {
                const rawBuf = await gunzip(fullDoc.pptxCompressed);
                const info = await extractPptxTemplateInfo(rawBuf);
                layoutConfig = info.layoutConfig;
                fullDoc.layoutConfig = info.layoutConfig;
                fullDoc.markModified("layoutConfig");
                await fullDoc.save();
              } catch {
                // fallback
              }
            }
          }
          return {
            _id: String(tpl._id),
            name: tpl.name || tpl.fileName,
            fileName: tpl.fileName,
            fileSize: tpl.fileSize,
            templateKind: kind,
            isActiveCover: Boolean(tpl.isActiveCover),
            backgroundImageBase64: tpl.backgroundImageBase64 || "",
            slideWidthIn: tpl.slideWidthIn || 10,
            slideHeightIn: tpl.slideHeightIn || 7.5,
            layoutConfig: layoutConfig || DEFAULT_LAYOUT,
            coverSpec: tpl.coverSpec || { images: [], texts: [] },
            uploadedBy: tpl.uploadedBy,
            updatedAt: tpl.updatedAt,
          };
        })
      )
    ).sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "tr", {
        numeric: true,
        sensitivity: "base",
      })
    );

    setCachedPresentationTemplates(allMapped);

    if (isWarmOnly) {
      return NextResponse.json({ ok: true });
    }

    const slideTemplates = allMapped.filter((t) => t.templateKind !== "cover");
    const coverTemplates = allMapped.filter((t) => t.templateKind === "cover");
    const activeCoverTemplate =
      coverTemplates.find((t) => t.isActiveCover) || null;

    return respondShieldedJson(req, userId, {
      templates: slideTemplates,
      template: slideTemplates[0] || null,
      coverTemplates,
      activeCoverTemplate,
    });
  } catch (error: any) {
    console.error("GET /api/presentations/template error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu şablonları alınamadı" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);

    if (!session?.user || !perms.isManager) {
      return NextResponse.json(
        { error: "Şablon yükleme ve düzenleme yetkisi yalnızca Süper Admin ve Müdür'e aittir." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const rawName = (formData.get("name") as string) || "";
    const templateKind: "slide" | "cover" =
      formData.get("kind") === "cover" ? "cover" : "slide";
    const customName =
      templateKind === "cover"
        ? rawName
            .replace(/\r\n/g, "\n")
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .join("\n")
            .slice(0, 360)
        : rawName.trim();

    if (!file) {
      return NextResponse.json({ error: "Dosya seçilmedi." }, { status: 400 });
    }

    const lower = file.name.toLowerCase();
    const isPptx = lower.endsWith(".pptx");
    const isImage = /\.(png|jpe?g|webp)$/i.test(lower);

    if (!isPptx && !isImage) {
      return NextResponse.json(
        { error: "Lütfen .pptx PowerPoint şablonu veya arka plan görseli (.png/.jpg) yükleyin." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let backgroundImageBase64 = "";
    let slideWidthIn = 10;
    let slideHeightIn = 7.5;
    let layoutConfig: ITemplateLayoutConfig = DEFAULT_LAYOUT;
    let coverSpec: { images: any[]; texts: any[] } = { images: [], texts: [] };
    let extractedCoverTitle = "";
    let pptxCompressed: Buffer | undefined;

    if (isPptx) {
      if (templateKind === "cover") {
        const coverInfo = await extractCoverPptxInfo(buffer);
        backgroundImageBase64 = coverInfo.backgroundImageBase64;
        slideWidthIn = coverInfo.slideWidthIn;
        slideHeightIn = coverInfo.slideHeightIn;
        coverSpec = coverInfo.coverSpec;
        extractedCoverTitle = coverInfo.extractedTitle || "";
      } else {
        const info = await extractPptxTemplateInfo(buffer);
        backgroundImageBase64 = info.backgroundImageBase64;
        slideWidthIn = info.slideWidthIn;
        slideHeightIn = info.slideHeightIn;
        layoutConfig = info.layoutConfig;
      }
      pptxCompressed = await gzip(buffer, { level: 9 });
    } else {
      const ext = lower.split(".").pop() || "png";
      const mime =
        ext === "jpg" || ext === "jpeg"
          ? "image/jpeg"
          : ext === "webp"
            ? "image/webp"
            : "image/png";
      backgroundImageBase64 = `data:${mime};base64,${buffer.toString("base64")}`;
    }

    const templateName =
      customName ||
      extractedCoverTitle ||
      file.name.replace(/\.(pptx|png|jpe?g|webp)$/i, "");

    await dbConnect();

    // Eski tekli şablon döneminden kalan key_1 unique indeksini otomatik temizle
    await PresentationTemplate.collection.dropIndex("key_1").catch(() => { });

    if (templateKind === "cover") {
      await PresentationTemplate.updateMany(
        { templateKind: "cover" },
        { $set: { isActiveCover: false } }
      );
    }

    const tpl = await PresentationTemplate.create({
      name: templateName,
      fileName: file.name,
      fileSize: file.size,
      templateKind,
      isActiveCover: templateKind === "cover",
      backgroundImageBase64,
      slideWidthIn,
      slideHeightIn,
      layoutConfig,
      coverSpec,
      ...(pptxCompressed ? { pptxCompressed } : {}),
      uploadedBy: userId,
    });
    invalidatePresentationTemplatesCache();

    void Log.create({
      userId,
      action: templateKind === "cover" ? "KAPAK_SABLONU_YUKLENDI" : "SUNU_SABLON_YUKLENDI",
      details: `${templateKind === "cover" ? "Kapak şablonu" : "Sunu şablonu"} eklendi: ${templateName} (${file.name})`,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      template: {
        _id: String(tpl._id),
        name: tpl.name,
        fileName: tpl.fileName,
        fileSize: tpl.fileSize,
        templateKind: tpl.templateKind,
        isActiveCover: Boolean(tpl.isActiveCover),
        backgroundImageBase64: tpl.backgroundImageBase64 || "",
        slideWidthIn: tpl.slideWidthIn,
        slideHeightIn: tpl.slideHeightIn,
        layoutConfig: tpl.layoutConfig || DEFAULT_LAYOUT,
        coverSpec: tpl.coverSpec || { images: [], texts: [] },
        updatedAt: tpl.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("POST /api/presentations/template error:", error);
    return NextResponse.json(
      { error: error.message || "Şablon yüklenirken hata oluştu." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);

    if (!session?.user || !perms.isManager) {
      return NextResponse.json(
        { error: "Kapak şablonu yönetimi yalnızca Süper Admin ve Müdür'e aittir." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { activeCoverId, renameCoverId, newName } = body as {
      activeCoverId?: string | null;
      renameCoverId?: string;
      newName?: string;
    };

    await dbConnect();

    if (renameCoverId) {
      const cleanedName = String(newName || "")
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n")
        .slice(0, 360);

      if (!cleanedName) {
        return NextResponse.json(
          { error: "Kapak adı boş bırakılamaz." },
          { status: 400 }
        );
      }

      const updated = await PresentationTemplate.findOneAndUpdate(
        { _id: renameCoverId, templateKind: "cover" },
        { $set: { name: cleanedName } },
        { new: true }
      );
      if (!updated) {
        return NextResponse.json(
          { error: "Kapak şablonu bulunamadı." },
          { status: 404 }
        );
      }

      invalidatePresentationTemplatesCache();

      void Log.create({
        userId,
        action: "KAPAK_SABLONU_ADI_GUNCELLENDI",
        details: `Kapak şablonu üst başlık yazısı güncellendi: ${cleanedName.replace(/\n/g, " / ")}`,
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        renamedId: renameCoverId,
        name: cleanedName,
      });
    }

    await PresentationTemplate.updateMany(
      { templateKind: "cover" },
      { $set: { isActiveCover: false } }
    );

    if (activeCoverId) {
      await PresentationTemplate.findOneAndUpdate(
        { _id: activeCoverId, templateKind: "cover" },
        { $set: { isActiveCover: true } }
      );
    }

    invalidatePresentationTemplatesCache();

    void Log.create({
      userId,
      action: "KAPAK_SABLONU_SECILDI",
      details: activeCoverId
        ? `Aktif sunum kapak şablonu güncellendi (${activeCoverId})`
        : "Aktif sunum kapak şablonu devre dışı bırakıldı",
    }).catch(() => {});

    return NextResponse.json({ success: true, activeCoverId: activeCoverId || null });
  } catch (error: any) {
    console.error("PATCH /api/presentations/template error:", error);
    return NextResponse.json(
      { error: error.message || "Kapak şablonu güncellenemedi." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as any)?.id;
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);

    if (!session?.user || !perms.isManager) {
      return NextResponse.json(
        { error: "Şablon silme yetkisi yalnızca Süper Admin ve Müdür'e aittir." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Şablon ID zorunludur." }, { status: 400 });
    }

    await dbConnect();
    const deleted = await PresentationTemplate.findByIdAndDelete(id);
    if (!deleted) {
      return NextResponse.json({ error: "Şablon bulunamadı." }, { status: 404 });
    }
    invalidatePresentationTemplatesCache();

    void Log.create({
      userId,
      action: "SUNU_SABLON_SILINDI",
      details: `Sunu şablonu silindi: ${deleted.name || deleted.fileName}`,
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/presentations/template error:", error);
    return NextResponse.json(
      { error: error.message || "Şablon silinemedi." },
      { status: 500 }
    );
  }
}
