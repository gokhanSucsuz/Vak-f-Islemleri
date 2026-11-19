import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import HelpType from "@/models/HelpType";
import Log from "@/models/Log";
import {
  getCachedHelpTypes,
  setCachedHelpTypes,
  invalidateHelpTypesCache,
} from "@/lib/referenceCache";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cached = getCachedHelpTypes();
    if (cached) {
      return NextResponse.json({ helpTypes: cached });
    }

    await dbConnect();
    const helpTypes = await HelpType.find().sort({ name: 1 }).lean();
    setCachedHelpTypes(helpTypes);
    return NextResponse.json({ helpTypes });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  const { getEffectivePermissions } = await import("@/lib/permissions");
  const perms = await getEffectivePermissions(session);

  if (!session || !perms.canManageHelpTypes) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const helpType = await HelpType.create({ name });
    invalidateHelpTypesCache();

    void Log.create({
      userId: session.user.id,
      action: "HELP_TYPE_CREATED",
      details: `Created help type: ${name}`,
    }).catch(() => {});

    return NextResponse.json({ success: true, helpType });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
