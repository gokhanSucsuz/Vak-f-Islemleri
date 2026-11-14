import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Petition from "@/models/Petition";
import Log from "@/models/Log";
import { normalizeTurkish, toTurkishRegexPattern } from "@/lib/turkish";
import { isEncryptionEnabled } from "@/lib/encryption";
import { gzipSync } from "zlib";

function computePetitionRelevance(
  doc: any,
  normSearch: string,
  normTokens: string[]
): number {
  const tc = normalizeTurkish(String(doc.tcNo || ""));
  const name = normalizeTurkish(String(doc.citizenName || ""));
  const subj = normalizeTurkish(String(doc.subject || ""));

  if (tc && tc === normSearch) return 1000;
  if (name === normSearch) return 900;
  if (name.startsWith(normSearch)) return 850;
  if (name.includes(normSearch)) return 800;
  if (normTokens.length > 1 && normTokens.every((t) => name.includes(t))) return 500;
  if (tc && tc.startsWith(normSearch)) return 300;
  if (subj.includes(normSearch)) return 200;
  return 50;
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    await dbConnect();

    const { searchParams } = new URL(req.url);
    const search = (searchParams.get("search") || "").trim();
    const type = searchParams.get("type") || "all"; // "all" | "detayli" | "matbu"
    const sortBy = searchParams.get("sortBy") || "date_desc";
    const page = Math.max(parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.max(parseInt(searchParams.get("limit") || "30", 10), 1);

    const query: any = {};
    if (type === "detayli" || type === "matbu") {
      query.petitionType = type;
    }

    const encryptedMode = isEncryptionEnabled();
    if (search && !encryptedMode) {
      const tokens = search.split(/\s+/).filter(Boolean);
      query.$and = tokens.map((token) => {
        const regex = new RegExp(toTurkishRegexPattern(token), "i");
        return {
          $or: [{ citizenName: regex }, { tcNo: regex }, { subject: regex }],
        };
      });
    }

    let sortOptions: any = { createdAt: -1 };
    if (sortBy === "date_asc") sortOptions = { createdAt: 1 };
    else if (sortBy === "name_asc") sortOptions = { citizenName: 1, createdAt: -1 };
    else if (sortBy === "name_desc") sortOptions = { citizenName: -1, createdAt: -1 };

    let petitions: any[] = [];
    let totalMatched = 0;

    if (search) {
      const rawMatched = await Petition.find(query)
        .select("-contentCompressed")
        .populate("createdBy", "name email")
        .populate("updatedBy", "name email")
        .sort(sortOptions)
        .lean();

      const normSearch = normalizeTurkish(search.replace(/\s+/g, " "));
      const normTokens = normSearch.split(/\s+/).filter(Boolean);

      const allMatched = encryptedMode
        ? rawMatched.filter((doc: any) => {
            const haystack = normalizeTurkish(
              [doc.citizenName, doc.tcNo, doc.subject].filter(Boolean).join(" ")
            );
            return normTokens.every((t) => haystack.includes(t));
          })
        : rawMatched;

      const scored = allMatched.map((doc: any) => ({
        doc,
        score: computePetitionRelevance(doc, normSearch, normTokens),
      }));
      scored.sort((a, b) => b.score - a.score);

      const ranked = scored.map((s) => s.doc);
      totalMatched = ranked.length;
      const skip = (page - 1) * limit;
      petitions = ranked.slice(skip, skip + limit);
    } else {
      const skip = (page - 1) * limit;
      [petitions, totalMatched] = await Promise.all([
        Petition.find(query)
          .select("-contentCompressed")
          .populate("createdBy", "name email")
          .populate("updatedBy", "name email")
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean(),
        Petition.countDocuments(query),
      ]);
    }

    const [totalCount, detayliCount, matbuCount] = await Promise.all([
      Petition.countDocuments(),
      Petition.countDocuments({ petitionType: "detayli" }),
      Petition.countDocuments({ petitionType: "matbu" }),
    ]);

    return NextResponse.json({
      petitions,
      pagination: {
        page,
        limit,
        totalRecords: totalMatched,
        totalPages: Math.ceil(totalMatched / limit) || 1,
      },
      stats: {
        totalCount,
        detayliCount,
        matbuCount,
      },
    });
  } catch (error: any) {
    console.error("Petitions GET error:", error);
    return NextResponse.json(
      { error: error.message || "Dilekçeler alınamadı" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const body = await req.json();
    const petitionType = body.petitionType === "matbu" ? "matbu" : "detayli";
    const citizenName = String(body.citizenName || "").trim();
    const tcNo = String(body.tcNo || "").trim();
    const subject = String(body.subject || "").trim();
    const htmlContent = String(body.htmlContent || "").trim();

    if (!citizenName || !tcNo) {
      return NextResponse.json(
        { error: "Dilekçe sahibinin Adı Soyadı ve T.C. Kimlik No alanları zorunludur." },
        { status: 400 }
      );
    }

    if (!htmlContent) {
      return NextResponse.json(
        { error: "Dilekçe içeriği boş olamaz." },
        { status: 400 }
      );
    }

    await dbConnect();

    const rawBuffer = Buffer.from(htmlContent, "utf8");
    const contentCompressed = gzipSync(rawBuffer);

    const created = await Petition.create({
      petitionType,
      citizenName,
      tcNo,
      subject,
      contentCompressed,
      originalSize: rawBuffer.length,
      createdBy: (session.user as any).id,
    });

    await Log.create({
      userId: (session.user as any).id,
      action: "DİLEKÇE OLUŞTURULDU",
      details: `${citizenName} (${tcNo}) için ${
        petitionType === "matbu" ? "Matbu" : "Detaylı"
      } dilekçe kaydedildi.`,
    });

    const populated = await Petition.findById(created._id)
      .select("-contentCompressed")
      .populate("createdBy", "name email")
      .lean();

    return NextResponse.json({ petition: populated }, { status: 201 });
  } catch (error: any) {
    console.error("Petition POST error:", error);
    return NextResponse.json(
      { error: error.message || "Dilekçe kaydedilemedi" },
      { status: 500 }
    );
  }
}
