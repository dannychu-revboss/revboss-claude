"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { deleteDraft } from "@/lib/actions";

const MAX_CHARS = 3000;
// LinkedIn truncates the feed preview around here ("...see more").
const HOOK_CUTOFF = 210;

export default function DraftEditor({
  clientId,
  clientName,
  draft,
}: {
  clientId: string;
  clientName: string;
  draft: { id: string; title: string; content: string; status: string };
}) {
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [status, setStatus] = useState(draft.status);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [copied, setCopied] = useState(false);
  const [hookOnly, setHookOnly] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persist(next: { title?: string; content?: string; status?: string }) {
    setSaveState("saving");
    const res = await fetch(`/api/drafts/${draft.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaveState(res.ok ? "saved" : "dirty");
  }

  function scheduleSave(next: { title?: string; content?: string }) {
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(next), 800);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const over = content.length > MAX_CHARS;
  const preview = hookOnly ? content.slice(0, HOOK_CUTOFF) : content;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/c/${clientId}/drafts`} className="text-sm text-neutral-400 hover:text-neutral-700">
            ← Drafts
          </Link>
          <input
            className="min-w-0 flex-1 rounded-md px-2 py-1 text-sm font-semibold outline-none hover:bg-neutral-50 focus:bg-neutral-50"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave({ title: e.target.value });
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-400">
            {saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Unsaved changes"}
          </span>
          <select
            className="rounded-lg border border-neutral-200 px-2 py-1.5 text-xs"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              persist({ status: e.target.value });
            }}
          >
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="published">Published</option>
          </select>
          <button onClick={copy} className="btn-secondary !py-1.5 text-xs">
            {copied ? "Copied ✓" : "Copy post"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        {/* Editor */}
        <div className="flex min-h-0 flex-col border-r border-neutral-200">
          <textarea
            className="w-full flex-1 resize-none px-6 py-5 text-sm leading-relaxed outline-none"
            value={content}
            placeholder="Write or paste the post…"
            onChange={(e) => {
              setContent(e.target.value);
              scheduleSave({ content: e.target.value });
            }}
          />
          <div className="flex items-center justify-between border-t border-neutral-100 px-6 py-2">
            <span className={`text-xs ${over ? "font-semibold text-red-600" : "text-neutral-400"}`}>
              T {content.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
            <span className="text-xs text-neutral-400">
              Hook shows first ~{HOOK_CUTOFF} characters in the feed
            </span>
          </div>
        </div>

        {/* LinkedIn-style preview */}
        <div className="flex min-h-0 flex-col overflow-y-auto bg-neutral-50 p-6">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
              LinkedIn preview
            </p>
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={hookOnly}
                onChange={(e) => setHookOnly(e.target.checked)}
              />
              Hook only
            </label>
          </div>
          <div className="card mx-auto w-full max-w-md p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 font-bold text-white">
                {clientName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold">{clientName}</p>
                <p className="text-xs text-neutral-400">Just now · 🌐</p>
              </div>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {preview || <span className="text-neutral-300">Post preview appears here…</span>}
              {hookOnly && content.length > HOOK_CUTOFF && (
                <span className="text-neutral-400"> …see more</span>
              )}
            </div>
            <div className="mt-4 flex justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-400">
              <span>👍 Like</span>
              <span>💬 Comment</span>
              <span>🔁 Repost</span>
              <span>📤 Send</span>
            </div>
          </div>
        </div>
      </div>

      <footer className="flex justify-end border-t border-neutral-200 px-6 py-2">
        <form action={deleteDraft}>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="id" value={draft.id} />
          <button className="text-xs text-neutral-400 hover:text-red-600" type="submit">
            Delete draft
          </button>
        </form>
      </footer>
    </div>
  );
}
