import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import Log from "@/models/Log";
import {
  ALL_PERMISSION_MODULE_KEYS,
  PERMISSION_MODULES,
  resolveUserAuthorizedModules,
} from "@/lib/permissions";

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
    const rawUsers = await User.find({ role: { $in: ["personnel", "manager"] } })
      .select("name email role canManageApplications authorizedModules")
      .sort({ name: 1 })
      .lean();

    const users = rawUsers.map((u: any) => {
      const authorizedModules = resolveUserAuthorizedModules(u);
      return {
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        canManageApplications: authorizedModules.length > 0,
        authorizedModules,
      };
    });

    return NextResponse.json({ users });
  } catch (error: any) {
    console.error("GET /api/settings/permissions error:", error);
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
    const { userId, authorizedModules, canManageApplications } = body;

    if (!userId) {
      return NextResponse.json({ error: "Kullanıcı ID zorunludur." }, { status: 400 });
    }

    let cleanModules: string[] = [];
    if (Array.isArray(authorizedModules)) {
      cleanModules = Array.from(
        new Set(
          authorizedModules.filter((k) =>
            (ALL_PERMISSION_MODULE_KEYS as readonly string[]).includes(String(k))
          )
        )
      );
    } else if (typeof canManageApplications === "boolean") {
      cleanModules = canManageApplications ? [...ALL_PERMISSION_MODULE_KEYS] : [];
    } else {
      return NextResponse.json({ error: "Geçersiz istek parametreleri." }, { status: 400 });
    }

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
    }

    targetUser.authorizedModules = cleanModules;
    targetUser.canManageApplications = cleanModules.length > 0;
    await targetUser.save();

    const grantedLabels = PERMISSION_MODULES.filter((m) =>
      cleanModules.includes(m.key)
    ).map((m) => m.label);

    try {
      await Log.create({
        userId: session.user.id,
        action: "Sayfa Bazlı Yetki Değiştirildi",
        details: `${targetUser.name} (${targetUser.email}) için yetkili sayfalar: ${
          grantedLabels.length > 0 ? grantedLabels.join(", ") : "YETKİ YOK"
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
        authorizedModules: targetUser.authorizedModules,
      },
    });
  } catch (error: any) {
    console.error("POST /api/settings/permissions error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
