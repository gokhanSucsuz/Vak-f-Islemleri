import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import InKindAid from "@/models/InKindAid";
import User from "@/models/User";
import { getCalendarDaysDiff } from "@/lib/date";
import { extractTC, turkishIncludes } from "@/lib/turkish";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tc = searchParams.get("tc")?.trim() || "";
    const name = searchParams.get("name")?.trim() || "";
    const excludeId = searchParams.get("excludeId")?.trim();

    const hasValidTc = tc.length === 11 && /^\d{11}$/.test(tc);
    const hasValidName = name.length >= 3;

    if (!hasValidTc && !hasValidName) {
      return NextResponse.json({ hasRecentDelivery: false, message: "Geçersiz parametre" });
    }

    await dbConnect();
    if (!User) { }

    const query = excludeId ? { _id: { $ne: excludeId } } : {};

    // Şifreli alanlar (tcNo, citizenName) çözüldükten sonra bellekte karşılaştırılır
    const allRecords = await InKindAid.find(query)
      .populate("createdBy", "name")
      .sort({ deliveryDate: -1, createdAt: -1 })
      .limit(1000);

    const recentRecords = allRecords.filter((r: any) => {
      const effectiveDate = r.deliveryDate || r.createdAt;
      const diffDays = getCalendarDaysDiff(effectiveDate);
      if (diffDays > 30) return false;

      const recTcDigits = String(r.tcNo || "").replace(/\D/g, "") || extractTC(r.citizenName || "") || "";
      const recName = String(r.citizenName || "").trim();
      const recReceiver = String(r.receiver || "").trim();
      const recNotes = String(r.notes || "").trim();

      if (hasValidTc) {
        if (recTcDigits === tc || recName.includes(tc) || recReceiver.includes(tc) || recNotes.includes(tc)) {
          return true;
        }
      }
      if (hasValidName) {
        if (
          (recName && turkishIncludes(recName, name)) ||
          (recReceiver && turkishIncludes(recReceiver, name))
        ) {
          return true;
        }
      }
      return false;
    });

    if (!recentRecords || recentRecords.length === 0) {
      return NextResponse.json({ hasRecentDelivery: false });
    }

    const latest = recentRecords[0];
    const actualDeliveryDate = latest.deliveryDate || latest.createdAt;
    const daysAgo = Math.max(0, getCalendarDaysDiff(actualDeliveryDate));

    const formattedRecords = recentRecords.map((r: any) => ({
      _id: r._id,
      tcNo: r.tcNo,
      citizenName: r.citizenName,
      receiver: r.receiver,
      items: r.items,
      deliveryDate: r.deliveryDate || r.createdAt,
      createdAt: r.createdAt,
      personnelName: r.createdBy?.name || "Bilinmiyor",
    }));

    return NextResponse.json({
      hasRecentDelivery: true,
      count: recentRecords.length,
      daysAgo,
      lastDeliveryDate: actualDeliveryDate,
      latestRecord: formattedRecords[0],
      allRecentRecords: formattedRecords,
    });
  } catch (error: any) {
    console.error("Check recent in-kind aid error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
