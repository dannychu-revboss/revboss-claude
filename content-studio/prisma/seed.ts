// Seeds a demo client workspace so the team sees the intended shape of the data.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.client.findFirst({ where: { name: "Demo Client (Martin)" } });
  if (existing) {
    console.log("Demo client already exists, skipping seed.");
    return;
  }

  await prisma.client.create({
    data: {
      name: "Demo Client (Martin)",
      about:
        "I am the founder of The Fix Group, a branded merchandise and custom Shopify company that handles global fulfillment from Toronto to London to China. I leverage 10+ year supplier relationships built during my jewelry import/export days to deliver promo merch solutions most competitors can't touch, with expertise in logistics, custom tech builds, and the quirky trends driving the industry.",
      story:
        "I came at this sideways. My background's in jewelry import/export, and I was already running the Vegas trade show circuit in my twenties, building relationships with suppliers overseas. When promo came along, it felt like a natural pivot using the same core muscles: sourcing, supplier relationships, understanding how to actually manufacture something and get it shipped. The jewelry world taught me the product itself isn't really the product at all — it's the relationships behind it and the operations that make it work.",
      archetype:
        "The Operator-Builder: a behind-the-scenes systems thinker who wins on operations, not flash. Leads with hard-won lessons and specifics (real numbers, real failures). Skeptical of hype, generous with practical detail.",
      voiceGuide:
        "Direct, conversational, self-aware. Short lines with room to breathe. Leads with a concrete hook, not a thesis. Uses real numbers and named specifics. Allergic to corporate jargon and rah-rah motivation. Dry humor welcome.",
      offers: JSON.stringify([
        { title: "Branded merchandise programs", description: "End-to-end promo merch sourcing with global fulfillment" },
        { title: "Custom Shopify merch stores", description: "Branded ordering platforms for multi-location companies" },
      ]),
      preferences: {
        create: [
          { rule: "Never use hashtag walls — 0-2 hashtags max, only when they genuinely help." },
          { rule: "Hooks must be under 12 words and never clickbait." },
          { rule: "No motivational platitudes; every claim needs a concrete detail behind it." },
        ],
      },
      examples: {
        create: [
          {
            title: "Systems post (top performer)",
            content:
              "A lot of the not-so-sexy work I've done this month has been systems.\n\nI actually enjoy it, but it's all under-the-hood stuff no one sees.\n\n* Tying shipping costs properly to projects so we actually understand our margins\n* Rebuilding our sampling workflow so clients see options in days, not weeks\n\nNone of this shows up on a sales call.\n\nAll of it shows up in whether we're still here in ten years.",
          },
        ],
      },
      knowledge: {
        create: [
          {
            title: "interview 1 w/ martin",
            kind: "document",
            tags: JSON.stringify(["interview", "business-strategy", "promotional-products", "sales"]),
            content:
              "Q: How did you get into promo?\nA: Sideways, honestly. I was doing jewelry import/export, running the Vegas trade show circuit in my twenties... The relationships I built with overseas suppliers back then are the same ones I lean on today. The cheapest quote isn't worth much when something goes sideways at 2am their time. The suppliers I've worked with for over a decade are the ones who pick up the phone and figure it out.\n\nQ: What do clients get wrong?\nA: They think they're buying a product. They're buying logistics. Getting a logo right across 150 locations, hitting a ship date when fuel prices spike and you switch from air to ocean freight — that's the actual product.",
          },
          {
            title: "martin styling guide",
            kind: "document",
            tags: JSON.stringify(["voice-guide", "brand-guidelines", "linkedin", "authenticity"]),
            content:
              "Voice pillars: (1) Operator's honesty — talk about the unglamorous work. (2) Specificity — 3,000 water bottles, 150 locations, 2am supplier calls. (3) Understated confidence — never brag, let the details do it. Formatting: short paragraphs, occasional asterisk lists, no emojis in body copy, hooks that read like the middle of a conversation.",
          },
        ],
      },
    },
  });
  console.log("Seeded demo client.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
