import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions, invalidateUserSessionCache } from "@/lib/authOptions";
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
    const isSuperAdmin = session?.user?.role === "superadmin";
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

    // Aktif şifre alanı (passwordVisible) yalnızca Süper Admin oturumlarına döner
    const projection = isSuperAdmin ? "-password" : "-password -passwordVisible";
    const users = await User.find({ role: { $in: ["personnel", "manager"] } })
      .select(projection)
      .sort({ name: 1 })
      .lean();

    return NextResponse.json({ users }, { status: 200 });
  } catch (error) {
    console.error("GET /api/users error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Sadece Süper Admin kullanıcı oluşturabilir" },
        { status: 403 }
      );
    }

    const { name, email, password, role } = await req.json();

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Eksik bilgi" }, { status: 400 });
    }

    if (String(password).trim().length < 6) {
      return NextResponse.json(
        { error: "Şifre en az 6 karakter uzunluğunda olmalıdır." },
        { status: 400 }
      );
    }

    await dbConnect();

    const existing = await User.findOne({ email: String(email).trim() }).lean();
    if (existing) {
      return NextResponse.json(
        { error: "Bu e-posta adresi zaten kullanımda" },
        { status: 400 }
      );
    }

    const cleanPassword = String(password).trim();
    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const newUser = new User({
      name: String(name).trim(),
      email: String(email).trim(),
      password: hashedPassword,
      passwordVisible: cleanPassword,
      role: role === "manager" ? "manager" : "personnel",
    });

    await newUser.save();

    void import("@/models/Log")
      .then(({ default: Log }) =>
        Log.create({
          userId: session.user.id,
          action: "Personel Eklendi",
          details: `${newUser.name} (${newUser.email}) sisteme eklendi.`,
        })
      )
      .catch(() => {});

    return NextResponse.json({ message: "Kullanıcı oluşturuldu" }, { status: 201 });
  } catch (error) {
    console.error("POST /api/users error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== "superadmin") {
      return NextResponse.json(
        { error: "Bu işlemi yalnızca Süper Admin yapabilir." },
        { status: 403 }
      );
    }

    const { userId, newPassword, role, name } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: "Kullanıcı ID zorunludur." }, { status: 400 });
    }

    await dbConnect();
    const targetUser = await User.findById(userId);
    if (!targetUser || targetUser.role === "superadmin") {
      return NextResponse.json({ error: "Personel bulunamadı." }, { status: 404 });
    }

    if (typeof newPassword === "string" && newPassword.trim().length > 0) {
      const cleanPwd = newPassword.trim();
      if (cleanPwd.length < 6) {
        return NextResponse.json(
          { error: "Yeni şifre en az 6 karakter uzunluğunda olmalıdır." },
          { status: 400 }
        );
      }
      targetUser.password = await bcrypt.hash(cleanPwd, 10);
      targetUser.passwordVisible = cleanPwd;
    }

    if (role === "manager" || role === "personnel") {
      targetUser.role = role;
    }

    if (typeof name === "string" && name.trim().length > 0) {
      targetUser.name = name.trim();
    }

    await targetUser.save();
    invalidateUserSessionCache(String(targetUser._id));

    void import("@/models/Log")
      .then(({ default: Log }) =>
        Log.create({
          userId: session.user.id,
          action: "Personel Bilgisi/Şifresi Güncellendi",
          details: `${targetUser.name} (${targetUser.email}) bilgileri Süper Admin tarafından güncellendi.`,
        })
      )
      .catch(() => {});

    return NextResponse.json({
      message: "Personel güncellendi",
      user: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role,
        passwordVisible: targetUser.passwordVisible,
      },
    });
  } catch (error) {
    console.error("PATCH /api/users error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
