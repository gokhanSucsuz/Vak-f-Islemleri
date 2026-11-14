import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Petition from "@/models/Petition";
import Log from "@/models/Log";
import { gunzipSync, gzipSync } from "zlib";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const doc: any = await Petition.findById(id)
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .lean();

    if (!doc) {
      return NextResponse.json({ error: "Dilekçe bulunamadı" }, { status: 404 });
    }

    let htmlContent = "";
    if (doc.contentCompressed) {
      const buf = Buffer.isBuffer(doc.contentCompressed)
        ? doc.contentCompressed
        : Buffer.from(doc.contentCompressed.buffer || doc.contentCompressed);
      htmlContent = gunzipSync(buf).toString("utf8");
    }

    const { contentCompressed: _omit, ...rest } = doc;
    return NextResponse.json({
      petition: {
        ...rest,
        htmlContent,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Dilekçe içeriği okunamadı" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const citizenName = String(body.citizenName || "").trim();
    const tcNo = String(body.tcNo || "").trim();
    const subject = String(body.subject || "").trim();
    const petitionType = body.petitionType === "matbu" ? "matbu" : "detayli";
    const htmlContent = String(body.htmlContent || "").trim();

    if (!citizenName || !tcNo || !htmlContent) {
      return NextResponse.json(
        { error: "Ad Soyad, T.C. Kimlik No ve içerik zorunludur." },
        { status: 400 }
      );
    }

    await dbConnect();

    const rawBuffer = Buffer.from(htmlContent, "utf8");
    const contentCompressed = gzipSync(rawBuffer);

    const updated = await Petition.findByIdAndUpdate(
      id,
      {
        petitionType,
        citizenName,
        tcNo,
        subject,
        contentCompressed,
        originalSize: rawBuffer.length,
        updatedBy: (session.user as any).id,
      },
      { new: true }
    )
      .select("-contentCompressed")
      .populate("createdBy", "name email")
      .populate("updatedBy", "name email")
      .lean();

    if (!updated) {
      return NextResponse.json({ error: "Dilekçe bulunamadı" }, { status: 404 });
    }

    await Log.create({
      userId: (session.user as any).id,
      action: "DİLEKÇE GÜNCELLENDİ",
      details: `${citizenName} (${tcNo}) dilekçesi güncellendi.`,
    });

    return NextResponse.json({ petition: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Dilekçe güncellenemedi" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { id } = await params;
    await dbConnect();

    const existing: any = await Petition.findById(id).select("createdBy citizenName tcNo");
    if (!existing) {
      return NextResponse.json({ error: "Dilekçe bulunamadı" }, { status: 404 });
    }

    const role = (session.user as any).role;
    const userId = (session.user as any).id;
    const isOwner = String(existing.createdBy) === String(userId);

    if (role !== "superadmin" && role !== "manager" && !isOwner) {
      return NextResponse.json(
        { error: "Bu dilekçeyi silme yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    await Petition.findByIdAndDelete(id);

    await Log.create({
      userId: userId,
      action: "DİLEKÇE SİLİNDİ",
      details: `${existing.citizenName} (${existing.tcNo}) dilekçesi silindi.`,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Dilekçe silinemedi" },
      { status: 500 }
    );
  }
}
