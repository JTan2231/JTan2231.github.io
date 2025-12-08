// frontend/main.ts
var form = document.getElementById("range-form");
var mainBtn = document.getElementById("main-action-btn");
var actionButtons = document.getElementById("action-buttons");
var btnText = document.getElementById("btn-text");
var userStatusDiv = document.getElementById("user-status");
var userLoginSpan = document.getElementById("user-login");
var logoutBtn = document.getElementById("logout-btn");
var resultBox = document.getElementById("result");
var resultContainer = document.getElementById("result-container");
var outputWindow = document.getElementById("output-window");
var resizeObserver = new ResizeObserver(() => {
  const maxH = window.innerHeight * 0.6;
  const contentHeight = resultBox.scrollHeight + 80;
  outputWindow.style.height = `${contentHeight}px`;
});
resizeObserver.observe(resultBox);
var timeValueInput = document.getElementById("time-value");
var timeUnitSelect = document.getElementById("time-unit");
var datePreview = document.getElementById("date-preview");
var API_BASE = (() => {
  try {
    return "https://annals-web-production.up.railway.app";
  } catch {
    return "";
  }
})();
var currentUser = null;
var currentStreamController = null;
var GITHUB_ICON = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path></svg>`;
var BOLT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg>`;
var COPY_ICON = `<svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M7.5 5A1.5 1.5 0 019 3.5h7A1.5 1.5 0 0117.5 5v7A1.5 1.5 0 0116 13.5h-7A1.5 1.5 0 017.5 12V5z"/><path d="M4 7.75A1.75 1.75 0 015.75 6H6v7a3 3 0 003 3h7v.25A1.75 1.75 0 0114.25 18h-8.5A1.75 1.75 0 014 16.25z"/></svg>`;
var CHECK_ICON = `<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>`;
var CODE_ICON = `<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4a2 2 0 0 0 -2 2v3a2 2 0 0 1 -2 2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2M17 4a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2v3a2 2 0 0 1 -2 2" /></svg>`;
function parseSseChunk(raw) {
  let event = "message";
  const dataLines = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }
  if (dataLines.length === 0)
    return { event, data: null };
  const joined = dataLines.join(`
`);
  try {
    return { event, data: joined ? JSON.parse(joined) : null };
  } catch {
    return { event, data: null };
  }
}
async function checkSession() {
  try {
    const res = await fetch(`${API_BASE}/api/session`, {
      credentials: "include"
    });
    const data = await res.json();
    return data.authenticated ? data.user.login : null;
  } catch (err) {
    return null;
  }
}
function updateUIState() {
  if (currentUser) {
    mainBtn.innerHTML = `
      <div class="relative flex items-center gap-2">
        ${BOLT_ICON} 
        <span>Generate Recap</span>
      </div>`;
    userStatusDiv.classList.remove("hidden");
    userLoginSpan.textContent = currentUser;
  } else {
    mainBtn.innerHTML = `
      <div class="relative flex items-center gap-2">
        ${GITHUB_ICON} 
        <span>Connect with GitHub</span>
      </div>`;
    userStatusDiv.classList.add("hidden");
  }
}
async function init() {
  currentUser = await checkSession();
  updateUIState();
  const pending = localStorage.getItem("pending_recap");
  if (pending && currentUser) {
    try {
      const { value, unit } = JSON.parse(pending);
      if (value && unit) {
        timeValueInput.value = value;
        timeUnitSelect.value = unit;
        calculateDateRange();
        localStorage.removeItem("pending_recap");
      }
    } catch (e) {
      localStorage.removeItem("pending_recap");
    }
  }
}
function calculateDateRange() {
  const now = new Date;
  const endDate = now.toISOString().split("T")[0];
  const value = parseInt(timeValueInput.value) || 0;
  const unit = timeUnitSelect.value;
  const start = new Date(now);
  if (unit === "days") {
    start.setDate(now.getDate() - value);
  } else if (unit === "weeks") {
    start.setDate(now.getDate() - value * 7);
  } else if (unit === "months") {
    start.setMonth(now.getMonth() - value);
  } else if (unit === "years") {
    start.setFullYear(now.getFullYear() - value);
  }
  const startDate = start.toISOString().split("T")[0];
  const options = { month: "short", day: "numeric", year: "numeric" };
  const startStr = start.toLocaleDateString(undefined, options);
  const endStr = now.toLocaleDateString(undefined, options);
  datePreview.textContent = `${startStr} → ${endStr}`;
  datePreview.style.opacity = "1";
  return { startDate, endDate };
}
function createChunkElement(text, title) {
  const div = document.createElement("div");
  div.className = "whitespace-pre-wrap fade-in";
  const content = document.createElement("div");
  content.textContent = text;
  div.appendChild(content);
  return { div, content };
}
function createIconCopyButton(title, icon, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "p-1 text-black/40 hover:text-black transition-colors relative group rounded-md hover:bg-black/5";
  btn.title = title;
  btn.innerHTML = icon;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    onClick(btn);
  });
  return btn;
}
async function copyIconFeedback(btn, value) {
  let fallbackTextarea = null;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      fallbackTextarea = document.createElement("textarea");
      fallbackTextarea.value = value;
      fallbackTextarea.style.position = "fixed";
      fallbackTextarea.style.left = "-9999px";
      fallbackTextarea.style.top = "0";
      document.body.appendChild(fallbackTextarea);
      fallbackTextarea.focus();
      fallbackTextarea.select();
      document.execCommand("copy");
    }
    const original = btn.innerHTML;
    btn.innerHTML = CHECK_ICON;
    btn.classList.add("text-green-600");
    btn.classList.remove("text-black/40", "hover:text-black");
    setTimeout(() => {
      btn.innerHTML = original;
      btn.classList.remove("text-green-600");
      btn.classList.add("text-black/40", "hover:text-black");
    }, 1200);
  } catch (err) {
    console.error("Copy failed", err);
  } finally {
    fallbackTextarea?.remove();
  }
}
async function submitForm() {
  const { startDate, endDate } = calculateDateRange();
  if (resultContainer.classList.contains("hidden")) {
    resultContainer.classList.remove("hidden");
    resultContainer.offsetWidth;
    resultContainer.classList.remove("max-h-0", "opacity-0", "translate-y-4");
    resultContainer.classList.add("max-h-[1000px]", "opacity-100", "translate-y-0");
  }
  actionButtons.classList.remove("max-h-[500px]", "opacity-100");
  actionButtons.classList.add("max-h-0", "opacity-0", "pointer-events-none");
  outputWindow.style.height = "100px";
  resultBox.innerHTML = "";
  const initialStatus = document.createElement("div");
  initialStatus.className = "fade-in text-amber-700/80";
  initialStatus.textContent = "Processing... (streaming updates)";
  resultBox.appendChild(initialStatus);
  setTimeout(() => {
    resultContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
  if (currentStreamController) {
    currentStreamController.abort();
  }
  const controller = new AbortController;
  currentStreamController = controller;
  const body = { startDate, endDate };
  try {
    const res = await fetch(`${API_BASE}/api/summary`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream"
      },
      credentials: "include",
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      const message = payload.error || "Request failed";
      if (res.status === 401) {
        currentUser = null;
        updateUIState();
        resultBox.innerHTML = '<span class="text-error">Session expired. Please sign in again.</span>';
      } else {
        resultBox.innerHTML = '<span class="text-error">' + message + "</span>";
      }
      return;
    }
    if (!res.body) {
      resultBox.innerHTML = '<span class="text-error">No response stream available.</span>';
      return;
    }
    let hasClearedStatus = false;
    const renderedChunks = new Map;
    let mergeEl = null;
    let finalDigest = null;
    let finalMeta = null;
    let summaryReadyPayload = null;
    const render = () => {
      if (!hasClearedStatus && (renderedChunks.size > 0 || mergeEl || finalDigest !== null)) {
        resultBox.innerHTML = "";
        hasClearedStatus = true;
      }
      if (finalDigest !== null) {
        const details = document.createElement("details");
        details.className = "group mb-2 text-xs opacity-70";
        const logsContainer = document.createElement("div");
        logsContainer.className = "pl-4 border-l border-black/10 space-y-4 overflow-hidden transition-all duration-700 ease-in-out origin-top";
        const summary = document.createElement("summary");
        summary.className = "cursor-pointer mb-2 list-none font-mono-custom uppercase tracking-wider flex items-center justify-between gap-2 group/summary";
        const leftSide = document.createElement("span");
        leftSide.className = "flex items-center gap-2 opacity-60 group-hover/summary:text-black group-hover/summary:opacity-100 transition-all";
        leftSide.innerHTML = `<span>View Compactions</span> <span class="group-open:rotate-180 transition-transform duration-300">▼</span>`;
        summary.appendChild(leftSide);
        const rightSide = document.createElement("div");
        rightSide.className = "flex items-center gap-1";
        const copySummaryBtn = createIconCopyButton("Copy Summary", COPY_ICON, (btn) => {
          if (finalDigest)
            copyIconFeedback(btn, finalDigest);
        });
        rightSide.appendChild(copySummaryBtn);
        if (finalMeta) {
          const copyJsonBtn = createIconCopyButton("Copy Metadata JSON", CODE_ICON, (btn) => {
            copyIconFeedback(btn, JSON.stringify(finalMeta, null, 2));
          });
          rightSide.appendChild(copyJsonBtn);
        }
        summary.appendChild(rightSide);
        summary.addEventListener("click", (e) => {
          e.preventDefault();
          if (details.open) {
            logsContainer.style.maxHeight = logsContainer.scrollHeight + "px";
            logsContainer.style.opacity = "1";
            logsContainer.offsetWidth;
            logsContainer.style.maxHeight = "0px";
            logsContainer.style.opacity = "0";
            logsContainer.addEventListener("transitionend", () => {
              if (logsContainer.style.maxHeight === "0px") {
                details.open = false;
              }
            }, { once: true });
          } else {
            details.open = true;
            logsContainer.style.maxHeight = "0px";
            logsContainer.style.opacity = "0";
            logsContainer.offsetWidth;
            logsContainer.style.maxHeight = logsContainer.scrollHeight + "px";
            logsContainer.style.opacity = "1";
            logsContainer.addEventListener("transitionend", () => {
              if (logsContainer.style.maxHeight !== "0px") {
                logsContainer.style.maxHeight = "none";
              }
            }, { once: true });
          }
        });
        details.appendChild(summary);
        renderedChunks.forEach((el) => {
          logsContainer.appendChild(el.div);
        });
        if (mergeEl) {
          logsContainer.appendChild(mergeEl.div);
        }
        details.appendChild(logsContainer);
        resultBox.innerHTML = "";
        resultBox.appendChild(details);
        const finalOutputDiv = document.createElement("div");
        finalOutputDiv.className = "text-base leading-relaxed whitespace-pre-wrap mt-2 opacity-0 transition-opacity duration-1000 ease-in-out";
        finalOutputDiv.textContent = finalDigest;
        resultBox.appendChild(finalOutputDiv);
        details.open = true;
        const fullHeight = logsContainer.scrollHeight;
        logsContainer.style.maxHeight = fullHeight + "px";
        logsContainer.style.opacity = "1";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            logsContainer.style.maxHeight = "0px";
            logsContainer.style.opacity = "0";
            finalOutputDiv.classList.remove("opacity-0");
            finalOutputDiv.classList.add("opacity-100");
          });
        });
        logsContainer.addEventListener("transitionend", () => {
          if (logsContainer.style.maxHeight === "0px") {
            details.open = false;
          }
        }, { once: true });
        return;
      }
      renderedChunks.forEach((el) => {
        if (!resultBox.contains(el.div)) {
          resultBox.appendChild(el.div);
        }
      });
      if (mergeEl) {
        if (!resultBox.contains(mergeEl.div)) {
          resultBox.appendChild(mergeEl.div);
        }
      }
    };
    const reader = res.body.getReader();
    const decoder = new TextDecoder;
    let buffer = "";
    let done = false;
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone)
        break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf(`

`);
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseChunk(rawEvent);
        if (parsed) {
          const { event, data } = parsed;
          if (event === "chunk_summary_finish" && data?.output) {
            const idx = typeof data.index === "number" ? data.index : renderedChunks.size + 1;
            const total = data.total;
            if (!renderedChunks.has(idx)) {
              const title = total ? `Chunk ${idx}/${total}` : `Chunk ${idx}`;
              const el = createChunkElement(data.output, title);
              renderedChunks.set(idx, el);
            } else {
              renderedChunks.get(idx).content.textContent = data.output;
            }
            render();
          } else if (event === "summary_ready") {
            summaryReadyPayload = data;
          } else if (event === "summary_merge_result" && data?.output) {
            if (!mergeEl) {
              mergeEl = createChunkElement(data.output, "Merging Draft");
            } else {
              mergeEl.content.textContent = data.output;
            }
            render();
          } else if (event === "final") {
            finalDigest = data?.digest || (mergeEl ? mergeEl.content.textContent : null);
            const mergedSummary = summaryReadyPayload ? { ...data?.summary ?? {}, ...summaryReadyPayload } : data?.summary;
            finalMeta = {
              ...data,
              ...mergedSummary ? { summary: mergedSummary } : {}
            };
            render();
            done = true;
            await reader.cancel().catch(() => {
            });
            break;
          } else if (event === "error") {
            const message = data?.message || "Request failed";
            if (data?.status === 401) {
              currentUser = null;
              updateUIState();
            }
            const errDiv = document.createElement("div");
            errDiv.className = "text-error fade-in mt-4";
            errDiv.textContent = message;
            resultBox.appendChild(errDiv);
            done = true;
            await reader.cancel().catch(() => {
            });
            break;
          }
        }
        boundary = buffer.indexOf(`

`);
      }
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      const errDiv = document.createElement("div");
      errDiv.className = "text-error fade-in mt-4";
      errDiv.textContent = "Connection error.";
      resultBox.appendChild(errDiv);
    }
  } finally {
    currentStreamController = null;
  }
}
timeValueInput.addEventListener("input", calculateDateRange);
timeUnitSelect.addEventListener("change", calculateDateRange);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (currentUser) {
    await submitForm();
  } else {
    const state = {
      value: timeValueInput.value,
      unit: timeUnitSelect.value
    };
    localStorage.setItem("pending_recap", JSON.stringify(state));
    const params = new URLSearchParams({
      redirect: window.location.href
    });
    window.location.href = `${API_BASE}/auth/login?${params.toString()}`;
  }
});
calculateDateRange();
init();
