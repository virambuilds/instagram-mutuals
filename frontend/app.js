const API_BASE = ""; // same-origin

let currentResults = {
  not_following_back: [],
  im_not_following_back: [],
  mutuals: [],
};
let activeTab = "not-following-back";

/* ---------------------------------------------------------
   Theme
--------------------------------------------------------- */
const themeToggle = document.getElementById("theme-toggle");
const savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const current = document.body.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem("theme", next);
});

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "dark" ? "🌙" : "☀️";
}

/* ---------------------------------------------------------
   How-to-export instructions (collapsible)
--------------------------------------------------------- */
const howtoToggle = document.getElementById("howto-toggle");
const howtoBody = document.getElementById("howto-body");
const howtoArrow = document.getElementById("howto-arrow");

howtoToggle.addEventListener("click", () => {
  howtoBody.classList.toggle("hidden");
  howtoArrow.textContent = howtoBody.classList.contains("hidden") ? "▸" : "▾";
});

/* ---------------------------------------------------------
   Analyze
--------------------------------------------------------- */
const analyzeBtn = document.getElementById("analyze-btn");
const errorMsg = document.getElementById("error-msg");
const resultsSection = document.getElementById("results-section");
const searchInput = document.getElementById("search-input");

analyzeBtn.addEventListener("click", handleAnalyze);
searchInput.addEventListener("input", () => renderActiveList());

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;

    document.querySelectorAll(".user-list").forEach((ul) => ul.classList.add("hidden"));
    document.getElementById(`list-${activeTab}`).classList.remove("hidden");

    renderActiveList();
  });
});

async function handleAnalyze() {
  hideError();

  const followersInput = document.getElementById("followers-input");
  const followingInput = document.getElementById("following-input");

  if (!followersInput.files.length) return showError("Please choose your followers_*.html file(s).");
  if (!followingInput.files.length) return showError("Please choose your following.html file.");

  const formData = new FormData();
  for (const file of followersInput.files) formData.append("followers_files", file);
  formData.append("following_file", followingInput.files[0]);

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";

  try {
    const res = await fetch(`${API_BASE}/analyze`, { method: "POST", body: formData });
    const data = await res.json();

    if (!res.ok) throw new Error(data.detail || "Something went wrong analyzing your files.");

    currentResults = {
      not_following_back: data.not_following_back,
      im_not_following_back: data.im_not_following_back,
      mutuals: data.mutuals,
    };

    document.getElementById("stat-followers").textContent = data.followers_count;
    document.getElementById("stat-following").textContent = data.following_count;
    document.getElementById("stat-mutuals").textContent = data.mutuals.length;
    document.getElementById("stat-not-back").textContent = data.not_following_back.length;
    document.getElementById("stat-you-not-back").textContent = data.im_not_following_back.length;

    renderDateRangeBanner(data.followers_date_range, data.following_date_range);

    resultsSection.classList.remove("hidden");
    renderActiveList();
  } catch (err) {
    showError(err.message || "Network error — is the backend running?");
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analyze";
  }
}

function renderDateRangeBanner(followersRange, followingRange) {
  const banner = document.getElementById("date-range-banner");
  const text = document.getElementById("date-range-text");

  const range = followersRange || followingRange;
  if (!range) {
    banner.classList.add("hidden");
    return;
  }

  text.innerHTML = `<strong>Partial export detected.</strong> This data only covers ${range.start} to ${range.end}. Followers/following from outside this window won't appear. For full accuracy, request an "All time" export from Instagram.`;
  banner.classList.remove("hidden");
}

function renderActiveList() {
  const key = {
    "not-following-back": "not_following_back",
    "you-not-following-back": "im_not_following_back",
    "mutuals": "mutuals",
  }[activeTab];

  const query = searchInput.value.trim().toLowerCase();
  const listEl = document.getElementById(`list-${activeTab}`);
  const entries = currentResults[key].filter((e) => e.username.includes(query));

  listEl.innerHTML = "";

  if (entries.length === 0) {
    listEl.innerHTML = `<li class="empty-msg">No accounts here.</li>`;
    return;
  }

  for (const entry of entries) {
    const li = document.createElement("li");

    const a = document.createElement("a");
    a.href = `https://www.instagram.com/${entry.username}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = `@${entry.username}`;
    li.appendChild(a);

    if (entry.followed_at) {
      const span = document.createElement("span");
      span.className = "followed-at";
      span.textContent = entry.followed_at;
      li.appendChild(span);
    }

    listEl.appendChild(li);
  }
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove("hidden");
}
function hideError() {
  errorMsg.classList.add("hidden");
}

/* ---------------------------------------------------------
   CSV export
--------------------------------------------------------- */
document.getElementById("export-csv-btn").addEventListener("click", () => {
  const rows = [["username", "category", "followed_at"]];

  const categories = {
    mutuals: "mutual",
    not_following_back: "not_following_back",
    im_not_following_back: "you_dont_follow_back",
  };

  for (const [key, label] of Object.entries(categories)) {
    for (const entry of currentResults[key]) {
      rows.push([entry.username, label, entry.followed_at || ""]);
    }
  }

  const csv = rows.map((r) => r.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "instagram-mutuals.csv";
  a.click();
  URL.revokeObjectURL(url);
});

function escapeCsvCell(cell) {
  const str = String(cell);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/* ---------------------------------------------------------
   Diff between two exports
--------------------------------------------------------- */
const diffToggle = document.getElementById("diff-toggle");
const diffBody = document.getElementById("diff-body");
const diffArrow = document.getElementById("diff-arrow");

diffToggle.addEventListener("click", () => {
  diffBody.classList.toggle("hidden");
  diffArrow.textContent = diffBody.classList.contains("hidden") ? "▸" : "▾";
});

document.getElementById("diff-btn").addEventListener("click", handleDiff);

async function handleDiff() {
  const diffError = document.getElementById("diff-error-msg");
  diffError.classList.add("hidden");

  const previousInput = document.getElementById("diff-previous-input");
  const currentInput = document.getElementById("diff-current-input");

  if (!previousInput.files.length || !currentInput.files.length) {
    diffError.textContent = "Please choose both an older and a newer export file.";
    diffError.classList.remove("hidden");
    return;
  }

  const formData = new FormData();
  formData.append("previous_file", previousInput.files[0]);
  formData.append("current_file", currentInput.files[0]);

  const diffBtn = document.getElementById("diff-btn");
  diffBtn.disabled = true;
  diffBtn.textContent = "Comparing...";

  try {
    const res = await fetch(`${API_BASE}/diff`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Something went wrong comparing files.");

    renderDiffList("diff-added-list", data.added);
    renderDiffList("diff-removed-list", data.removed);
    document.getElementById("diff-output").classList.remove("hidden");
  } catch (err) {
    diffError.textContent = err.message || "Network error.";
    diffError.classList.remove("hidden");
  } finally {
    diffBtn.disabled = false;
    diffBtn.textContent = "Compare";
  }
}

function renderDiffList(elementId, usernames) {
  const listEl = document.getElementById(elementId);
  listEl.innerHTML = "";

  if (usernames.length === 0) {
    listEl.innerHTML = `<li class="empty-msg">No changes.</li>`;
    return;
  }

  for (const username of usernames) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `https://www.instagram.com/${username}`;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = `@${username}`;
    li.appendChild(a);
    listEl.appendChild(li);
  }
}
