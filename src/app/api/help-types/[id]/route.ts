import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/authOptions";
import dbConnect from "@/lib/db";
import HelpType from "@/models/HelpType";
import Log from "@/models/Log";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await dbConnect();
  const session = await getServerSession(authOptions);
  const { getEffectivePermissions } = await import("@/lib/permissions");
  const perms = await getEffectivePermissions(session);

  if (!session || !perms.canManageSystem) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    const helpType = await HelpType.findByIdAndDelete(id);

    if (helpType) {
      await Log.create({
        userId: session.user.id,
        action: "HELP_TYPE_DELETED",
        details: `Deleted help type: ${helpType.name}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}
