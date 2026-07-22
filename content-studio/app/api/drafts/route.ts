import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { clientId, title, content } = await req.json();
  if (!clientId || typeof content !== "string") {
    return Response.json({ error: "clientId and content are required" }, { status: 400 });
  }
  const draft = await prisma.draft.create({
    data: {
      clientId,
      title: (title || "Untitled post").slice(0, 120),
      content,
    },
  });
  return Response.json({ id: draft.id });
}
