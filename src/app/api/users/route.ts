import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import SystemSetting from "@/models/SystemSetting";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const { getEffectivePermissions } = await import("@/lib/permissions");
    const perms = session ? await getEffectivePermissions(session) : null;
    const hasRole = Boolean(perms?.canManageSystem);
    const isGoogleVerified = (session as any)?.googleVerified === true;
    
    await dbConnect();
    
    const setting = await SystemSetting.findOne({ key: "googleLoginEnabled" }).lean();
    const isGoogleLoginEnabled = (setting as any)?.value ?? false;
    
    if (!session && isGoogleLoginEnabled) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    
    if (session && !hasRole && !isGoogleVerified) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    const users = await User.find({ role: { $in: ["personnel", "manager"] } })
      .select("-password")
      .lean();

    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
     console.log("GİZLİ VERİTABANI HATASI:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Sadece Süper Admin kullanıcı oluşturabilir" }, { status: 401 });
    }

    const { name, email, password, role } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
    }

    await dbConnect();
    
    const existing = await User.findOne({ email });
    if (existing) {
      return NextResponse.json({ error: "Bu e-posta adresi zaten kullanımda" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: role || "personnel"
    });

    await newUser.save();

    return NextResponse.json({ message: "Kullanıcı oluşturuldu" }, { status: 201 });
  } catch (error) {
    console.log("GİZLİ VERİTABANI HATASI:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
