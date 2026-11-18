import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import PetitionTemplate from "@/models/PetitionTemplate";
import Petition from "@/models/Petition";
import Log from "@/models/Log";
import { convertDocxBufferToStyledHtml } from "@/lib/docxToHtml";
import { gzipSync, gunzipSync } from "zlib";

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

    if ((session.user as any).role !== "superadmin") {
      return NextResponse.json(
        { error: "Şablon yükleme ve düzenleme yetkisi yalnızca süper admin'e aittir." },
        { status: 403 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      if (body?.action === "setFromPetition" && body?.petitionId) {
        await dbConnect();
        const petition = await Petition.findById(body.petitionId);
        if (!petition) {
          return NextResponse.json({ error: "Dilekçe bulunamadı." }, { status: 404 });
        }
        const targetType =
          body.type === "detayli" || body.type === "matbu" ? body.type : petition.petitionType;
        let htmlContent = "<p></p>";
        if (petition.contentCompressed) {
          try {
            htmlContent = gunzipSync(petition.contentCompressed).toString("utf8");
          } catch {
            htmlContent = petition.contentCompressed.toString("utf8");
          }
        }
        const safeName = (petition.citizenName || "dilekce").trim().replace(/\s+/g, "_");
        const fileName = `${safeName}_varsayilan.html`;
        const template = await PetitionTemplate.findOneAndUpdate(
          { type: targetType },
          {
            type: targetType,
            fileName,
            fileSize: Buffer.byteLength(htmlContent, "utf8"),
            htmlContent,
            $unset: { docxCompressed: 1 },
            uploadedBy: (session.user as any).id,
          },
          { upsert: true, new: true }
        )
          .select("-docxCompressed")
          .populate("uploadedBy", "name email");

        await Log.create({
          userId: (session.user as any).id,
          action: "DİLEKÇE VARSAYILAN ŞABLON YAPILDI",
          details: `${targetType === "detayli" ? "Detaylı" : "Matbu"} varsayılan şablon güncellendi: ${petition.citizenName}`,
        });

        return NextResponse.json({ template });
      }
      return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });
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

    // Word (.docx) -> birebir hizalama, tablo, satır yüksekliği ve biçimlendirmeyi koruyan HTML
    const htmlContent = await convertDocxBufferToStyledHtml(buffer);
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
      userId: (session.user as any).id,
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
