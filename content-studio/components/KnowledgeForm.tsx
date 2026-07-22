import Link from "next/link";
import { saveKnowledge, deleteKnowledge } from "@/lib/actions";

export default function KnowledgeForm({
  clientId,
  item,
}: {
  clientId: string;
  item?: { id: string; title: string; content: string; kind: string; tags: string[] };
}) {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {item ? "Edit knowledge" : "Add knowledge"}
        </h1>
        <Link href={`/c/${clientId}/knowledge`} className="text-sm text-neutral-500 hover:text-neutral-800">
          ← Back to knowledge base
        </Link>
      </div>

      <form action={saveKnowledge} className="card space-y-5 p-6">
        <input type="hidden" name="clientId" value={clientId} />
        {item && <input type="hidden" name="id" value={item.id} />}
        <div>
          <label className="label">Title</label>
          <input
            className="input"
            name="title"
            required
            defaultValue={item?.title}
            placeholder='e.g. "interview 3 w/ martin" or "styling guide"'
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Type</label>
            <select className="input" name="kind" defaultValue={item?.kind || "text"}>
              <option value="text">Text / notes</option>
              <option value="document">Document (pasted)</option>
            </select>
          </div>
          <div>
            <label className="label">Tags (comma separated)</label>
            <input
              className="input"
              name="tags"
              defaultValue={item?.tags.join(", ")}
              placeholder="interview, brand-strategy, linkedin"
            />
          </div>
        </div>
        <div>
          <label className="label">Content</label>
          <textarea
            className="input min-h-[320px] font-mono text-xs"
            name="content"
            required
            defaultValue={item?.content}
            placeholder="Paste the transcript, guide, notes, or document text here…"
          />
          <p className="mt-1.5 text-xs text-neutral-400">
            Tip: paste plain text. Interview transcripts, styling guides, archetype docs, and
            call notes all work — the AI pulls the most relevant items into every generation.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <button className="btn-primary" type="submit">
            {item ? "Save changes" : "Add to knowledge base"}
          </button>
        </div>
      </form>

      {item && (
        <form action={deleteKnowledge} className="mt-4 text-right">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="id" value={item.id} />
          <button className="btn-danger" type="submit">
            Delete this item
          </button>
        </form>
      )}
    </div>
  );
}
