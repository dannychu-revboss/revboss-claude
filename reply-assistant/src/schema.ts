import { z } from "zod";

// Validation for client configs edited in the admin UI.

const id = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/, "lowercase letters, numbers, - and _ only");

export const AssetSchema = z.object({
  id,
  type: z.enum(["one_sheet", "lead_magnet", "tear_sheet", "case_study", "other"]),
  title: z.string().min(1),
  description: z.string(),
  url: z.string(),
  driveFileId: z.string().optional(),
  whenToUse: z.string().optional(),
});

export const TemplateSchema = z.object({
  id,
  name: z.string().min(1),
  channel: z.enum(["linkedin", "email", "any"]),
  body: z.string().min(1),
  notes: z.string().optional(),
});

export const MatrixRuleSchema = z.object({
  id,
  scenario: z.string().min(1),
  intent: z.enum(["positive", "curious", "objection", "timing", "referral", "negative", "out_of_office", "other"]),
  signals: z.array(z.string()),
  goal: z.string(),
  options: z.array(
    z.object({
      label: z.string().min(1),
      templateId: z.string().optional(),
      assetIds: z.array(z.string()),
      guidance: z.string().optional(),
    }),
  ),
  avoid: z.string().optional(),
});

export const ClientSchema = z
  .object({
    id,
    name: z.string().min(1),
    active: z.boolean(),
    accessToken: z.string().min(16),
    profile: z.object({
      company: z.string(),
      offer: z.string(),
      audience: z.string(),
      voice: z.string(),
      signature: z.string().optional(),
      calendarLink: z.string().optional(),
    }),
    heyreach: z
      .object({
        apiKeyEnv: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "env var name, e.g. HEYREACH_KEY_ACME"),
        linkedInAccountIds: z.array(z.number().int()),
        allowSend: z.boolean(),
      })
      .optional(),
    drive: z.object({ folderIds: z.array(z.string().min(1)) }).optional(),
    assets: z.array(AssetSchema),
    templates: z.array(TemplateSchema),
    matrix: z.array(MatrixRuleSchema),
    knowledge: z.array(
      z.object({
        id,
        title: z.string().min(1),
        kind: z.enum(["call_transcript", "notes", "faq", "other"]),
        text: z.string(),
        addedAt: z.string(),
      }),
    ),
  })
  .superRefine((c, ctx) => {
    const templateIds = new Set(c.templates.map((t) => t.id));
    const assetIds = new Set(c.assets.map((a) => a.id));
    for (const [list, label] of [
      [c.assets.map((a) => a.id), "asset"],
      [c.templates.map((t) => t.id), "template"],
      [c.matrix.map((r) => r.id), "scenario"],
    ] as const) {
      const dup = list.find((v, i) => list.indexOf(v) !== i);
      if (dup) ctx.addIssue({ code: "custom", message: `duplicate ${label} id "${dup}"` });
    }
    c.matrix.forEach((rule) =>
      rule.options.forEach((o) => {
        if (o.templateId && !templateIds.has(o.templateId)) {
          ctx.addIssue({ code: "custom", message: `scenario "${rule.id}" uses unknown template "${o.templateId}"` });
        }
        o.assetIds
          .filter((a) => !assetIds.has(a))
          .forEach((a) => ctx.addIssue({ code: "custom", message: `scenario "${rule.id}" uses unknown asset "${a}"` }));
      }),
    );
  });
