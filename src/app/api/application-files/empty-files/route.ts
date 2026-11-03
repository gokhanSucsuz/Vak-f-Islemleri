import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import ApplicationFile from "@/models/ApplicationFile";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const emptyFiles = await ApplicationFile.find({
      $or: [
        { applicantName: { $in: ["", null] } },
        { fileStatus: "Boş Dosya" },
      ],
    })
      .sort({ applicationNoSeq: 1, applicationNo: 1 })
      .limit(limit)
      .lean();

    return NextResponse.json({
      count: emptyFiles.length,
      firstEmptyFile: emptyFiles[0] || null,
      emptyFiles,
    });
  } catch (error: any) {
    console.error("GET /api/application-files/empty-files error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}

