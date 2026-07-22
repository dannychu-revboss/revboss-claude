import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import SidebarNav from "@/components/SidebarNav";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) notFound();

  const conversations = await prisma.conversation.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
    take: 10,
  });

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50">
        <div className="border-b border-neutral-200 p-4">
          <Link href="/" className="text-xs text-neutral-400 hover:text-neutral-600">
            ← All clients
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              {client.name.charAt(0).toUpperCase()}
            </div>
            <span className="truncate font-semibold">{client.name}</span>
          </div>
        </div>
        <SidebarNav
          clientId={clientId}
          conversations={conversations.map((c) => ({ id: c.id, title: c.title }))}
        />
      </aside>
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
