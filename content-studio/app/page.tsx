import Link from "next/link";
import { prisma } from "@/lib/db";
import { createClient } from "@/lib/actions";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Home() {
  const clients = await prisma.client.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { knowledge: true, drafts: true } },
    },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="mb-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            R
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Content Studio</h1>
            <p className="text-sm text-neutral-500">
              Pick a client workspace to start creating
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((c) => (
          <Link
            key={c.id}
            href={`/c/${c.id}`}
            className="card group p-5 transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-neutral-100 text-lg font-semibold text-neutral-700 group-hover:bg-brand-100 group-hover:text-brand-700">
              {c.name.charAt(0).toUpperCase()}
            </div>
            <h2 className="font-semibold">{c.name}</h2>
            <p className="mt-1 text-xs text-neutral-500">
              {c._count.knowledge} knowledge items · {c._count.drafts} drafts ·
              updated {timeAgo(c.updatedAt)}
            </p>
          </Link>
        ))}

        <form
          action={createClient}
          className="card flex flex-col justify-center gap-3 border-dashed p-5"
        >
          <p className="text-sm font-medium text-neutral-700">New client workspace</p>
          <input className="input" name="name" placeholder="Client name" required />
          <button className="btn-primary justify-center" type="submit">
            + Create workspace
          </button>
        </form>
      </div>
    </main>
  );
}
