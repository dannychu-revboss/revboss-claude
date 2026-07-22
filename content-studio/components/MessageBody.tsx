"use client";

import { useState } from "react";
import Link from "next/link";

type Part =
  | { type: "text"; text: string }
  | { type: "post"; title: string; text: string; complete: boolean };

/**
 * Assistant messages wrap ready-to-publish copy in <post title="...">...</post>.
 * Split a message into prose parts and post parts (handling a post that is
 * still streaming in, i.e. an unclosed tag at the end).
 */
function parseParts(content: string): Part[] {
  const parts: Part[] = [];
  const re = /<post(?:\s+title="([^"]*)")?\s*>([\s\S]*?)(<\/post>|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last) parts.push({ type: "text", text: content.slice(last, m.index) });
    parts.push({
      type: "post",
      title: m[1] || "Post draft",
      text: m[2].trim(),
      complete: m[3] === "</post>",
    });
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push({ type: "text", text: content.slice(last) });
  return parts;
}

function PostCard({
  title,
  text,
  complete,
  clientId,
}: {
  title: string;
  text: string;
  complete: boolean;
  clientId: string;
}) {
  const [copied, setCopied] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveDraft() {
    setSaving(true);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, title, content: text }),
      });
      const data = await res.json();
      if (res.ok) setSavedDraftId(data.id);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card my-3 overflow-hidden">
      <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-4 py-2">
        <span className="text-xs font-medium text-neutral-500">📝 {title}</span>
        {complete && (
          <div className="flex items-center gap-1">
            <button onClick={copy} className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200">
              {copied ? "Copied ✓" : "Copy"}
            </button>
            {savedDraftId ? (
              <Link
                href={`/c/${clientId}/drafts/${savedDraftId}`}
                className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white hover:bg-brand-700"
              >
                Open in editor →
              </Link>
            ) : (
              <button
                onClick={saveDraft}
                disabled={saving}
                className="rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-700"
              >
                {saving ? "Saving…" : "Save as draft"}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="whitespace-pre-wrap px-4 py-3 text-sm leading-relaxed">{text}</div>
    </div>
  );
}

export default function MessageBody({
  content,
  clientId,
  streaming,
}: {
  content: string;
  clientId: string;
  streaming: boolean;
}) {
  const parts = parseParts(content);
  return (
    <div className="text-sm leading-relaxed text-neutral-800">
      {parts.map((p, i) =>
        p.type === "text" ? (
          <div key={i} className="whitespace-pre-wrap">
            {p.text.trim()}
          </div>
        ) : (
          <PostCard
            key={i}
            title={p.title}
            text={p.text}
            complete={p.complete}
            clientId={clientId}
          />
        )
      )}
      {streaming && <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-neutral-300 align-text-bottom" />}
    </div>
  );
}
