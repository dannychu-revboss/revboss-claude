import Link from "next/link";
import { prisma } from "@/lib/db";
import { createDraft } from "@/lib/actions";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-neutral-100 text-neutral-600",
  approved: "bg-emerald-100 text-emerald-700",
  published: "bg-brand-100 text-brand-700",
};

export default async function DraftsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const drafts = await prisma.draft.findMany({
    where: { clientId },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Drafts</h1>
        <form action={createDraft}>
          <input type="hidden" name="clientId" value={clientId} />
          <button className="btn-primary" type="submit">
            + New draft
          </button>
        </form>
      </div>

      {drafts.length === 0 ? (
        <div className="card p-10 text-center text-sm text-neutral-500">
          No drafts yet. Generate a post in Create and hit &quot;Save as draft&quot;, or start a blank one.
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map((d) => (
            <li key={d.id}>
              <Link
                href={`/c/${clientId}/drafts/${d.id}`}
                className="card flex items-center justify-between gap-4 p-4 transition-shadow hover:shadow-md"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.title}</p>
                  <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500">
                    {d.content || "Empty draft"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[d.status] || STATUS_STYLES.draft}`}>
                    {d.status}
                  </span>
                  <span className="text-xs text-neutral-400">updated {timeAgo(d.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
