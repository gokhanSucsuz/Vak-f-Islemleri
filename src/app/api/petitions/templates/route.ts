import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import PetitionTemplate from "@/models/PetitionTemplate";
import Log from "@/models/Log";
import mammoth from "mammoth";
import { gzipSync } from "zlib";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();
    const templates = await PetitionTemplate.find({})
      .select("-docxCompressed")
      .populate("uploadedBy", "name email")
      .lean();

    return NextResponse.json({ templates });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Şablonlar alınamadı" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const role = (session.user as any).role;
    if (role !== "superadmin" && role !== "manager") {
      return NextResponse.json(
        { error: "Şablon yükleme yetkisi sadece Müdür ve Süper Admin içindir." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const type = String(formData.get("type") || "").trim();
    const file = formData.get("file") as File | null;

    if (type !== "detayli" && type !== "matbu") {
      return NextResponse.json(
        { error: "Geçersiz şablon türü (detayli veya matbu olmalı)." },
        { status: 400 }
      );
    }

    if (!file) {
      return NextResponse.json({ error: "Word (.docx) dosyası seçilmedi." }, { status: 400 });
    }

    const fileName = file.name || "sablon.docx";
    if (!fileName.toLowerCase().endsWith(".docx")) {
      return NextResponse.json(
        { error: "Lütfen yalnızca .docx uzantılı Word dosyası yükleyin." },
        { status: 400 }
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Şablon dosyası en fazla 5 MB olabilir." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Word (.docx) -> düzenlenebilir temiz HTML dönüşümü
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Heading 1'] => h2:fresh",
          "p[style-name='Heading 2'] => h3:fresh",
        ],
      }
    );

    const htmlContent = (result.value || "").trim() || "<p></p>";
    const docxCompressed = gzipSync(buffer);

    await dbConnect();

    const template = await PetitionTemplate.findOneAndUpdate(
      { type },
      {
        type,
        fileName,
        fileSize: file.size,
        htmlContent,
        docxCompressed,
        uploadedBy: (session.user as any).id,
      },
      { upsert: true, new: true }
    )
      .select("-docxCompressed")
      .populate("uploadedBy", "name email");

    await Log.create({
      user: (session.user as any).id,
      action: "DİLEKÇE ŞABLONU YÜKLENDİ",
      details: `${type === "detayli" ? "Detaylı" : "Matbu"} dilekçe şablonu güncellendi: ${fileName}`,
    });

    return NextResponse.json({ template });
  } catch (error: any) {
    console.error("Template upload error:", error);
    return NextResponse.json(
      { error: error.message || "Şablon yüklenirken hata oluştu." },
      { status: 500 }
    );
  }
}
