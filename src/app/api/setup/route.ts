import { NextResponse } from "next/server";
import dbConnect from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";

export async function GET() {
  try {
    await dbConnect();
    
    const email = "gokhansucsuz@gmail.com";
    const existingAdmin = await User.findOne({ email });
    
    if (existingAdmin) {
      return NextResponse.json({ message: "Süper admin zaten mevcut." }, { status: 200 });
    }
    
    const hashedPassword = await bcrypt.hash("Admin123!", 10);
    
    const superadmin = new User({
      name: "Süper Admin",
      email,
      password: hashedPassword,
      role: "superadmin"
    });
    
    await superadmin.save();
    
    return NextResponse.json({ message: "Süper admin başarıyla oluşturuldu. Şifre: Admin123!" }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Kurulum hatası" }, { status: 500 });
  }
}
