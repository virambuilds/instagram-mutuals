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
   Zip upload flow — auto-detect followers/following files,
   only fall back to manual picker if detection is ambiguous.
--------------------------------------------------------- */
document.getElementById("analyze-btn").addEventListener("click", handleZipAnalyze);
document.getElementById("analyze-zip-btn").addEventListener("click", handleManualZipAnalyze);

async function handleZipAnalyze() {
  hideError();
  const zipInput = document.getElementById("zip-input");
  if (!zipInput.files.length) return showError("Please choose your Instagram export .zip file.");

  const btn = document.getElementById("analyze-btn");
  btn.disabled = true;
  btn.textContent = "Analyzing...";

  try {
    const htmlFiles = await inspectZip(zipInput.files[0]);
    const detected = autoDetectFiles(htmlFiles);

    if (!detected) {
      // Ambiguous or nothing found — hand off to the manual picker
      // instead of guessing wrong silently.
      populateZipPickers(htmlFiles);
      document.getElementById("zip-picker").classList.remove("hidden");
      return;
    }

    await analyzeZipFiles(zipInput.files[0], detected.followers, detected.following);
  } catch (err) {
    showError(err.message || "Network error.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze";
  }
}

async function inspectZip(zipFile) {
  const formData = new FormData();
  formData.append("zip_file", zipFile);
  const res = await fetch(`${API_BASE}/inspect-zip`, { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Couldn't read that zip file.");
  return data.html_files;
}

/**
 * Picks the followers file(s) and following file automatically by
 * filename pattern. Returns null (triggering the manual fallback) if
 * there isn't exactly one unambiguous following file, or no followers
 * files at all — better to ask than guess wrong on the actual data.
 */
function autoDetectFiles(htmlFiles) {
  const followers = [];
  const followingCandidates = [];

  for (const path of htmlFiles) {
    const filename = path.split("/").pop().toLowerCase();
    if (filename === "following.html") {
      followingCandidates.push(path);
    } else if (/^followers(_\d+)?\.html$/.test(filename)) {
      followers.push(path);
    }
  }

  if (followers.length === 0 || followingCandidates.length !== 1) {
    return null;
  }

  return { followers, following: followingCandidates[0] };
}

async function analyzeZipFiles(zipFile, followersPaths, followingPath) {
  const formData = new FormData();
  formData.append("zip_file", zipFile);
  formData.append("followers_paths", followersPaths.join(","));
  formData.append("following_path", followingPath);

  const res = await fetch(`${API_BASE}/analyze-zip`, { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Something went wrong analyzing your files.");
  applyAnalyzeResponse(data);
}

function populateZipPickers(htmlFiles) {
  const followersBox = document.getElementById("zip-followers-options");
  const followingBox = document.getElementById("zip-following-options");
  followersBox.innerHTML = "";
  followingBox.innerHTML = "";

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

async function handleManualZipAnalyze() {
  hideError();
  const zipInput = document.getElementById("zip-input");
  const followersChecked = [...document.querySelectorAll("#zip-followers-options input:checked")].map((el) => el.value);
  const followingChosen = document.querySelector("#zip-following-options input:checked");

  if (!zipInput.files.length) return showError("Zip file missing — try again.");
  if (followersChecked.length === 0) return showError("Please select at least one followers file.");
  if (!followingChosen) return showError("Please select your following file.");

  const btn = document.getElementById("analyze-zip-btn");
  btn.disabled = true;
  btn.textContent = "Analyzing...";

  try {
    await analyzeZipFiles(zipInput.files[0], followersChecked, followingChosen.value);
  } catch (err) {
    showError(err.message || "Network error.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze with these files";
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
   Growth chart — Chart.js, horizontally scrollable, one
   data point per month from the very first to the most recent.
--------------------------------------------------------- */
let growthChartInstance = null;

function renderGrowthChart(timeline) {
  const section = document.getElementById("growth-chart-section");
  const canvas = document.getElementById("growth-chart-canvas");

  if (!timeline || timeline.length === 0) {
    section.classList.add("hidden");
    return;
  }

  // Fixed width per month keeps every label readable regardless of
  // how many months there are — the container scrolls horizontally
  // instead of cramming everything into one fixed width.
  const PX_PER_MONTH = 48;
  canvas.style.width = `${Math.max(400, timeline.length * PX_PER_MONTH)}px`;

  const labels = timeline.map((m) => formatMonthLabel(m.month));
  const followerData = timeline.map((m) => m.followers_gained);
  const followingData = timeline.map((m) => m.following_gained);

  const styles = getComputedStyle(document.body);
  const positiveColor = styles.getPropertyValue("--positive").trim();
  const accentColor = styles.getPropertyValue("--accent").trim();
  const gridColor = styles.getPropertyValue("--border").trim();
  const textColor = styles.getPropertyValue("--text-muted").trim();

  if (growthChartInstance) {
    growthChartInstance.destroy();
  }

  growthChartInstance = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Followers gained",
          data: followerData,
          borderColor: positiveColor,
          backgroundColor: positiveColor + "22",
          tension: 0.3,
          fill: true,
          pointRadius: 2,
        },
        {
          label: "Following added",
          data: followingData,
          borderColor: accentColor,
          backgroundColor: accentColor + "22",
          tension: 0.3,
          fill: true,
          pointRadius: 2,
        },
      ],
    },
    options: {
      responsive: false,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: textColor, font: { size: 11 }, boxWidth: 10 },
        },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: {
          ticks: { color: textColor, font: { size: 10 }, maxRotation: 45, minRotation: 45 },
          grid: { color: gridColor },
        },
        y: {
          beginAtZero: true,
          ticks: { color: textColor, font: { size: 10 } },
          grid: { color: gridColor },
        },
      },
    },
  });

  section.classList.remove("hidden");
}

function formatMonthLabel(monthKey) {
  // monthKey is "YYYY-MM"
  const [year, month] = monthKey.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
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
