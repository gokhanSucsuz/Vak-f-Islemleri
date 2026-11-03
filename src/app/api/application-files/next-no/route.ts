import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();

    // Query highest numeric sequence
    const highest = await ApplicationFile.findOne()
      .sort({ applicationNoSeq: -1 })
      .select("applicationNoSeq applicationNo")
      .lean();

    const nextNo = highest?.applicationNoSeq ? highest.applicationNoSeq + 1 : 1;

    return NextResponse.json({ nextNo: nextNo.toString() });
  } catch (error: any) {
    console.error("GET /api/application-files/next-no error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

