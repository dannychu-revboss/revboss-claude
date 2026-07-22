import { prisma } from "@/lib/db";
import Chat from "@/components/Chat";

export const dynamic = "force-dynamic";

export default async function CreatePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ chat?: string }>;
}) {
  const { clientId } = await params;
  const { chat } = await searchParams;

  let initialMessages: { role: "user" | "assistant"; content: string }[] = [];
  if (chat) {
    const conversation = await prisma.conversation.findFirst({
      where: { id: chat, clientId },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (conversation) {
      initialMessages = conversation.messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
    }
  }

  return (
    <Chat
      key={chat || "new"}
      clientId={clientId}
      conversationId={chat || null}
      initialMessages={initialMessages}
    />
  );
}
