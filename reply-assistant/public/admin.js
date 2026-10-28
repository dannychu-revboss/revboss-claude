// Admin UI: set up each client's profile, follow-up matrix, templates, assets and knowledge.

const $ = (id) => document.getElementById(id);
const state = { clients: [], client: null, tab: "matrix", dirty: false };

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "value") node.value = v ?? "";
    else if (k === "checked") node.checked = Boolean(v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
  return node;
}

async function api(path, opts = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionStorage.getItem("adminToken") || ""}` },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) {
    showLogin();
    throw new Error("Sign in again");
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function setStatus(text, kind = "") {
  $("save-status").textContent = text;
  $("save-status").className = `status ${kind}`;
}

function markDirty() {
  state.dirty = true;
  setStatus("Unsaved changes");
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `item-${Date.now()}`;
const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

// ---- Generic field helpers (bind an input to obj[key]) ----

function text(obj, key, label, opts = {}) {
  const input = el(opts.multiline ? "textarea" : "input", {
    value: opts.get ? opts.get(obj[key]) : obj[key],
    rows: opts.rows || 3,
    placeholder: opts.placeholder || "",
    oninput: (e) => {
      const v = e.target.value;
      obj[key] = opts.set ? opts.set(v) : opts.optional && !v ? undefined : v;
      markDirty();
    },
  });
  return el("label", { class: "field" }, el("span", {}, label), input);
}

function select(obj, key, label, choices, onchange) {
  const s = el(
    "select",
    {
      onchange: (e) => {
        obj[key] = e.target.value || undefined;
        markDirty();
        onchange?.();
      },
    },
    ...choices.map(([value, name]) => el("option", { value }, name)),
  );
  s.value = obj[key] ?? "";
  return el("label", { class: "field" }, el("span", {}, label), s);
}

function removeBtn(list, item) {
  return el("button", { class: "danger", type: "button", onclick: () => { list.splice(list.indexOf(item), 1); markDirty(); render(); } }, "Remove");
}

// ---- Tabs ----

const TABS = [
  ["matrix", "Follow-up matrix"],
  ["templates", "Templates"],
  ["assets", "Assets"],
  ["knowledge", "Knowledge & transcripts"],
  ["profile", "Profile & integrations"],
  ["json", "JSON"],
];

function render() {
  const c = state.client;
  const editor = $("editor");
  if (!c) return editor.replaceChildren(el("p", { class: "muted" }, "Create a client to get started."));
  const link = `${location.origin}/?client=${encodeURIComponent(c.id)}#token=${encodeURIComponent(c.accessToken)}`;
  editor.replaceChildren(
    el(
      "div",
      { class: "card" },
      el("div", { class: "bar" }, el("strong", {}, "Client chat link"), el("span", { class: "muted small" }, "Share privately with the client. Anyone with this link can use this client's assistant.")),
      el("code", { class: "link" }, link),
      el(
        "div",
        { class: "bar", style: "margin-top:10px;margin-bottom:0" },
        el("button", { onclick: () => navigator.clipboard.writeText(link) }, "Copy link"),
        el("button", { onclick: () => { sessionStorage.setItem(`token:${c.id}`, c.accessToken); window.open(`/?client=${encodeURIComponent(c.id)}`, "_blank"); } }, "Open chat"),
        el("button", { onclick: rotateToken }, "Rotate link"),
        el("label", { class: "toggle" }, el("input", { type: "checkbox", checked: c.active, onchange: (e) => { c.active = e.target.checked; markDirty(); } }), "Active"),
      ),
    ),
    el("div", { class: "tabs" }, ...TABS.map(([id, name]) => el("button", { class: state.tab === id ? "active" : "", onclick: () => { state.tab = id; render(); } }, name))),
    { matrix: renderMatrix, templates: renderTemplates, assets: renderAssets, knowledge: renderKnowledge, profile: renderProfile, json: renderJson }[state.tab](c),
  );
}

function renderMatrix(c) {
  const templateChoices = [["", "(no template)"], ...c.templates.map((t) => [t.id, `${t.name} [${t.channel}]`])];
  const intents = ["positive", "curious", "objection", "timing", "referral", "negative", "out_of_office", "other"].map((i) => [i, i.replace(/_/g, " ")]);
  return el(
    "div",
    {},
    el("p", { class: "muted small" }, "Each scenario says: if the reply looks like this, offer one of these options. The assistant classifies each reply into a scenario and drafts the options using the linked templates and assets. Edits apply to new chats."),
    ...c.matrix.map((rule) =>
      el(
        "div",
        { class: "card" },
        el(
          "div",
          { class: "grid" },
          text(rule, "scenario", "Scenario (if the reply is…)", { placeholder: "Interested: wants more info" }),
          text(rule, "id", "ID", { set: slug }),
          select(rule, "intent", "Intent", intents),
        ),
        el(
          "div",
          { class: "grid", style: "margin-top:10px" },
          text(rule, "signals", "Example phrases (one per line)", { multiline: true, get: (v) => v.join("\n"), set: lines }),
          text(rule, "goal", "Goal of the follow-up", { multiline: true }),
          text(rule, "avoid", "Avoid", { multiline: true, optional: true }),
        ),
        ...rule.options.map((o, i) =>
          el(
            "div",
            { class: "option-edit" },
            el("div", { class: "grid" }, text(o, "label", `Option ${i + 1}`), select(o, "templateId", "Template", templateChoices)),
            el(
              "div",
              { class: "checks", style: "margin:8px 0" },
              el("span", { class: "muted small" }, "Assets:"),
              ...c.assets.map((a) =>
                el(
                  "label",
                  {},
                  el("input", {
                    type: "checkbox",
                    checked: o.assetIds.includes(a.id),
                    onchange: (e) => {
                      o.assetIds = e.target.checked ? [...o.assetIds, a.id] : o.assetIds.filter((x) => x !== a.id);
                      markDirty();
                    },
                  }),
                  `${a.title} (${a.type.replace(/_/g, " ")})`,
                ),
              ),
              c.assets.length ? null : el("span", { class: "muted small" }, "add assets in the Assets tab"),
            ),
            text(o, "guidance", "Guidance", { optional: true, placeholder: "When to pick this option, what to emphasize" }),
            el("div", { style: "margin-top:6px" }, removeBtn(rule.options, o)),
          ),
        ),
        el(
          "div",
          { class: "bar", style: "margin:12px 0 0" },
          el("button", { onclick: () => { rule.options.push({ label: "", assetIds: [] }); markDirty(); render(); } }, "Add option"),
          removeBtn(c.matrix, rule),
        ),
      ),
    ),
    el("button", { class: "primary", onclick: () => { c.matrix.push({ id: `scenario-${c.matrix.length + 1}`, scenario: "", intent: "curious", signals: [], goal: "", options: [{ label: "", assetIds: [] }] }); markDirty(); render(); } }, "Add scenario"),
  );
}

function renderTemplates(c) {
  return el(
    "div",
    {},
    el("p", { class: "muted small" }, "Use placeholders like {{first_name}}, {{company}}, {{asset_link}}, {{calendar_link}}. The assistant fills them in per lead."),
    ...c.templates.map((t) =>
      el(
        "div",
        { class: "card" },
        el("div", { class: "grid" }, text(t, "name", "Name"), text(t, "id", "ID", { set: slug }), select(t, "channel", "Channel", [["linkedin", "LinkedIn"], ["email", "Email"], ["any", "Any"]])),
        el("div", { style: "margin-top:10px" }, text(t, "body", "Message", { multiline: true, rows: 6 })),
        el("div", { style: "margin-top:10px" }, text(t, "notes", "Notes", { optional: true })),
        el("div", { style: "margin-top:10px" }, removeBtn(c.templates, t)),
      ),
    ),
    el("button", { class: "primary", onclick: () => { c.templates.push({ id: `template-${c.templates.length + 1}`, name: "", channel: "linkedin", body: "" }); markDirty(); render(); } }, "Add template"),
  );
}

function renderAssets(c) {
  const types = [["one_sheet", "One sheet"], ["lead_magnet", "Lead magnet"], ["tear_sheet", "Tear sheet"], ["case_study", "Case study"], ["other", "Other"]];
  const results = el("div");
  const q = el("input", { placeholder: "Search this client's Drive folders…" });
  const search = async () => {
    try {
      const files = await api(`/clients/${encodeURIComponent(c.id)}/drive-search?q=${encodeURIComponent(q.value)}`);
      results.replaceChildren(
        ...files.map((f) =>
          el(
            "div",
            { class: "bar", style: "margin:6px 0" },
            el("a", { href: f.url, target: "_blank", rel: "noopener" }, f.name),
            el("button", { onclick: () => { c.assets.push({ id: slug(f.name), type: "other", title: f.name, description: f.description || "", url: f.url, driveFileId: f.file_id }); markDirty(); render(); } }, "Add as asset"),
          ),
        ),
      );
      if (!files.length) results.replaceChildren(el("p", { class: "muted small" }, "No files found."));
    } catch (err) {
      results.replaceChildren(el("p", { class: "status error" }, err.message));
    }
  };
  return el(
    "div",
    {},
    el("div", { class: "card" }, el("strong", {}, "Add from Google Drive"), el("div", { class: "bar", style: "margin:8px 0 0" }, q, el("button", { onclick: search }, "Search")), results),
    ...c.assets.map((a) =>
      el(
        "div",
        { class: "card" },
        el("div", { class: "grid" }, text(a, "title", "Title"), text(a, "id", "ID", { set: slug }), select(a, "type", "Type", types)),
        el(
          "div",
          { class: "grid", style: "margin-top:10px" },
          text(a, "url", "Link (shareable)"),
          text(a, "driveFileId", "Drive file ID (lets the assistant read it)", { optional: true }),
        ),
        el(
          "div",
          { class: "grid", style: "margin-top:10px" },
          text(a, "description", "What it is", { multiline: true }),
          text(a, "whenToUse", "When to use it", { multiline: true, optional: true }),
        ),
        el("div", { style: "margin-top:10px" }, removeBtn(c.assets, a)),
      ),
    ),
    el("button", { class: "primary", onclick: () => { c.assets.push({ id: `asset-${c.assets.length + 1}`, type: "one_sheet", title: "", description: "", url: "" }); markDirty(); render(); } }, "Add asset"),
  );
}

function renderKnowledge(c) {
  const kinds = [["call_transcript", "Call transcript"], ["notes", "Notes"], ["faq", "FAQ"], ["other", "Other"]];
  const fileInput = el("input", {
    type: "file",
    accept: ".txt,.md,.vtt,.srt,text/*",
    multiple: true,
    onchange: async (e) => {
      for (const file of e.target.files) {
        c.knowledge.push({ id: slug(file.name), title: file.name, kind: "call_transcript", text: await file.text(), addedAt: new Date().toISOString() });
      }
      markDirty();
      render();
    },
  });
  return el(
    "div",
    {},
    el("p", { class: "muted small" }, "Call transcripts, positioning notes and FAQs the assistant should know. Everything here is included in every chat, so keep it relevant."),
    el("div", { class: "card" }, el("strong", {}, "Upload transcripts (.txt, .md, .vtt, .srt)"), el("div", { style: "margin-top:8px" }, fileInput)),
    ...c.knowledge.map((k) =>
      el(
        "div",
        { class: "card" },
        el("div", { class: "grid" }, text(k, "title", "Title"), select(k, "kind", "Kind", kinds)),
        el("div", { style: "margin-top:10px" }, text(k, "text", `Text (${k.text.length.toLocaleString()} characters)`, { multiline: true, rows: 8 })),
        el("div", { style: "margin-top:10px" }, removeBtn(c.knowledge, k)),
      ),
    ),
    el("button", { class: "primary", onclick: () => { c.knowledge.push({ id: `doc-${Date.now()}`, title: "", kind: "notes", text: "", addedAt: new Date().toISOString() }); markDirty(); render(); } }, "Add document"),
  );
}

function renderProfile(c) {
  return el(
    "div",
    {},
    el(
      "div",
      { class: "card" },
      el("strong", {}, "Profile"),
      el("div", { class: "grid", style: "margin-top:10px" }, text(c, "name", "Client name"), text(c.profile, "company", "Company"), text(c.profile, "calendarLink", "Calendar link", { optional: true })),
      el(
        "div",
        { class: "grid", style: "margin-top:10px" },
        text(c.profile, "offer", "What they sell", { multiline: true }),
        text(c.profile, "audience", "Who they sell to", { multiline: true }),
        text(c.profile, "voice", "Voice & tone rules", { multiline: true }),
        text(c.profile, "signature", "Email signature", { multiline: true, optional: true }),
      ),
    ),
    el(
      "div",
      { class: "card" },
      el("strong", {}, "HeyReach (LinkedIn inbox)"),
      el(
        "label",
        { class: "toggle", style: "margin-left:12px" },
        el("input", { type: "checkbox", checked: Boolean(c.heyreach), onchange: (e) => { c.heyreach = e.target.checked ? { apiKeyEnv: `HEYREACH_KEY_${c.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`, linkedInAccountIds: [], allowSend: false } : undefined; markDirty(); render(); } }),
        "Connected",
      ),
      c.heyreach
        ? el(
            "div",
            {},
            el("div", { class: "grid", style: "margin-top:10px" },
              text(c.heyreach, "apiKeyEnv", "Env var holding the API key"),
              text(c.heyreach, "linkedInAccountIds", "Sender account IDs (comma separated, blank = all)", {
                get: (v) => v.join(", "),
                set: (v) => v.split(/[,\s]+/).filter(Boolean).map(Number).filter(Number.isInteger),
              }),
            ),
            el("label", { class: "toggle", style: "margin-top:10px" }, el("input", { type: "checkbox", checked: c.heyreach.allowSend, onchange: (e) => { c.heyreach.allowSend = e.target.checked; markDirty(); } }), "Allow sending from the chat (each send needs a click + confirm)"),
            el("p", { class: "muted small" }, "API keys are never stored here. Set the env var on the server, then restart it."),
          )
        : null,
    ),
    el(
      "div",
      { class: "card" },
      el("strong", {}, "Google Drive"),
      el(
        "label",
        { class: "toggle", style: "margin-left:12px" },
        el("input", { type: "checkbox", checked: Boolean(c.drive), onchange: (e) => { c.drive = e.target.checked ? { folderIds: [] } : undefined; markDirty(); render(); } }),
        "Connected",
      ),
      c.drive
        ? el(
            "div",
            { style: "margin-top:10px" },
            text(c.drive, "folderIds", "Folder IDs or links (one per line)", {
              multiline: true,
              get: (v) => v.join("\n"),
              set: (v) => lines(v).map((x) => /folders\/([\w-]+)/.exec(x)?.[1] || x),
            }),
            el("p", { class: "muted small" }, "Share each folder with the server's service account email (Viewer). Subfolders are included."),
          )
        : null,
    ),
  );
}

function renderJson(c) {
  const area = el("textarea", { rows: 30, style: "font-family:ui-monospace,monospace;font-size:13px" });
  area.value = JSON.stringify(c, null, 2);
  return el(
    "div",
    {},
    el("p", { class: "muted small" }, "Bulk-edit or copy a matrix between clients. Apply, then Save."),
    area,
    el("div", { style: "margin-top:8px" }, el("button", { onclick: () => {
      try {
        const parsed = JSON.parse(area.value);
        state.client = { ...parsed, id: c.id, accessToken: c.accessToken };
        markDirty();
        render();
      } catch (err) {
        setStatus(`Invalid JSON: ${err.message}`, "error");
      }
    } }, "Apply JSON")),
  );
}

// ---- Actions ----

async function loadClients(selectId) {
  state.clients = await api("/clients");
  const sel = $("client-select");
  sel.replaceChildren(...state.clients.map((c) => el("option", { value: c.id }, `${c.name}${c.active ? "" : " (inactive)"}`)));
  const id = selectId || state.client?.id || state.clients[0]?.id;
  if (id) sel.value = id;
  state.client = state.clients.find((c) => c.id === id) ? structuredClone(state.clients.find((c) => c.id === id)) : null;
  state.dirty = false;
  setStatus("");
  render();
}

async function save() {
  if (!state.client) return;
  try {
    const saved = await api(`/clients/${encodeURIComponent(state.client.id)}`, { method: "PUT", body: JSON.stringify(state.client) });
    state.client = saved;
    state.dirty = false;
    setStatus("Saved", "ok");
    await loadClients(saved.id);
    setStatus("Saved", "ok");
  } catch (err) {
    setStatus(err.message, "error");
  }
}

async function rotateToken() {
  if (!confirm("Rotate the link? The old link stops working immediately.")) return;
  const { accessToken } = await api(`/clients/${encodeURIComponent(state.client.id)}/rotate-token`, { method: "POST" });
  state.client.accessToken = accessToken;
  render();
}

function showLogin() {
  $("login").classList.remove("hidden");
  $("workspace").classList.add("hidden");
}

$("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  sessionStorage.setItem("adminToken", $("admin-token").value);
  try {
    await loadClients();
    $("login").classList.add("hidden");
    $("workspace").classList.remove("hidden");
  } catch (err) {
    alert(err.message);
  }
});
$("client-select").addEventListener("change", (e) => {
  if (state.dirty && !confirm("Discard unsaved changes?")) {
    e.target.value = state.client.id;
    return;
  }
  loadClients(e.target.value);
});
$("save").addEventListener("click", save);
$("new-client").addEventListener("click", async () => {
  const name = prompt("Client name");
  if (!name) return;
  const id = prompt("Short id (lowercase, used in the link)", slug(name));
  if (!id) return;
  try {
    const c = await api("/clients", { method: "POST", body: JSON.stringify({ id, name }) });
    state.tab = "profile";
    await loadClients(c.id);
  } catch (err) {
    alert(err.message);
  }
});
window.addEventListener("beforeunload", (e) => {
  if (state.dirty) e.preventDefault();
});

if (sessionStorage.getItem("adminToken")) {
  loadClients().then(() => $("workspace").classList.remove("hidden")).catch(() => {});
} else {
  showLogin();
}
