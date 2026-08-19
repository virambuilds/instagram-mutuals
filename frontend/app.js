const API_BASE = ""; // same-origin, since FastAPI serves this file too

let currentResults = {
  not_following_back: [],
  im_not_following_back: [],
  mutuals: [],
};
let activeTab = "not-following-back";

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

  if (!followersInput.files.length) {
    return showError("Please choose your followers_*.html file(s).");
  }
  if (!followingInput.files.length) {
    return showError("Please choose your following.html file.");
  }

  const formData = new FormData();
  for (const file of followersInput.files) {
    formData.append("followers_files", file);
  }
  formData.append("following_file", followingInput.files[0]);

  analyzeBtn.disabled = true;
  analyzeBtn.textContent = "Analyzing...";

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.detail || "Something went wrong analyzing your files.");
    }

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

    resultsSection.classList.remove("hidden");
    renderActiveList();
  } catch (err) {
    showError(err.message || "Network error — is the backend running?");
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = "Analyze";
  }
}

function renderActiveList() {
  const key = {
    "not-following-back": "not_following_back",
    "you-not-following-back": "im_not_following_back",
    "mutuals": "mutuals",
  }[activeTab];

  const query = searchInput.value.trim().toLowerCase();
  const listEl = document.getElementById(`list-${activeTab}`);
  const usernames = currentResults[key].filter((u) => u.includes(query));

  listEl.innerHTML = "";

  if (usernames.length === 0) {
    listEl.innerHTML = `<li class="empty-msg">No accounts here.</li>`;
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

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.classList.remove("hidden");
}

function hideError() {
  errorMsg.classList.add("hidden");
}
