import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const data: { title?: string; content?: string; status?: string } = {};
  if (typeof body.title === "string") data.title = body.title.slice(0, 120);
  if (typeof body.content === "string") data.content = body.content;
  if (["draft", "approved", "published"].includes(body.status)) data.status = body.status;
  const draft = await prisma.draft.update({ where: { id }, data });
  return Response.json({ id: draft.id, updatedAt: draft.updatedAt });
}
