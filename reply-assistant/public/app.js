// Client chat UI. Link format: /?client=<id>#token=<access token>

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const clientId = params.get("client") || "";

// Move the token out of the URL into session storage so it isn't left in history or screenshots.
const hashToken = new URLSearchParams(location.hash.slice(1)).get("token");
if (hashToken) {
  sessionStorage.setItem(`token:${clientId}`, hashToken);
  history.replaceState(null, "", `${location.pathname}?client=${encodeURIComponent(clientId)}`);
}
const token = sessionStorage.getItem(`token:${clientId}`) || sessionStorage.getItem("adminToken") || "";

const state = { client: null, transcriptId: null, busy: false, assets: new Map() };

async function api(path, opts = {}) {
  const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c !== null && c !== undefined) node.append(c);
  return node;
}

/** Minimal, safe formatting: escape everything, then linkify URLs and **bold**. */
function richText(text) {
  const span = el("span");
  const parts = text.split(/(https?:\/\/[^\s)]+|\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (/^https?:\/\//.test(part)) span.append(el("a", { href: part, target: "_blank", rel: "noopener" }, part));
    else if (/^\*\*[^*]+\*\*$/.test(part)) span.append(el("strong", {}, part.slice(2, -2)));
    else span.append(part);
  }
  return span;
}

const inner = $("messages-inner");
function scrollDown() {
  $("messages").scrollTop = $("messages").scrollHeight;
}

function renderEmpty() {
  inner.replaceChildren(
    el(
      "div",
      { class: "empty" },
      el("p", {}, "Paste a prospect's reply, or pick a conversation on the left."),
      el(
        "div",
        { class: "suggestions" },
        ...[
          "Which LinkedIn replies need an answer today?",
          "They said: \"Interesting, can you send me more info?\"",
          "What should I send someone who says they already have an agency?",
        ].map((s) => el("button", { onclick: () => submit(s) }, s)),
      ),
    ),
  );
}

function renderUser(text) {
  inner.querySelector(".empty")?.remove();
  inner.append(el("div", { class: "msg user" }, text));
}

function renderTool(label) {
  inner.append(el("div", { class: "msg tool" }, `⋯ ${label}`));
}

function renderAssistantText(text, extraClass = "") {
  const node = el("div", { class: `msg assistant ${extraClass}` });
  node.append(richText(text));
  inner.append(node);
  return node;
}

function renderOptions(data) {
  const box = el(
    "div",
    { class: "options" },
    el(
      "div",
      { class: "head" },
      el("span", { class: "scenario" }, data.scenario),
      el("span", { class: `badge ${data.confidence}` }, `${data.confidence} confidence`),
      data.conversation ? el("span", { class: "badge" }, data.conversation.lead_name) : null,
    ),
    el("div", { class: "muted small" }, data.reply_summary),
  );
  data.options.forEach((o) => {
    const textarea = el("textarea", {}, o.message);
    const status = el("span", { class: "status" });
    const chips = o.asset_ids
      .map((id) => state.assets.get(id))
      .filter(Boolean)
      .map((a) => el("a", { class: "chip", href: a.url, target: "_blank", rel: "noopener", title: a.description }, `📎 ${a.title}`));
    const copyBtn = el("button", {
      onclick: async () => {
        const subject = o.channel === "email" && o.subject ? `Subject: ${o.subject}\n\n` : "";
        await navigator.clipboard.writeText(subject + textarea.value);
        status.textContent = "Copied";
        status.className = "status ok";
      },
    }, "Copy");
    const canSend = state.client?.features.send && data.conversation && o.channel === "linkedin";
    const sendBtn = canSend
      ? el("button", {
          class: "primary",
          onclick: async (ev) => {
            const lead = data.conversation.lead_name;
            if (!confirm(`Send this message to ${lead} on LinkedIn now?\n\n${textarea.value}`)) return;
            ev.target.disabled = true;
            try {
              await api("/heyreach/send", {
                method: "POST",
                body: JSON.stringify({
                  account_id: data.conversation.account_id,
                  conversation_id: data.conversation.conversation_id,
                  message: textarea.value,
                }),
              });
              status.textContent = `Sent to ${lead}`;
              status.className = "status ok";
              loadInbox();
            } catch (err) {
              ev.target.disabled = false;
              status.textContent = err.message;
              status.className = "status error";
            }
          },
        }, "Send on LinkedIn")
      : null;
    const speakBtn = "speechSynthesis" in window ? el("button", { onclick: () => speak(textarea.value) }, "🔊") : null;
    box.append(
      el(
        "div",
        { class: "option" },
        el("div", { class: "label" }, `${o.label} `, el("span", { class: "badge" }, o.channel)),
        el("div", { class: "why" }, o.why),
        o.channel === "email" && o.subject ? el("div", { class: "small" }, el("strong", {}, "Subject: "), o.subject) : null,
        textarea,
        el("div", { class: "row" }, ...chips),
        el("div", { class: "row" }, copyBtn, sendBtn, speakBtn, status),
      ),
    );
  });
  inner.append(box);
}

function renderDisplay(items) {
  inner.replaceChildren();
  for (const item of items) {
    if (item.kind === "user") renderUser(item.text);
    else if (item.kind === "assistant") renderAssistantText(item.text);
    else if (item.kind === "tool") renderTool(item.label);
    else if (item.kind === "options") renderOptions(item.data);
  }
  if (!items.length) renderEmpty();
  scrollDown();
}

// ---- Sidebar ----

async function loadChats() {
  const list = await (await api("/transcripts")).json();
  $("chats").replaceChildren(
    ...list.map((t) =>
      el(
        "li",
        { class: t.id === state.transcriptId ? "active" : "", onclick: () => openChat(t.id) },
        el("span", { class: "title" }, t.title),
        el("span", { class: "sub" }, new Date(t.updatedAt).toLocaleString()),
      ),
    ),
  );
  if (!list.length) $("chats").replaceChildren(el("li", { class: "muted small" }, "No chats yet"));
}

async function loadInbox() {
  if (!state.client?.features.heyreach) return;
  $("inbox-section").classList.remove("hidden");
  try {
    const data = await (await api("/inbox")).json();
    $("inbox").replaceChildren(
      ...data.conversations.map((c) =>
        el(
          "li",
          {
            title: c.last_message || "",
            onclick: () => {
              closeSidebar();
              newChat();
              submit(`Help me reply to ${c.lead}${c.company ? ` (${c.company})` : ""}. HeyReach account_id ${c.account_id}, conversation_id ${c.conversation_id}.`);
            },
          },
          el("span", { class: "title" }, c.unread ? el("span", { class: "dot" }) : null, c.lead),
          el("span", { class: "sub" }, c.last_message || ""),
        ),
      ),
    );
    if (!data.conversations.length) $("inbox").replaceChildren(el("li", { class: "muted small" }, "All caught up"));
  } catch (err) {
    $("inbox").replaceChildren(el("li", { class: "muted small" }, err.message));
  }
}

async function openChat(id) {
  closeSidebar();
  const t = await (await api(`/transcripts/${id}`)).json();
  state.transcriptId = t.id;
  $("chat-title").textContent = t.title;
  $("export-btn").classList.remove("hidden");
  renderDisplay(t.display);
  loadChats();
}

function newChat() {
  state.transcriptId = null;
  $("chat-title").textContent = "New chat";
  $("export-btn").classList.add("hidden");
  renderEmpty();
  loadChats();
}

function closeSidebar() {
  $("sidebar").classList.remove("open");
}

// ---- Chat ----

async function submit(text) {
  text = text.trim();
  if (!text || state.busy) return;
  state.busy = true;
  $("send").disabled = true;
  $("input").value = "";
  autosize();
  renderUser(text);
  scrollDown();

  let current = null; // the assistant bubble currently receiving text
  let spoken = "";
  try {
    const res = await api("/chat", { method: "POST", body: JSON.stringify({ message: text, transcriptId: state.transcriptId }) });
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let currentText = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let idx;
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = /^event: (.*)$/m.exec(chunk)?.[1];
        const data = JSON.parse(/^data: (.*)$/m.exec(chunk)?.[1] || "null");
        if (event === "start") {
          state.transcriptId = data.transcriptId;
        } else if (event === "text") {
          if (!current) {
            current = renderAssistantText("");
            currentText = "";
          }
          currentText += data.delta;
          current.replaceChildren(richText(currentText));
          spoken += data.delta;
        } else if (event === "tool") {
          current = null;
          renderTool(data.label);
        } else if (event === "options") {
          current = null;
          renderOptions(data.data);
          spoken += ` I drafted ${data.data.options.length} options for "${data.data.scenario}": ${data.data.options.map((o) => o.label).join("; ")}. `;
        } else if (event === "notice") {
          current = null;
          renderAssistantText(data.text);
          spoken += data.text;
        } else if (event === "done") {
          $("chat-title").textContent = data.title;
          $("export-btn").classList.remove("hidden");
        } else if (event === "error") {
          renderAssistantText(data.error, "error");
        }
        scrollDown();
      }
    }
  } catch (err) {
    renderAssistantText(err.message, "error");
  } finally {
    state.busy = false;
    $("send").disabled = false;
    loadChats();
    if ($("voice-mode").checked && spoken.trim()) speak(spoken);
  }
}

$("composer").addEventListener("submit", (e) => {
  e.preventDefault();
  submit($("input").value);
});
$("input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submit($("input").value);
  }
});
function autosize() {
  const t = $("input");
  t.style.height = "auto";
  t.style.height = `${Math.min(t.scrollHeight, 200)}px`;
}
$("input").addEventListener("input", autosize);
$("new-chat").addEventListener("click", newChat);
$("menu-btn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
$("export-btn").addEventListener("click", async () => {
  if (!state.transcriptId) return;
  const blob = await (await api(`/transcripts/${state.transcriptId}/export`)).blob();
  const a = el("a", { href: URL.createObjectURL(blob), download: `${$("chat-title").textContent || "chat"}.md` });
  a.click();
  URL.revokeObjectURL(a.href);
});

// ---- Voice: dictation in, speech out (browser Web Speech API, no extra services) ----

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognizer = null;

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const clean = text.replace(/https?:\/\/\S+/g, "the link").replace(/\*\*/g, "");
  speechSynthesis.speak(new SpeechSynthesisUtterance(clean));
}

if (!Recognition) {
  $("mic").disabled = true;
  $("mic").title = "Dictation isn't supported in this browser (try Chrome or Safari)";
} else {
  $("mic").addEventListener("click", () => {
    if (recognizer) {
      recognizer.stop();
      return;
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    recognizer = new Recognition();
    recognizer.interimResults = true;
    recognizer.continuous = true;
    recognizer.lang = navigator.language || "en-US";
    const base = $("input").value ? `${$("input").value} ` : "";
    recognizer.onresult = (e) => {
      let text = "";
      for (const r of e.results) text += r[0].transcript;
      $("input").value = base + text;
      autosize();
    };
    recognizer.onend = () => {
      recognizer = null;
      $("mic").classList.remove("listening");
      if ($("voice-mode").checked && $("input").value.trim()) submit($("input").value);
    };
    recognizer.onerror = (e) => {
      if (e.error === "not-allowed") alert("Microphone access was blocked. Allow it in your browser settings to dictate.");
    };
    recognizer.start();
    $("mic").classList.add("listening");
  });
}
if (!("speechSynthesis" in window)) $("voice-toggle-wrap").classList.add("hidden");
try {
  $("voice-mode").checked = localStorage.getItem("voiceMode") === "1";
} catch {}
$("voice-mode").addEventListener("change", () => {
  try {
    localStorage.setItem("voiceMode", $("voice-mode").checked ? "1" : "0");
  } catch {}
  if (!$("voice-mode").checked && "speechSynthesis" in window) speechSynthesis.cancel();
});

// ---- Boot ----

(async function boot() {
  if (!clientId || !token) {
    inner.replaceChildren(el("div", { class: "empty" }, "This link is missing its access key. Ask your RevBoss contact for your chat link."));
    $("composer").classList.add("hidden");
    return;
  }
  try {
    state.client = await (await api("")).json();
  } catch (err) {
    inner.replaceChildren(el("div", { class: "empty" }, err.message));
    $("composer").classList.add("hidden");
    return;
  }
  state.client.assets.forEach((a) => state.assets.set(a.id, a));
  $("client-name").textContent = state.client.name;
  document.title = `${state.client.name} · Reply Assistant`;
  renderEmpty();
  loadChats();
  loadInbox();
})();
