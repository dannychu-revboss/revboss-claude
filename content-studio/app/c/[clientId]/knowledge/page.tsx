import Link from "next/link";
import { prisma } from "@/lib/db";
import { parseTags } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { clientId } = await params;
  const { q } = await searchParams;

  const items = await prisma.knowledgeItem.findMany({
    where: {
      clientId,
      ...(q && q.length >= 2
        ? { OR: [{ title: { contains: q } }, { content: { contains: q } }, { tags: { contains: q.toLowerCase() } }] }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Knowledge base</h1>
        <div className="flex items-center gap-3">
          <form method="GET" className="w-64">
            <input
              className="input"
              type="search"
              name="q"
              placeholder="Search by title, content, tag…"
              defaultValue={q || ""}
            />
          </form>
          <Link href={`/c/${clientId}/knowledge/new`} className="btn-primary">
            + Add knowledge
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-10 text-center text-sm text-neutral-500">
          {q
            ? "No knowledge items match your search."
            : "No knowledge yet. Add interview transcripts, styling guides, archetypes, call notes — anything the AI should know about this client."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/c/${clientId}/knowledge/${item.id}`}
              className="card p-4 transition-shadow hover:shadow-md"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h2 className="font-semibold leading-snug">{item.title}</h2>
                <span className="tag shrink-0">
                  {item.kind === "document" ? "📄 Document" : "📝 Text"}
                </span>
              </div>
              <p className="mb-3 line-clamp-3 text-xs text-neutral-500">{item.content}</p>
              <div className="flex flex-wrap gap-1">
                {parseTags(item.tags).map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
