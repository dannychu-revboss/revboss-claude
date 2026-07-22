import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import DraftEditor from "@/components/DraftEditor";

export const dynamic = "force-dynamic";

export default async function DraftPage({
  params,
}: {
  params: Promise<{ clientId: string; draftId: string }>;
}) {
  const { clientId, draftId } = await params;
  const draft = await prisma.draft.findFirst({
    where: { id: draftId, clientId },
    include: { client: { select: { name: true } } },
  });
  if (!draft) notFound();

  return (
    <DraftEditor
      clientId={clientId}
      clientName={draft.client.name}
      draft={{
        id: draft.id,
        title: draft.title,
        content: draft.content,
        status: draft.status,
      }}
    />
  );
}
