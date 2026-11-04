import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";
import User from "@/models/User";
import Log from "@/models/Log";

async function checkManagePermission(session: any): Promise<boolean> {
  if (!session?.user) return false;
  if (session.user.role === "superadmin") return true;
  await dbConnect();
  const dbUser = await User.findById(session.user.id).select("canManageApplications role");
  return Boolean(dbUser?.role === "superadmin" || dbUser?.canManageApplications);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const canManage = await checkManagePermission(session);
    if (!canManage) {
      return NextResponse.json(
        { error: "Kayıt düzenleme yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    const { id } = await params;
    await dbConnect();
    const body = await req.json();

    const record = await ApplicationFile.findById(id);
    if (!record) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }

    const trimmedAppNo = (body.applicationNo || record.applicationNo).toString().trim();
    if (trimmedAppNo !== record.applicationNo) {
      const duplicate = await ApplicationFile.findOne({
        applicationNo: trimmedAppNo,
        _id: { $ne: id },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: `Başvuru No (${trimmedAppNo}) zaten başka bir kayıtta kullanılıyor.` },
          { status: 409 }
        );
      }
      record.applicationNo = trimmedAppNo;
      const num = parseInt(trimmedAppNo.replace(/\D/g, ""), 10);
      record.applicationNoSeq = !isNaN(num) ? num : 0;
    }

    record.applicantName = (body.applicantName ?? record.applicantName).trim();
    record.spouseName = (body.spouseName ?? record.spouseName).trim();
    record.tcNo = (body.tcNo ?? record.tcNo).trim();
    record.spouseTcNo = (body.spouseTcNo ?? record.spouseTcNo).trim();
    record.helpType = (body.helpType ?? record.helpType).trim();
    record.neighborhood = (body.neighborhood ?? record.neighborhood).trim();
    record.phone = (body.phone ?? record.phone).trim();
    record.address = (body.address ?? record.address).trim();
    record.notes = (body.notes ?? record.notes).trim();
    if (body.applicationDate !== undefined) {
      record.applicationDate = body.applicationDate ? new Date(body.applicationDate) : null;
    }
    if (body.fileStatus) record.fileStatus = body.fileStatus;
    if (body.extraData) record.extraData = { ...record.extraData, ...body.extraData };
    record.updatedBy = session.user.id;

    await record.save();

    try {
      await Log.create({
        userId: session.user.id,
        action: "Dosya Kaydı Güncellendi",
        details: `Başvuru No: ${record.applicationNo}, Kişi: ${record.applicantName || "Boş"}`,
      });
    } catch (err) {
      console.error("Log error:", err);
    }

    return NextResponse.json({ message: "Kayıt güncellendi.", record });
  } catch (error: any) {
    console.error("PUT /api/application-files/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Sunucu hatası" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const canManage = await checkManagePermission(session);
    if (!canManage) {
      return NextResponse.json(
        { error: "Kayıt silme yetkiniz bulunmamaktadır." },
        { status: 403 }
      );
    }

    const { id } = await params;
    await dbConnect();

    const record = await ApplicationFile.findByIdAndDelete(id);
    if (!record) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }

    try {
      await Log.create({
        userId: session.user.id,
        action: "Dosya Kaydı Silindi",
        details: `Başvuru No: ${record.applicationNo}, Kişi: ${record.applicantName || "Boş"}`,
      });
    } catch (err) {
      console.error("Log error:", err);
    }

    return NextResponse.json({ message: "Kayıt başarıyla silindi." });
  } catch (error: any) {
    console.error("DELETE /api/application-files/[id] error:", error);
    return NextResponse.json(
      { error: error.message || "Sunucu hatası" },
      { status: 500 }
    );
  }
}
