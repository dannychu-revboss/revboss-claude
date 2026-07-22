import KnowledgeForm from "@/components/KnowledgeForm";

export default async function NewKnowledgePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <KnowledgeForm clientId={clientId} />;
}
