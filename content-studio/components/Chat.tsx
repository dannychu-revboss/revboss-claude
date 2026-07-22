"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { QUICK_ACTIONS } from "@/lib/quick-actions";
import MessageBody from "@/components/MessageBody";

type Msg = { role: "user" | "assistant"; content: string };

export default function Chat({
  clientId,
  conversationId: initialConversationId,
  initialMessages,
}: {
  clientId: string;
  conversationId: string | null;
  initialMessages: Msg[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const conversationRef = useRef<string | null>(initialConversationId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          conversationId: conversationRef.current,
          message,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text().catch(() => "");
        throw new Error(err || `Request failed (${res.status})`);
      }
      const newId = res.headers.get("X-Conversation-Id");
      const isNewConversation = newId && !conversationRef.current;
      if (newId) conversationRef.current = newId;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          copy[copy.length - 1] = {
            role: "assistant",
            content: copy[copy.length - 1].content + chunk,
          };
          return copy;
        });
      }
      if (isNewConversation) {
        // Reflect the conversation in the URL + sidebar without remounting the chat.
        window.history.replaceState(null, "", `/c/${clientId}?chat=${newId}`);
        router.refresh();
      }
    } catch (err) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `Something went wrong: ${err instanceof Error ? err.message : "unknown error"}`,
        };
        return copy;
      });
    } finally {
      setBusy(false);
      textareaRef.current?.focus();
    }
  }

  function onQuickAction(action: (typeof QUICK_ACTIONS)[number]) {
    if (action.needsInput) {
      setInput(action.prompt);
      textareaRef.current?.focus();
    } else {
      send(action.prompt);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="flex h-screen flex-col">
      <div className="flex-1 overflow-y-auto">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center px-6">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
                R
              </div>
              <h1 className="text-3xl font-semibold tracking-tight">
                What are we creating today?
              </h1>
            </div>
            <div className="grid w-full max-w-2xl grid-cols-2 gap-2 sm:grid-cols-3">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  onClick={() => onQuickAction(a)}
                  className="btn-secondary justify-start text-neutral-600"
                >
                  <span>{a.icon}</span> {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-auto max-w-xl rounded-2xl bg-neutral-100 px-4 py-3 text-sm whitespace-pre-wrap">
                  {m.content}
                </div>
              ) : (
                <MessageBody
                  key={i}
                  content={m.content}
                  clientId={clientId}
                  streaming={busy && i === messages.length - 1}
                />
              )
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-neutral-200 bg-white p-4">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <textarea
            ref={textareaRef}
            className="input min-h-[52px] max-h-48 resize-y"
            placeholder="Ask the studio… (Enter to send, Shift+Enter for a new line)"
            value={input}
            rows={2}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
          />
          <button className="btn-primary h-[52px]" type="submit" disabled={busy || !input.trim()}>
            {busy ? "…" : "Send"}
          </button>
        </form>
      </div>
    </div>
  );
}
