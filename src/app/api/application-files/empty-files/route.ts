import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import { getApplicationCache } from "@/lib/applicationCache";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "10", 10);

    const cache = await getApplicationCache();
    const emptyFiles = cache.items
      .filter((item) => {
        const doc = item.doc;
        return (
          !doc.applicantName ||
          String(doc.applicantName).trim() === "" ||
          doc.fileStatus === "Boş Dosya"
        );
      })
      .map((item) => item.doc)
      .sort((a, b) => (a.applicationNoSeq || 0) - (b.applicationNoSeq || 0))
      .slice(0, limit);

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

