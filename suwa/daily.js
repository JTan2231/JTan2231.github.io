const challengeURL = "https://suwa-backend-production.up.railway.app/v1/web/daily-challenge";
const completionKey = "suwa.daily-completion";

const sentence = document.querySelector("#sentence");
const form = document.querySelector("#translation-form");
const translation = document.querySelector("#translation");
const reference = document.querySelector("#reference");
const referenceText = document.querySelector("#reference-text");
const submittedTranslation = document.querySelector("#submitted-translation");
const status = document.querySelector("#challenge-status");
const attribution = document.querySelector("#attribution");
const sourceLink = document.querySelector("#source-link");

let challenge;
let loading = false;

function completionID() {
  return `${challenge.date}/${challenge.id}`;
}

function showStorageError() {
  form.hidden = true;
  reference.hidden = true;
  status.textContent = "Allow browser storage to use the daily challenge.";
}

function showCompletion() {
  if (!challenge) return false;

  try {
    const saved = localStorage.getItem(completionKey);
    const completed = saved === completionID();
    const stale = saved?.slice(0, 10) > challenge.date;
    form.hidden = completed || stale;
    reference.hidden = !completed;
    referenceText.textContent = completed ? challenge.reference_translation : "";
    status.textContent = stale ? "A new daily challenge is available. Reload the page to continue." : "";
    if (completed) {
      form.reset();
    } else {
      submittedTranslation.textContent = "";
    }
    return !form.hidden;
  } catch {
    showStorageError();
    return false;
  }
}

async function loadChallenge() {
  if (loading) return;
  loading = true;

  try {
    const response = await fetch(challengeURL, { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error("Daily challenge request failed");

    const next = await response.json();
    if (!next.id || !next.date || !next.sentence || !next.reference_translation) {
      throw new Error("Daily challenge is incomplete");
    }

    if (next.id !== challenge?.id || next.date !== challenge?.date) {
      form.reset();
      translation.setCustomValidity("");
      submittedTranslation.textContent = "";
      sentence.textContent = next.sentence;
      const { title, authors, source_url: sourceURL } = next.attribution ?? {};
      sourceLink.textContent = [title, authors].filter(Boolean).join(" · ");
      if (sourceURL && /^https?:\/\//i.test(sourceURL)) {
        sourceLink.href = sourceURL;
      } else {
        sourceLink.removeAttribute("href");
      }
      attribution.hidden = !sourceLink.textContent;
    }

    challenge = next;
    showCompletion();
  } catch {
    if (!challenge) {
      status.textContent = "The daily challenge is unavailable. Reload the page to try again.";
    }
  } finally {
    loading = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!showCompletion()) return;

  if (!translation.value.trim()) {
    translation.setCustomValidity("Enter your translation.");
    translation.reportValidity();
    return;
  }

  try {
    localStorage.setItem(completionKey, completionID());
  } catch {
    showStorageError();
    return;
  }

  submittedTranslation.textContent = `“${translation.value}”`;
  showCompletion();
  reference.focus();
});

translation.addEventListener("input", () => translation.setCustomValidity(""));
window.addEventListener("storage", (event) => {
  if (event.key === completionKey || event.key === null) {
    showCompletion();
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    showCompletion();
    loadChallenge();
  }
});
window.addEventListener("focus", loadChallenge);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") loadChallenge();
});

status.textContent = "Loading the daily challenge…";
loadChallenge();
