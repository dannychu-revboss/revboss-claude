import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseTags } from "@/lib/utils";
import KnowledgeForm from "@/components/KnowledgeForm";

export default async function EditKnowledgePage({
  params,
}: {
  params: Promise<{ clientId: string; itemId: string }>;
}) {
  const { clientId, itemId } = await params;
  const item = await prisma.knowledgeItem.findFirst({
    where: { id: itemId, clientId },
  });
  if (!item) notFound();

  return (
    <KnowledgeForm
      clientId={clientId}
      item={{
        id: item.id,
        title: item.title,
        content: item.content,
        kind: item.kind,
        tags: parseTags(item.tags),
      }}
    />
  );
}
