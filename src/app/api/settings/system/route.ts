import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import SystemSetting from "@/models/SystemSetting";

export async function GET() {
  try {
    await dbConnect();
    const setting = await SystemSetting.findOne({ key: "googleLoginEnabled" });
    // Varsayılan olarak kapalı olması istendiği için false dönüyoruz
    return NextResponse.json({ googleLoginEnabled: setting?.value ?? false });
  } catch (error) {
    return NextResponse.json({ error: "Ayarlar alınamadı" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as any).role !== "superadmin") {
      return NextResponse.json({ error: "Yetkisiz işlem" }, { status: 401 });
    }

    const { googleLoginEnabled } = await req.json();

    await dbConnect();
    await SystemSetting.findOneAndUpdate(
      { key: "googleLoginEnabled" },
      { value: googleLoginEnabled },
      { upsert: true, new: true }
    );

    try {
      const Log = (await import("@/models/Log")).default;
      await Log.create({
        userId: (session.user as any).id,
        action: "Sistem Ayarı Değiştirildi",
        details: `Google Girişi ${googleLoginEnabled ? 'Aktif' : 'Pasif'} yapıldı.`
      });
    } catch (err) {
      console.error("Log error:", err);
    }

    return NextResponse.json({ success: true, googleLoginEnabled });
  } catch (error) {
    return NextResponse.json({ error: "Ayarlar güncellenemedi" }, { status: 500 });
  }
}
