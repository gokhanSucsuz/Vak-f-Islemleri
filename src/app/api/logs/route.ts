import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import Log from "@/models/Log";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    // Yalnızca süper admin erişebilir
    if (!session || !session.user || session.user.role !== "superadmin") {
      return NextResponse.json({ error: "Bu sayfayı görüntüleme yetkiniz yok" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const filterUserId = searchParams.get("userId");
    const dateStart = searchParams.get("dateStart");
    const dateEnd = searchParams.get("dateEnd");
    const searchText = searchParams.get("search");

    await dbConnect();

    let query: any = {};

    if (filterUserId) {
      query.userId = filterUserId;
    }

    if (dateStart && dateEnd) {
      query.createdAt = {
        $gte: new Date(dateStart),
        $lte: new Date(dateEnd)
      };
    }

    const limitParam = parseInt(searchParams.get("limit") || "1000", 10);
    const safeLimit = Math.min(Math.max(isNaN(limitParam) ? 1000 : limitParam, 50), 2000);

    const logs = await Log.find(query)
      .populate("userId", "name email role")
      .sort({ createdAt: -1 })
      .limit(safeLimit)
      .lean();
      
    // Text search (action, details, or staff name - 100% Turkish & case-insensitive)
    let filteredLogs = logs;
    
    if (searchText && searchText.trim().length > 0) {
      const { turkishIncludes } = await import("@/lib/turkish");
      const cleanQ = searchText.trim();
      filteredLogs = logs.filter((l: any) => {
        const actionMatch = l.action && turkishIncludes(l.action, cleanQ);
        const detailsMatch = l.details && turkishIncludes(l.details, cleanQ);
        const userMatch = l.userId?.name && turkishIncludes(l.userId.name, cleanQ);
        return Boolean(actionMatch || detailsMatch || userMatch);
      });
    }

    return NextResponse.json({ logs: filteredLogs }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
