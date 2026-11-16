import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Transaction from "@/models/Transaction";
import ApplicationFile from "@/models/ApplicationFile";
import Petition from "@/models/Petition";
import { extractTC, turkishIncludes } from "@/lib/turkish";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { citizenInfo } = await req.json();
    const raw = String(citizenInfo || "").trim();
    if (raw.length < 3) {
      return NextResponse.json({ matches: [] });
    }

    const inputTc = extractTC(raw);
    const namePart = raw
      .replace(/\b\d{11}\b/g, "")
      .replace(/[-–—]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    await dbConnect();
    await import("@/models/HelpType");
    await import("@/models/User");

    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

    const matches: Array<{
      id: string;
      source: "İşlem Kaydı" | "Başvuru Dosyası" | "Dilekçe";
      citizenInfo: string;
      detail: string;
      staffName: string;
      createdAt: string;
    }> = [];

    const isMatch = (candidateName?: string, candidateTc?: string) => {
      const cName = (candidateName || "").trim();
      const cTc = (candidateTc || "").trim() || extractTC(cName);
      if (inputTc && cTc && inputTc === cTc) return true;
      if (inputTc && cName.includes(inputTc)) return true;

      if (namePart.length >= 3 && cName.length >= 3) {
        const cleanCandidate = cName
          .replace(/\b\d{11}\b/g, "")
          .replace(/[-–—]/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (
          turkishIncludes(cleanCandidate, namePart) ||
          (cleanCandidate.length >= 3 && turkishIncludes(namePart, cleanCandidate))
        ) {
          return true;
        }
      }
      return false;
    };

    const [recentTx, recentApps, recentPetitions] = await Promise.all([
      Transaction.find({ createdAt: { $gte: oneMonthAgo } })
        .populate("userId", "name")
        .populate("helpType", "name")
        .sort({ createdAt: -1 }),
      ApplicationFile.find({ createdAt: { $gte: oneMonthAgo } })
        .populate("createdBy", "name")
        .sort({ createdAt: -1 }),
      Petition.find({ createdAt: { $gte: oneMonthAgo } })
        .populate("createdBy", "name")
        .sort({ createdAt: -1 }),
    ]);

    for (const t of recentTx) {
      if (isMatch(t.citizenInfo)) {
        matches.push({
          id: `tx-${t._id}`,
          source: "İşlem Kaydı",
          citizenInfo: t.citizenInfo,
          detail: (t.helpType as any)?.name || "İşlem",
          staffName: (t.userId as any)?.name || "Personel",
          createdAt: t.createdAt,
        });
      }
    }

    for (const a of recentApps) {
      if (isMatch(a.citizenName, a.tcNo)) {
        matches.push({
          id: `app-${a._id}`,
          source: "Başvuru Dosyası",
          citizenInfo: `${a.citizenName}${a.tcNo ? ` (${a.tcNo})` : ""}`,
          detail: a.fileNumber ? `Dosya No: ${a.fileNumber}` : "Başvuru Kaydı",
          staffName: (a.createdBy as any)?.name || "Personel",
          createdAt: a.createdAt,
        });
      }
    }

    for (const p of recentPetitions) {
      if (isMatch(p.citizenName, p.tcNo)) {
        matches.push({
          id: `pet-${p._id}`,
          source: "Dilekçe",
          citizenInfo: `${p.citizenName}${p.tcNo ? ` (${p.tcNo})` : ""}`,
          detail: p.subject || (p.petitionType === "matbu" ? "Matbu Dilekçe" : "Detaylı Dilekçe"),
          staffName: (p.createdBy as any)?.name || "Personel",
          createdAt: p.createdAt,
        });
      }
    }

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("POST /api/transactions/check-recent error:", error);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
