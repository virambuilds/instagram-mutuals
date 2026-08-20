const API_BASE = ""; // same-origin

let currentResults = {
  not_following_back: [],
  im_not_following_back: [],
  mutuals: [],
};
let activeTab = "not-following-back";
let currentSort = "alpha";

/* ---------------------------------------------------------
   Theme
--------------------------------------------------------- */
const themeToggle = document.getElementById("theme-toggle");
applyTheme(localStorage.getItem("theme") || "dark");

themeToggle.addEventListener("click", () => {
  const next = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem("theme", next);
});

function applyTheme(theme) {
  document.body.setAttribute("data-theme", theme);
}

/* ---------------------------------------------------------
   Collapsible sections (how-to, diff)
--------------------------------------------------------- */
function wireCollapsible(toggleId, bodyId, arrowId) {
  const toggle = document.getElementById(toggleId);
  const body = document.getElementById(bodyId);
  const arrow = document.getElementById(arrowId);
  toggle.addEventListener("click", () => {
    body.classList.toggle("hidden");
    arrow.classList.toggle("open");
  });
}
wireCollapsible("howto-toggle", "howto-body", "howto-arrow");
wireCollapsible("diff-toggle", "diff-body", "diff-arrow");

/* ---------------------------------------------------------
   Zip upload flow
--------------------------------------------------------- */
document.getElementById("inspect-zip-btn").addEventListener("click", handleInspectZip);
document.getElementById("analyze-zip-btn").addEventListener("click", handleAnalyzeZip);

async function handleInspectZip() {
  hideError();
  const zipInput = document.getElementById("zip-input");
  if (!zipInput.files.length) return showError("Please choose your Instagram export .zip file.");

  const formData = new FormData();
  formData.append("zip_file", zipInput.files[0]);

  const btn = document.getElementById("inspect-zip-btn");
  btn.disabled = true;
  btn.textContent = "Reading...";

  try {
    const res = await fetch(`${API_BASE}/inspect-zip`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Couldn't read that zip file.");

    populateZipPickers(data.html_files);
    document.getElementById("zip-picker").classList.remove("hidden");
  } catch (err) {
    showError(err.message || "Network error.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Read zip contents";
  }
}

function populateZipPickers(htmlFiles) {
  const followersBox = document.getElementById("zip-followers-options");
  const followingBox = document.getElementById("zip-following-options");
  followersBox.innerHTML = "";
  followingBox.innerHTML = "";

  // Pre-select sensible defaults based on filename, so most people
  // don't have to think about it — they can still override.
  for (const path of htmlFiles) {
    const filename = path.split("/").pop().toLowerCase();

    const cb = document.createElement("label");
    cb.innerHTML = `<input type="checkbox" value="${escapeHtml(path)}" ${filename.startsWith("followers") ? "checked" : ""}/> ${escapeHtml(path)}`;
    followersBox.appendChild(cb);

    const rb = document.createElement("label");
    rb.innerHTML = `<input type="radio" name="following-choice" value="${escapeHtml(path)}" ${filename === "following.html" ? "checked" : ""}/> ${escapeHtml(path)}`;
    followingBox.appendChild(rb);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function handleAnalyzeZip() {
  hideError();
  const zipInput = document.getElementById("zip-input");
  const followersChecked = [...document.querySelectorAll("#zip-followers-options input:checked")].map((el) => el.value);
  const followingChosen = document.querySelector("#zip-following-options input:checked");

  if (!zipInput.files.length) return showError("Zip file missing — try reading it again.");
  if (followersChecked.length === 0) return showError("Please select at least one followers file.");
  if (!followingChosen) return showError("Please select your following file.");

  const formData = new FormData();
  formData.append("zip_file", zipInput.files[0]);
  formData.append("followers_paths", followersChecked.join(","));
  formData.append("following_path", followingChosen.value);

  const btn = document.getElementById("analyze-zip-btn");
  btn.disabled = true;
  btn.textContent = "Analyzing...";

  try {
    const res = await fetch(`${API_BASE}/analyze-zip`, { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Something went wrong analyzing your files.");
    applyAnalyzeResponse(data);
  } catch (err) {
    showError(err.message || "Network error.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze";
  }
}

/* ---------------------------------------------------------
   Shared: applying an /analyze or /analyze-zip response
--------------------------------------------------------- */
function applyAnalyzeResponse(data) {
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
  renderGrowthChart(data.growth_timeline);

  document.getElementById("results-section").classList.remove("hidden");
  renderActiveList();
  document.getElementById("results-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderDateRangeBanner(followersRange, followingRange) {
  const banner = document.getElementById("date-range-banner");
  const text = document.getElementById("date-range-text");
  const range = followersRange || followingRange;

  if (!range) {
    banner.classList.add("hidden");
    return;
  }

  text.innerHTML = `<strong>Partial export detected.</strong> This data only covers ${range.start} to ${range.end}. For full accuracy, request an "All time" export from Instagram.`;
  banner.classList.remove("hidden");
}

/* ---------------------------------------------------------
   Growth chart — plain divs, height = count, no chart library
--------------------------------------------------------- */
function renderGrowthChart(timeline) {
  const section = document.getElementById("growth-chart-section");
  const chart = document.getElementById("growth-chart");
  chart.innerHTML = "";

  if (!timeline || timeline.length === 0) {
    section.classList.add("hidden");
    return;
  }

  const maxValue = Math.max(1, ...timeline.map((m) => Math.max(m.followers_gained, m.following_gained)));

  for (const month of timeline) {
    const col = document.createElement("div");
    col.className = "growth-month";
    col.title = `${month.month}: +${month.followers_gained} followers, +${month.following_gained} following`;

    const followerBar = document.createElement("div");
    followerBar.className = "growth-bar followers";
    followerBar.style.height = `${(month.followers_gained / maxValue) * 100}%`;

    const followingBar = document.createElement("div");
    followingBar.className = "growth-bar following";
    followingBar.style.height = `${(month.following_gained / maxValue) * 100}%`;

    col.appendChild(followerBar);
    col.appendChild(followingBar);
    chart.appendChild(col);
  }

  section.classList.remove("hidden");
}

/* ---------------------------------------------------------
   List rendering: search, sort, tabs
--------------------------------------------------------- */
const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");

searchInput.addEventListener("input", () => renderActiveList());
sortSelect.addEventListener("change", () => {
  currentSort = sortSelect.value;
  renderActiveList();
});

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

function renderActiveList() {
  const key = {
    "not-following-back": "not_following_back",
    "you-not-following-back": "im_not_following_back",
    "mutuals": "mutuals",
  }[activeTab];

  const query = searchInput.value.trim().toLowerCase();
  const listEl = document.getElementById(`list-${activeTab}`);
  let entries = currentResults[key].filter((e) => e.username.includes(query));

  entries = sortEntries(entries, currentSort);

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

function sortEntries(entries, sortMode) {
  const copy = [...entries];
  if (sortMode === "alpha") {
    return copy.sort((a, b) => a.username.localeCompare(b.username));
  }
  // Entries without a parseable timestamp sink to the end regardless
  // of direction, since there's nothing meaningful to sort them by.
  const withDate = copy.filter((e) => e.followed_at_sortable);
  const withoutDate = copy.filter((e) => !e.followed_at_sortable);

  withDate.sort((a, b) => {
    const diff = new Date(a.followed_at_sortable) - new Date(b.followed_at_sortable);
    return sortMode === "recent" ? -diff : diff;
  });

  return [...withDate, ...withoutDate];
}

function showError(message) {
  const errorMsg = document.getElementById("error-msg");
  errorMsg.textContent = message;
  errorMsg.classList.remove("hidden");
}
function hideError() {
  document.getElementById("error-msg").classList.add("hidden");
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
