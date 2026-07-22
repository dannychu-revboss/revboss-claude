// Shared between server and client components — keep this file free of
// server-only imports (prisma, env, etc.).

export const QUICK_ACTIONS: { label: string; icon: string; prompt: string; needsInput?: boolean }[] = [
  { label: "Give post ideas", icon: "💡", prompt: "Give me 8 LinkedIn post ideas for this client, grounded in their knowledge base. For each: a working hook + one line on the angle. Mix formats (story, contrarian take, list, lesson learned)." },
  { label: "Plan post idea", icon: "🗂️", prompt: "Help me plan a post about: ", needsInput: true },
  { label: "Give a template", icon: "📄", prompt: "Give me a proven LinkedIn post template that fits this client's voice, with a filled-in example using their real story." },
  { label: "Write from draft", icon: "✍️", prompt: "Rewrite the following rough draft in this client's voice, keeping their facts intact and adding a strong hook:\n\n", needsInput: true },
  { label: "Give feedback", icon: "💬", prompt: "Give me direct, specific feedback on this post draft (hook, structure, voice-match, CTA), then show an improved version:\n\n", needsInput: true },
  { label: "Give image ideas", icon: "🖼️", prompt: "Suggest 5 visual/image ideas (carousel, infographic, photo, screenshot) to pair with this post:\n\n", needsInput: true },
  { label: "Repurpose post", icon: "🔁", prompt: "Repurpose this existing post into 3 fresh variations with different hooks and formats:\n\n", needsInput: true },
];
