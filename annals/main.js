// frontend/main.ts
var form = document.getElementById("range-form");
var mainBtn = document.getElementById("main-action-btn");
var btnText = document.getElementById("btn-text");
var userStatusDiv = document.getElementById("user-status");
var userLoginSpan = document.getElementById("user-login");
var logoutBtn = document.getElementById("logout-btn");
var resultBox = document.getElementById("result");
var resultContainer = document.getElementById("result-container");
var timeValueInput = document.getElementById("time-value");
var timeUnitSelect = document.getElementById("time-unit");
var datePreview = document.getElementById("date-preview");
var API_BASE = (() => {
  try {
    return '"https://annals-web-production.up.railway.app"';
  } catch {
    return "";
  }
})();
var currentUser = null;
var GITHUB_ICON = `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd"></path></svg>`;
var BOLT_ICON = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" /></svg>`;
async function checkSession() {
  try {
    const res = await fetch(`${API_BASE}/api/session`);
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
        <span>Sign in with GitHub</span>
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
logoutBtn.addEventListener("click", async () => {
  await fetch(`${API_BASE}/auth/logout`, { method: "POST" });
  currentUser = null;
  updateUIState();
  resultContainer.classList.add("hidden");
});
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
async function submitForm() {
  const { startDate, endDate } = calculateDateRange();
  resultContainer.classList.remove("hidden");
  resultBox.textContent = "Processing... (this may take a moment)";
  setTimeout(() => {
    resultContainer.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 100);
  const body = { startDate, endDate };
  try {
    const res = await fetch(`${API_BASE}/api/summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await res.json();
    if (!res.ok) {
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
    const header = `Recap for ${payload.login} (${payload.startDate} to ${payload.endDate}):

`;
    resultBox.textContent = header + (payload.digest || "(No output)");
  } catch (err) {
    resultBox.innerHTML = '<span class="text-error">Connection error.</span>';
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
    window.location.href = `${API_BASE}/auth/login`;
  }
});
calculateDateRange();
init();
