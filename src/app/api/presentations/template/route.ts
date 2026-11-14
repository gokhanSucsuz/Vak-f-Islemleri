import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import zlib from "zlib";
import { promisify } from "util";
import PresentationTemplate from "@/models/PresentationTemplate";
import Log from "@/models/Log";
import { extractPptxTemplateInfo } from "@/lib/presentationUtils";

const gzip = promisify(zlib.gzip);

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();
    const tpl = await PresentationTemplate.findOne({ key: "default" }).populate(
      "uploadedBy",
      "name"
    );

    if (!tpl) {
      return NextResponse.json({ template: null });
    }

    return NextResponse.json({
      template: {
        _id: tpl._id,
        fileName: tpl.fileName,
        fileSize: tpl.fileSize,
        backgroundImageBase64: tpl.backgroundImageBase64 || "",
        slideWidthIn: tpl.slideWidthIn || 10,
        slideHeightIn: tpl.slideHeightIn || 7.5,
        uploadedBy: tpl.uploadedBy,
        updatedAt: tpl.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("GET /api/presentations/template error:", error);
    return NextResponse.json(
      { error: error.message || "Sunu şablonu alınamadı" },
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
        { error: "Şablon yükleme yetkisi sadece yöneticilere aittir." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
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
    let pptxCompressed: Buffer | undefined;

    if (isPptx) {
      const info = await extractPptxTemplateInfo(buffer);
      backgroundImageBase64 = info.backgroundImageBase64;
      slideWidthIn = info.slideWidthIn;
      slideHeightIn = info.slideHeightIn;
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

    await dbConnect();

    const tpl = await PresentationTemplate.findOneAndUpdate(
      { key: "default" },
      {
        key: "default",
        fileName: file.name,
        fileSize: file.size,
        backgroundImageBase64,
        slideWidthIn,
        slideHeightIn,
        ...(pptxCompressed ? { pptxCompressed } : {}),
        uploadedBy: userId,
      },
      { upsert: true, new: true }
    );

    await Log.create({
      userId,
      action: "SUNU_SABLON_YUKLENDI",
      details: `Sunu şablonu güncellendi: ${file.name}`,
    });

    return NextResponse.json({
      success: true,
      template: {
        _id: tpl._id,
        fileName: tpl.fileName,
        fileSize: tpl.fileSize,
        backgroundImageBase64: tpl.backgroundImageBase64 || "",
        slideWidthIn: tpl.slideWidthIn,
        slideHeightIn: tpl.slideHeightIn,
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
