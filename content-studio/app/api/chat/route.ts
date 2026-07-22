import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { buildSystemPrompt } from "@/lib/prompt";

export const maxDuration = 300;

const anthropic = new Anthropic();
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const MAX_HISTORY = 30;

export async function POST(req: NextRequest) {
  const { clientId, conversationId, message } = await req.json();
  if (!clientId || typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "clientId and message are required" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return Response.json({ error: "client not found" }, { status: 404 });

  // Find or create the conversation, then persist the user message.
  let conversation =
    conversationId != null
      ? await prisma.conversation.findFirst({ where: { id: conversationId, clientId } })
      : null;
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: {
        clientId,
        title: message.trim().slice(0, 60) || "New chat",
      },
    });
  }
  await prisma.message.create({
    data: { conversationId: conversation.id, role: "user", content: message },
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { updatedAt: new Date() },
  });

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "asc" },
  });
  const recent = history.slice(-MAX_HISTORY);

  const system = await buildSystemPrompt(clientId, message);
  const convId = conversation.id;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      let failed = false;
      try {
        const response = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          system,
          messages: recent.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        });
        for await (const event of response) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            full += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        failed = full.trim() === ""; // keep partial responses, drop error-only ones
        const msg = `\n\n[Generation error: ${err instanceof Error ? err.message : "unknown"}]`;
        controller.enqueue(encoder.encode(msg));
      }
      if (full.trim() && !failed) {
        await prisma.message.create({
          data: { conversationId: convId, role: "assistant", content: full },
        });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Conversation-Id": convId,
      "Cache-Control": "no-cache",
    },
  });
}
