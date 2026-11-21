import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    await dbConnect();

    const anySuperAdmin = await User.exists({ role: "superadmin" });
    if (anySuperAdmin) {
      return NextResponse.json(
        { error: "Sistem kurulumu daha önce tamamlanmıştır." },
        { status: 403 }
      );
    }

    const email = "gokhansucsuz@gmail.com";
    const hashedPassword = await bcrypt.hash("Admin123!", 10);

    const superadmin = new User({
      name: "Süper Admin",
      email,
      password: hashedPassword,
      role: "superadmin",
    });

    await superadmin.save();

    return NextResponse.json(
      { message: "İlk kurulum tamamlandı. Lütfen giriş yaptıktan sonra şifrenizi değiştirin." },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Kurulum hatası" }, { status: 500 });
  }
}
