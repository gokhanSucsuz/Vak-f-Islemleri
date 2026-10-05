import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import HelpType from "@/models/HelpType";
import Log from "@/models/Log";

export async function GET() {
  await dbConnect();
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const helpTypes = await HelpType.find().sort({ name: 1 });
    return NextResponse.json({ helpTypes });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  await dbConnect();
  const session = await getServerSession(authOptions);

  if (!session || (session.user.role !== "manager" && session.user.role !== "superadmin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const helpType = await HelpType.create({ name });

    await Log.create({
      userId: session.user.id,
      action: "HELP_TYPE_CREATED",
      details: `Created help type: ${name}`,
    });

    return NextResponse.json({ success: true, helpType });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
