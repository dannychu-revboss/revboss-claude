import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseOffers } from "@/lib/utils";
import { updateIdentity, addOffer, removeOffer, deleteClient } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function IdentityPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) notFound();
  const offers = parseOffers(client.offers);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Identity</h1>
      <p className="mb-6 mt-1 text-sm text-neutral-500">
        Define this client&apos;s professional identity so every generation is personal and on brand.
      </p>

      <form action={updateIdentity} className="space-y-6">
        <input type="hidden" name="clientId" value={clientId} />

        <section className="card p-6">
          <h2 className="mb-1 font-semibold">Client name</h2>
          <input className="input mt-2" name="name" defaultValue={client.name} required />
        </section>

        <section className="card p-6">
          <h2 className="mb-1 font-semibold">About</h2>
          <p className="mb-3 text-sm text-neutral-500">
            Their professional background and what makes them unique.
          </p>
          <textarea
            className="input min-h-[120px]"
            name="about"
            defaultValue={client.about}
            placeholder="I am the founder of…"
          />
        </section>

        <section className="card p-6">
          <h2 className="mb-1 font-semibold">Their story</h2>
          <p className="mb-3 text-sm text-neutral-500">
            Their journey, challenges they&apos;ve overcome, and what drives them.
          </p>
          <textarea
            className="input min-h-[240px]"
            name="story"
            defaultValue={client.story}
            placeholder="I came at this sideways. My background is…"
          />
        </section>

        <section className="card p-6">
          <h2 className="mb-1 font-semibold">Founder archetype</h2>
          <p className="mb-3 text-sm text-neutral-500">
            The archetype doc for this founder (paste from the archetype generator).
          </p>
          <textarea
            className="input min-h-[160px]"
            name="archetype"
            defaultValue={client.archetype}
            placeholder="e.g. The Operator-Builder: pragmatic, behind-the-scenes systems thinker who…"
          />
        </section>

        <button className="btn-primary" type="submit">
          Save identity
        </button>
      </form>

      <section className="card mt-6 p-6">
        <h2 className="mb-1 font-semibold">Offers</h2>
        <p className="mb-4 text-sm text-neutral-500">
          The products or services this client provides to their audience.
        </p>
        <ul className="mb-4 space-y-2">
          {offers.map((o, i) => (
            <li key={i} className="flex items-start justify-between gap-3 rounded-lg border border-neutral-100 bg-neutral-50 px-3 py-2">
              <div>
                <p className="text-sm font-medium">{o.title}</p>
                {o.description && <p className="text-xs text-neutral-500">{o.description}</p>}
              </div>
              <form action={removeOffer}>
                <input type="hidden" name="clientId" value={clientId} />
                <input type="hidden" name="index" value={i} />
                <button className="text-xs text-neutral-400 hover:text-red-600" type="submit">
                  Remove
                </button>
              </form>
            </li>
          ))}
          {offers.length === 0 && (
            <li className="text-sm text-neutral-400">No offers yet.</li>
          )}
        </ul>
        <form action={addOffer} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="flex-1 min-w-40">
            <label className="label">Offer</label>
            <input className="input" name="title" placeholder="e.g. Custom Shopify merch stores" required />
          </div>
          <div className="flex-[2] min-w-56">
            <label className="label">Description</label>
            <input className="input" name="description" placeholder="Short description" />
          </div>
          <button className="btn-secondary" type="submit">
            + Add offer
          </button>
        </form>
      </section>

      <section className="card mt-6 border-red-200 p-6">
        <h2 className="mb-1 font-semibold text-red-700">Danger zone</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Deleting this workspace removes its knowledge base, drafts, and chats permanently.
        </p>
        <form action={deleteClient}>
          <input type="hidden" name="clientId" value={clientId} />
          <button className="btn-danger" type="submit">
            Delete client workspace
          </button>
        </form>
      </section>
    </div>
  );
}
