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

    const logs = await Log.find(query)
      .populate("userId", "name email role")
      .sort({ createdAt: -1 });
      
    // Text search (action or details)
    let filteredLogs = logs;
    
    if (searchText && searchText.trim().length > 0) {
      const lowerSearch = searchText.toLowerCase();
      filteredLogs = logs.filter((l: any) => {
        const actionMatch = l.action && l.action.toLowerCase().includes(lowerSearch);
        const detailsMatch = l.details && l.details.toLowerCase().includes(lowerSearch);
        return actionMatch || detailsMatch;
      });
    }

    return NextResponse.json({ logs: filteredLogs }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
