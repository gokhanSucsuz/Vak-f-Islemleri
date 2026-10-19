import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import InKindAid from "@/models/InKindAid";
import User from "@/models/User";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const tc = searchParams.get("tc")?.trim();

    if (!tc || tc.length !== 11 || !/^\d{11}$/.test(tc)) {
      return NextResponse.json({ hasRecentDelivery: false, message: "Geçersiz TC" });
    }

    await dbConnect();
    // ensure User model is loaded
    if (!User) {}

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0);

    const recentRecords = await InKindAid.find({
      $and: [
        { createdAt: { $gte: thirtyDaysAgo } },
        {
          $or: [
            { tcNo: tc },
            { citizenName: { $regex: tc, $options: "i" } }
          ]
        }
      ]
    })
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    if (!recentRecords || recentRecords.length === 0) {
      return NextResponse.json({ hasRecentDelivery: false });
    }

    const latest = recentRecords[0];
    const diffTime = Math.abs(Date.now() - new Date(latest.createdAt).getTime());
    const daysAgo = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    const formattedRecords = recentRecords.map((r: any) => ({
      _id: r._id,
      tcNo: r.tcNo,
      citizenName: r.citizenName,
      receiver: r.receiver,
      items: r.items,
      createdAt: r.createdAt,
      personnelName: r.createdBy?.name || "Bilinmiyor",
    }));

    return NextResponse.json({
      hasRecentDelivery: true,
      count: recentRecords.length,
      daysAgo,
      lastDeliveryDate: latest.createdAt,
      latestRecord: formattedRecords[0],
      allRecentRecords: formattedRecords,
    });
  } catch (error: any) {
    console.error("Check recent in-kind aid error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
