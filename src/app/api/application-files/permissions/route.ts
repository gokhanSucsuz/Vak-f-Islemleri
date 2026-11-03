import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Log from "@/models/Log";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Bu işlemi sadece Süper Admin görüntüleyebilir." },
        { status: 403 }
      );
    }

    await dbConnect();
    const users = await User.find({ role: { $in: ["personnel", "manager"] } })
      .select("name email role canManageApplications")
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("GET /api/application-files/permissions error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Bu işlemi sadece Süper Admin yapabilir." },
        { status: 403 }
      );
    }

    await dbConnect();
    const body = await req.json();
    const { userId, canManageApplications } = body;

    if (!userId || typeof canManageApplications !== "boolean") {
      return NextResponse.json({ error: "Geçersiz istek parametreleri." }, { status: 400 });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    targetUser.canManageApplications = canManageApplications;
    await targetUser.save();

    try {
      await Log.create({
        userId: session.user.id,
        action: "Dosya Yönetim Yetkisi Değiştirildi",
        details: `${targetUser.name} (${targetUser.email}) için Başvuru/Excel yetkisi: ${
          canManageApplications ? "VERİLDİ" : "KALDIRILDI"
        }`,
      });
    } catch (err) {
      console.error("Log error:", err);
    }

    return NextResponse.json({
      success: true,
      message: `Yetki başarıyla güncellendi: ${targetUser.name}`,
      user: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        canManageApplications: targetUser.canManageApplications,
      },
    });
  } catch (error: any) {
    console.error("POST /api/application-files/permissions error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

