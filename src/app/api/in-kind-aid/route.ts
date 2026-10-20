import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import InKindAid from "@/models/InKindAid";
import Log from "@/models/Log";
import User from "@/models/User";

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const url = new URL(req.url);
    const dateStart = url.searchParams.get("dateStart");
    const dateEnd = url.searchParams.get("dateEnd");
    const userId = url.searchParams.get("userId");
    const aidType = url.searchParams.get("aidType");
    const search = url.searchParams.get("search");

    await dbConnect();
    if (!User) {}

    const query: any = {};
    if (dateStart || dateEnd) {
      query.createdAt = {};
      if (dateStart) query.createdAt.$gte = new Date(dateStart);
      if (dateEnd) query.createdAt.$lte = new Date(dateEnd);
    }

    if (userId) {
      query.createdBy = userId;
    }

    if (aidType) {
      query["items.aidType"] = aidType;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), "i");
      query.$or = [
        { citizenName: regex },
        { tcNo: regex },
        { receiver: regex },
        { phone: regex },
        { address: regex },
        { "items.aidType": regex },
        { "items.specification": regex },
      ];
    }

    const records = await InKindAid.find(query)
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    return NextResponse.json(records);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const body = await req.json();
    await dbConnect();

    const userAny = session.user as any;
    const userId = userAny.id || userAny._id;
    const tcNo = body.tcNo?.trim() || body.citizenName?.match(/\b\d{11}\b/)?.[0] || "";

    const newRecord = await InKindAid.create({
      ...body,
      tcNo,
      createdBy: userId,
    });

    try {
      const itemsDetail = Array.isArray(body.items)
        ? body.items.map((i: any) => `${i.quantity} ${i.unit} ${i.aidType} (${i.specification || "-"})`).join(", ")
        : "";
      await Log.create({
        userId: userId,
        action: "Ayni Yardım Kaydı Eklendi",
        details: `${body.citizenName} (TC: ${tcNo || "-"}) kişisine ${itemsDetail} teslim edildi.`,
      });
    } catch (e) {
      // Ignore log error
    }

    return NextResponse.json(newRecord, { status: 201 });
  } catch (error: any) {
    console.error("In-kind aid POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const { _id, ...updateData } = await req.json();
    await dbConnect();

    const userAny = session.user as any;
    const record = await InKindAid.findById(_id);

    if (!record) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    if (userAny.role === "personnel" && record.createdBy.toString() !== userAny.id) {
      return NextResponse.json({ error: "Bu kaydı düzenleme yetkiniz yok" }, { status: 403 });
    }

    const tcNo = updateData.tcNo?.trim() || updateData.citizenName?.match(/\b\d{11}\b/)?.[0] || record.tcNo || "";
    const updatedRecord = await InKindAid.findByIdAndUpdate(
      _id,
      { ...updateData, tcNo },
      { new: true }
    );

    try {
      await Log.create({
        userId: userAny.id,
        action: "Ayni Yardım Kaydı Güncellendi",
        details: `${updateData.citizenName} kişisinin ayni yardım kaydı düzenlendi.`,
      });
    } catch (e) {
      // Ignore log error
    }

    return NextResponse.json(updatedRecord);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID gerekli" }, { status: 400 });
    }

    await dbConnect();

    const userAny = session.user as any;
    const record = await InKindAid.findById(id);

    if (!record) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    if (userAny.role === "personnel" && record.createdBy.toString() !== userAny.id) {
      return NextResponse.json({ error: "Bu kaydı silme yetkiniz yok" }, { status: 403 });
    }

    await InKindAid.findByIdAndDelete(id);

    try {
      await Log.create({
        userId: userAny.id,
        action: "Ayni Yardım Kaydı Silindi",
        details: `${record.citizenName} kişisinin ayni yardım kaydı silindi.`,
      });
    } catch (e) {
      // Ignore log error
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
