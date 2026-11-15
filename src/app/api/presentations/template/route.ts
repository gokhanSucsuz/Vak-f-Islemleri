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
import { extractPptxTemplateInfo } from "@/lib/presentationUtils";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const DEFAULT_LAYOUT: ITemplateLayoutConfig = {
  mode: "classic",
  titleBox: { xPct: 47.5, yPct: 15.3, wPct: 46.2, hPct: 12.2 },
  descBox: { xPct: 3.2, yPct: 46, wPct: 93.6, hPct: 50.5 },
  photoSlots: [{ xPct: 3.2, yPct: 2.4, wPct: 41, hPct: 41.6 }],
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();
    const docs = await PresentationTemplate.find({})
      .populate("uploadedBy", "name")
      .sort({ createdAt: 1 });

    const templates = (
      await Promise.all(
        docs.map(async (tpl) => {
          if ((!tpl.layoutConfig || tpl.layoutConfig.version !== 3) && tpl.pptxCompressed) {
            try {
              const rawBuf = await gunzip(tpl.pptxCompressed);
              const info = await extractPptxTemplateInfo(rawBuf);
              tpl.layoutConfig = info.layoutConfig;
              tpl.markModified("layoutConfig");
              await tpl.save();
            } catch {
              // fallback
            }
          }
          return {
            _id: String(tpl._id),
            name: tpl.name || tpl.fileName,
            fileName: tpl.fileName,
            fileSize: tpl.fileSize,
            backgroundImageBase64: tpl.backgroundImageBase64 || "",
            slideWidthIn: tpl.slideWidthIn || 10,
            slideHeightIn: tpl.slideHeightIn || 7.5,
            layoutConfig: tpl.layoutConfig || DEFAULT_LAYOUT,
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

    return NextResponse.json({
      templates,
      template: templates[0] || null,
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
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);
    const userId = perms.userId;

    if (!session?.user || !perms.canManagePresentations) {
      return NextResponse.json(
        { error: "Şablon yükleme yetkisi sadece yöneticilere ve yetkili personele aittir." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const customName = ((formData.get("name") as string) || "").trim();

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
    let pptxCompressed: Buffer | undefined;

    if (isPptx) {
      const info = await extractPptxTemplateInfo(buffer);
      backgroundImageBase64 = info.backgroundImageBase64;
      slideWidthIn = info.slideWidthIn;
      slideHeightIn = info.slideHeightIn;
      layoutConfig = info.layoutConfig;
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
      customName || file.name.replace(/\.(pptx|png|jpe?g|webp)$/i, "");

    await dbConnect();

    // Eski tekli şablon döneminden kalan key_1 unique indeksini otomatik temizle
    await PresentationTemplate.collection.dropIndex("key_1").catch(() => {});

    const tpl = await PresentationTemplate.create({
      name: templateName,
      fileName: file.name,
      fileSize: file.size,
      backgroundImageBase64,
      slideWidthIn,
      slideHeightIn,
      layoutConfig,
      ...(pptxCompressed ? { pptxCompressed } : {}),
      uploadedBy: userId,
    });

    await Log.create({
      userId,
      action: "SUNU_SABLON_YUKLENDI",
      details: `Sunu şablonu eklendi: ${templateName} (${file.name})`,
    });

    return NextResponse.json({
      success: true,
      template: {
        _id: String(tpl._id),
        name: tpl.name,
        fileName: tpl.fileName,
        fileSize: tpl.fileSize,
        backgroundImageBase64: tpl.backgroundImageBase64 || "",
        slideWidthIn: tpl.slideWidthIn,
        slideHeightIn: tpl.slideHeightIn,
        layoutConfig: tpl.layoutConfig || DEFAULT_LAYOUT,
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

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = await getEffectivePermissions(session);
    const userId = perms.userId;

    if (!session?.user || !perms.canManagePresentations) {
      return NextResponse.json(
        { error: "Şablon silme yetkisi sadece yöneticilere ve yetkili personele aittir." },
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

    await Log.create({
      userId,
      action: "SUNU_SABLON_SILINDI",
      details: `Sunu şablonu silindi: ${deleted.name || deleted.fileName}`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("DELETE /api/presentations/template error:", error);
    return NextResponse.json(
      { error: error.message || "Şablon silinemedi." },
      { status: 500 }
    );
  }
}
