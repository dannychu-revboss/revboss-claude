"use server";

import { prisma } from "@/lib/db";
import { parseOffers } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// ---------- Clients ----------

export async function createClient(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  if (!name) return;
  const client = await prisma.client.create({ data: { name } });
  redirect(`/c/${client.id}/identity`);
}

export async function updateIdentity(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  await prisma.client.update({
    where: { id: clientId },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      about: String(formData.get("about") ?? ""),
      story: String(formData.get("story") ?? ""),
      archetype: String(formData.get("archetype") ?? ""),
    },
  });
  revalidatePath(`/c/${clientId}/identity`);
}

export async function deleteClient(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  await prisma.client.delete({ where: { id: clientId } });
  revalidatePath("/");
  redirect("/");
}

export async function addOffer(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  if (!title) return;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const offers = parseOffers(client.offers);
  offers.push({ title, description });
  await prisma.client.update({ where: { id: clientId }, data: { offers: JSON.stringify(offers) } });
  revalidatePath(`/c/${clientId}/identity`);
}

export async function removeOffer(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  const index = Number(formData.get("index"));
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId } });
  const offers = parseOffers(client.offers);
  offers.splice(index, 1);
  await prisma.client.update({ where: { id: clientId }, data: { offers: JSON.stringify(offers) } });
  revalidatePath(`/c/${clientId}/identity`);
}

// ---------- Knowledge ----------

export async function saveKnowledge(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  const id = String(formData.get("id") || "");
  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "");
  const kind = String(formData.get("kind") || "text");
  const tags = String(formData.get("tags") || "")
    .split(",")
    .map((t) => t.trim().toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
  if (!title || !content) return;
  if (id) {
    await prisma.knowledgeItem.update({
      where: { id },
      data: { title, content, kind, tags: JSON.stringify(tags) },
    });
  } else {
    await prisma.knowledgeItem.create({
      data: { clientId, title, content, kind, tags: JSON.stringify(tags) },
    });
  }
  revalidatePath(`/c/${clientId}/knowledge`);
  redirect(`/c/${clientId}/knowledge`);
}

export async function deleteKnowledge(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  const id = String(formData.get("id"));
  await prisma.knowledgeItem.delete({ where: { id } });
  revalidatePath(`/c/${clientId}/knowledge`);
  redirect(`/c/${clientId}/knowledge`);
}

// ---------- Writing style ----------

export async function updateVoiceGuide(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  await prisma.client.update({
    where: { id: clientId },
    data: { voiceGuide: String(formData.get("voiceGuide") ?? "") },
  });
  revalidatePath(`/c/${clientId}/style`);
}

export async function addStyleExample(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  const content = String(formData.get("content") || "").trim();
  const title = String(formData.get("title") || "").trim();
  if (!content) return;
  await prisma.styleExample.create({ data: { clientId, content, title } });
  revalidatePath(`/c/${clientId}/style`);
}

export async function deleteStyleExample(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  await prisma.styleExample.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(`/c/${clientId}/style`);
}

export async function addPreference(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  const rule = String(formData.get("rule") || "").trim();
  if (!rule) return;
  await prisma.contentPreference.create({ data: { clientId, rule } });
  revalidatePath(`/c/${clientId}/style`);
}

export async function deletePreference(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  await prisma.contentPreference.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(`/c/${clientId}/style`);
}

// ---------- Drafts ----------

export async function createDraft(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  const draft = await prisma.draft.create({
    data: {
      clientId,
      title: String(formData.get("title") || "Untitled post"),
      content: String(formData.get("content") || ""),
    },
  });
  redirect(`/c/${clientId}/drafts/${draft.id}`);
}

export async function deleteDraft(formData: FormData) {
  const clientId = String(formData.get("clientId"));
  await prisma.draft.delete({ where: { id: String(formData.get("id")) } });
  revalidatePath(`/c/${clientId}/drafts`);
  redirect(`/c/${clientId}/drafts`);
}
