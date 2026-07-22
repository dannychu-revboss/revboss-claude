import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  updateVoiceGuide,
  addStyleExample,
  deleteStyleExample,
  addPreference,
  deletePreference,
} from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function StylePage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      examples: { orderBy: { createdAt: "desc" } },
      preferences: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!client) notFound();

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Writing style</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-500">
        Develop this client&apos;s writing style and customize content preferences.
      </p>

      <section className="card p-6">
        <h2 className="mb-1 font-semibold">Voice &amp; styling guide</h2>
        <p className="mb-3 text-sm text-neutral-500">
          Tone, vocabulary, sentence rhythm, formatting habits — paste the client&apos;s styling
          guide or describe how they write.
        </p>
        <form action={updateVoiceGuide}>
          <input type="hidden" name="clientId" value={clientId} />
          <textarea
            className="input min-h-[180px]"
            name="voiceGuide"
            defaultValue={client.voiceGuide}
            placeholder="e.g. Direct and conversational. Short punchy sentences. Self-deprecating humor. Never uses corporate jargon…"
          />
          <button className="btn-primary mt-3" type="submit">
            Save voice guide
          </button>
        </form>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="mb-1 font-semibold">Writing examples</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Real posts in the client&apos;s voice (their best LinkedIn posts work great). The AI
          mimics the rhythm and formatting of these examples.
        </p>
        <ul className="mb-5 space-y-3">
          {client.examples.map((e) => (
            <li key={e.id} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-neutral-500">
                  {e.title || "Example post"}
                </p>
                <form action={deleteStyleExample}>
                  <input type="hidden" name="clientId" value={clientId} />
                  <input type="hidden" name="id" value={e.id} />
                  <button className="text-xs text-neutral-400 hover:text-red-600" type="submit">
                    Remove
                  </button>
                </form>
              </div>
              <p className="line-clamp-4 whitespace-pre-wrap text-xs text-neutral-600">{e.content}</p>
            </li>
          ))}
          {client.examples.length === 0 && (
            <li className="text-sm text-neutral-400">No examples yet.</li>
          )}
        </ul>
        <form action={addStyleExample} className="space-y-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input className="input" name="title" placeholder="Label (optional), e.g. 'Top performer — hiring post'" />
          <textarea
            className="input min-h-[140px]"
            name="content"
            placeholder="Paste a post written in the client's voice…"
            required
          />
          <button className="btn-secondary" type="submit">
            + Add example
          </button>
        </form>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="mb-1 font-semibold">Content preferences</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Personalized writing rules that guide every generation (hard rules the AI always follows).
        </p>
        <ul className="mb-5 space-y-2">
          {client.preferences.map((p) => (
            <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
              <p className="text-sm">{p.rule}</p>
              <form action={deletePreference}>
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="id" value={p.id} />
                <button className="text-xs text-neutral-400 hover:text-red-600" type="submit">
                  Remove
                </button>
              </form>
            </li>
          ))}
          {client.preferences.length === 0 && (
            <li className="text-sm text-neutral-400">
              No preferences yet. e.g. &quot;Never use emojis&quot;, &quot;Always end with a question&quot;, &quot;No hashtags&quot;.
            </li>
          )}
        </ul>
        <form action={addPreference} className="flex items-end gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="flex-1">
            <input className="input" name="rule" placeholder='e.g. "Never use em-dashes" or "Hooks must be under 8 words"' required />
          </div>
          <button className="btn-secondary" type="submit">
            + Add preference
          </button>
        </form>
      </section>
    </div>
  );
}
