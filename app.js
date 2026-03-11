const USERS_URL = "data/users.json";
const CONFIG_URL = "data/site-config.json";
const STORAGE_USERS_KEY = "ghmx_users_v1";
const STORAGE_SESSION_KEY = "ghmx_session_v1";

const ROLE_FIELDS = ["Volunteer", "owner", "Judge", "admin", "Super admin"];
const SCORE_INPUT_IDS = [
  "score-craftsmanship",
  "score-presentation",
  "score-difficulty",
  "score-theme",
];

const DEFAULT_CONFIG = {
  event: {
    title: "GHMX Convention Operations Portal",
    summary:
      "GHMX is a hobby and scale-model focused convention in Brisbane. Use this portal to manage staff accounts, model competition judging, volunteer intake, and logistics maps.",
    venue: "Brisbane Showgrounds, Gregory Terrace, Bowen Hills QLD",
    dates: "Set your dates in data/site-config.json",
    officialUrl: "https://ghmx.com.au/",
  },
  google: {
    judgeAppsScriptUrl: "",
    judgeFallbackFormUrl: "",
    volunteerFormUrl: "",
    volunteerEmbedUrl: "",
  },
  maps: {
    venueMapUrl: "assets/maps/venue-map-placeholder.svg",
    bumpInMapUrl: "assets/maps/bump-in-map-placeholder.svg",
  },
};

const state = {
  config: DEFAULT_CONFIG,
  seedUsers: [],
  users: [],
  currentUser: null,
};

const els = {
  loginView: document.getElementById("login-view"),
  appView: document.getElementById("app-view"),
  loginForm: document.getElementById("login-form"),
  loginStatus: document.getElementById("login-status"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  sessionChip: document.getElementById("session-chip"),
  sessionUser: document.getElementById("session-user"),
  logoutBtn: document.getElementById("logout-btn"),
  tabs: Array.from(document.querySelectorAll(".tab")),
  panels: Array.from(document.querySelectorAll(".panel")),
  eventTitle: document.getElementById("event-title"),
  eventSummary: document.getElementById("event-summary"),
  eventVenue: document.getElementById("event-venue"),
  eventDates: document.getElementById("event-dates"),
  officialLink: document.getElementById("official-link"),
  usersTableBody: document.getElementById("users-table-body"),
  userForm: document.getElementById("user-form"),
  userFormTitle: document.getElementById("user-form-title"),
  userFormStatus: document.getElementById("user-form-status"),
  editUsername: document.getElementById("edit-username"),
  formUsername: document.getElementById("form-username"),
  formPassword: document.getElementById("form-password"),
  formCompany: document.getElementById("form-company"),
  roleVolunteer: document.getElementById("role-volunteer"),
  roleOwner: document.getElementById("role-owner"),
  roleJudge: document.getElementById("role-judge"),
  roleAdmin: document.getElementById("role-admin"),
  roleSuperAdmin: document.getElementById("role-super-admin"),
  resetUserFormBtn: document.getElementById("reset-user-form-btn"),
  exportUsersBtn: document.getElementById("export-users-btn"),
  importUsersBtn: document.getElementById("import-users-btn"),
  importUsersInput: document.getElementById("import-users-input"),
  judgeForm: document.getElementById("judge-form"),
  judgeSubmitBtn: document.getElementById("judge-submit-btn"),
  judgeStatus: document.getElementById("judge-status"),
  judgeTotal: document.getElementById("judge-total"),
  judgeFallbackLink: document.getElementById("judge-fallback-link"),
  volunteerLink: document.getElementById("volunteer-link"),
  volunteerIframe: document.getElementById("volunteer-iframe"),
  venueMapFrame: document.getElementById("venue-map-frame"),
  venueMapLink: document.getElementById("venue-map-link"),
  bumpinMapFrame: document.getElementById("bumpin-map-frame"),
  bumpinMapLink: document.getElementById("bumpin-map-link"),
};

init().catch((error) => {
  console.error(error);
  setStatus(els.loginStatus, "Failed to load app files. Check JSON files.", true);
});

async function init() {
  bindEvents();
  await Promise.all([loadConfig(), loadUsers()]);
  renderOverview();
  hydrateSession();
  refreshRoleSections();
  renderUsersTable();
  configureVolunteerSection();
  configureMap("venue");
  configureMap("bumpin");
  updateJudgeFallbackLink();
  updateJudgeTotal();
}

function bindEvents() {
  els.loginForm.addEventListener("submit", onLoginSubmit);
  els.logoutBtn.addEventListener("click", logout);
  els.tabs.forEach((tab) => tab.addEventListener("click", onTabClick));
  els.usersTableBody.addEventListener("click", onUsersTableClick);
  els.userForm.addEventListener("submit", onUserFormSubmit);
  els.resetUserFormBtn.addEventListener("click", () => clearUserForm());
  els.exportUsersBtn.addEventListener("click", exportUsersJson);
  els.importUsersBtn.addEventListener("click", () => els.importUsersInput.click());
  els.importUsersInput.addEventListener("change", onImportUsers);
  els.judgeForm.addEventListener("submit", onJudgeFormSubmit);
  SCORE_INPUT_IDS.forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("input", updateJudgeTotal);
    input.addEventListener("change", updateJudgeTotal);
  });
}

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error("Config missing");
    }
    const data = await response.json();
    state.config = {
      ...DEFAULT_CONFIG,
      ...data,
      event: { ...DEFAULT_CONFIG.event, ...data.event },
      google: { ...DEFAULT_CONFIG.google, ...data.google },
      maps: { ...DEFAULT_CONFIG.maps, ...data.maps },
    };
  } catch (error) {
    console.warn("Using default config:", error.message);
    state.config = DEFAULT_CONFIG;
  }
}

async function loadUsers() {
  const response = await fetch(USERS_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("data/users.json not found");
  }
  const seedUsers = await response.json();
  state.seedUsers = normalizeUsers(seedUsers);
  const storedUsers = readUsersFromStorage();
  state.users = storedUsers.length ? storedUsers : state.seedUsers;
  enforceAtLeastOneSuperAdmin();
}

function readUsersFromStorage() {
  try {
    const stored = localStorage.getItem(STORAGE_USERS_KEY);
    if (!stored) {
      return [];
    }
    return normalizeUsers(JSON.parse(stored));
  } catch (error) {
    console.warn("Ignoring invalid local user storage:", error.message);
    return [];
  }
}

function saveUsersToStorage() {
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(state.users, null, 2));
}

function normalizeUsers(input) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((raw) => normalizeUser(raw))
    .filter((user) => user.Username && user.password && user.company);
}

function normalizeUser(raw) {
  const user = {
    Username: String(raw?.Username ?? raw?.username ?? "").trim(),
    password: String(raw?.password ?? ""),
    company: String(raw?.company ?? "").trim(),
    Volunteer: normalizeRoleValue(raw?.Volunteer),
    owner: normalizeRoleValue(raw?.owner),
    Judge: normalizeRoleValue(raw?.Judge),
    admin: normalizeRoleValue(raw?.admin),
    "Super admin": normalizeRoleValue(raw?.["Super admin"]),
  };

  if (user["Super admin"] === "1") {
    user.admin = "1";
  }
  return user;
}

function normalizeRoleValue(value) {
  return String(value ?? "").trim() === "1" ? "1" : "";
}

function enforceAtLeastOneSuperAdmin() {
  const hasSuper = state.users.some((user) => hasRole(user, "Super admin"));
  if (hasSuper) {
    return;
  }

  const fallback = state.seedUsers.find((user) => hasRole(user, "Super admin"));
  if (fallback) {
    state.users.push(fallback);
    saveUsersToStorage();
  }
}

function hydrateSession() {
  const username = localStorage.getItem(STORAGE_SESSION_KEY);
  if (!username) {
    showLogin();
    return;
  }
  const user = findUserByUsername(username);
  if (!user) {
    localStorage.removeItem(STORAGE_SESSION_KEY);
    showLogin();
    return;
  }
  state.currentUser = user;
  showApp();
}

function onLoginSubmit(event) {
  event.preventDefault();
  const username = els.username.value.trim();
  const password = els.password.value;
  const user = state.users.find(
    (entry) => entry.Username.toLowerCase() === username.toLowerCase() && entry.password === password
  );

  if (!user) {
    setStatus(els.loginStatus, "Invalid username or password.", true);
    return;
  }

  state.currentUser = user;
  localStorage.setItem(STORAGE_SESSION_KEY, user.Username);
  els.loginForm.reset();
  setStatus(els.loginStatus, "Login successful.");
  refreshRoleSections();
  renderUsersTable();
  showApp();
}

function logout() {
  state.currentUser = null;
  localStorage.removeItem(STORAGE_SESSION_KEY);
  showLogin();
}

function showLogin() {
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  els.sessionChip.classList.add("hidden");
  clearUserForm();
  setStatus(els.loginStatus, "");
}

function showApp() {
  if (!state.currentUser) {
    showLogin();
    return;
  }
  els.loginView.classList.add("hidden");
  els.appView.classList.remove("hidden");
  els.sessionChip.classList.remove("hidden");
  const roleSummary = listRoles(state.currentUser).join(", ") || "User";
  els.sessionUser.textContent = `${state.currentUser.Username} | ${state.currentUser.company} | ${roleSummary}`;
  activateFirstAvailableTab();
}

function renderOverview() {
  const { event } = state.config;
  els.eventTitle.textContent = event.title;
  els.eventSummary.textContent = event.summary;
  els.eventVenue.textContent = event.venue;
  els.eventDates.textContent = event.dates;
  els.officialLink.href = event.officialUrl;
}

function refreshRoleSections() {
  const user = state.currentUser;
  const manager = Boolean(user && (hasRole(user, "admin") || hasRole(user, "Super admin")));
  const judge = Boolean(user && (hasRole(user, "Judge") || manager));
  const volunteer = Boolean(user && (hasRole(user, "Volunteer") || manager));

  setTabAccess("manager", manager);
  setTabAccess("judge", judge);
  setTabAccess("volunteer", volunteer);

  togglePanel("users-panel", manager);
  togglePanel("judging-panel", judge);
  togglePanel("volunteer-panel", volunteer);
  activateFirstAvailableTab();
}

function setTabAccess(roleName, allowed) {
  els.tabs
    .filter((tab) => tab.dataset.role === roleName)
    .forEach((tab) => tab.classList.toggle("hidden", !allowed));
}

function togglePanel(panelId, show) {
  const panel = document.getElementById(panelId);
  panel.classList.toggle("hidden", !show);
}

function onTabClick(event) {
  const button = event.currentTarget;
  if (button.classList.contains("hidden")) {
    return;
  }
  activateTab(button.dataset.target);
}

function activateFirstAvailableTab() {
  const active = els.tabs.find((tab) => tab.classList.contains("active") && !tab.classList.contains("hidden"));
  if (active) {
    activateTab(active.dataset.target);
    return;
  }
  const firstVisible = els.tabs.find((tab) => !tab.classList.contains("hidden"));
  if (firstVisible) {
    activateTab(firstVisible.dataset.target);
  }
}

function activateTab(targetId) {
  const targetPanel = document.getElementById(targetId);
  if (!targetPanel || targetPanel.classList.contains("hidden")) {
    return;
  }

  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.target === targetId));
  els.panels.forEach((panel) => panel.classList.toggle("active", panel.id === targetId && !panel.classList.contains("hidden")));
}

function renderUsersTable() {
  if (!canManageUsers(state.currentUser)) {
    els.usersTableBody.innerHTML = "";
    return;
  }

  const visibleUsers = getVisibleUsersForManager();
  if (!visibleUsers.length) {
    els.usersTableBody.innerHTML = "<tr><td colspan='4'>No user accounts available.</td></tr>";
    return;
  }

  els.usersTableBody.innerHTML = visibleUsers
    .map((user) => {
      const roles = listRoles(user).join(", ") || "No flags";
      const escapedUsername = escapeHtml(user.Username);
      const encodedUsername = encodeURIComponent(user.Username);
      return `
        <tr>
          <td>${escapedUsername}</td>
          <td>${escapeHtml(user.company)}</td>
          <td>${escapeHtml(roles)}</td>
          <td>
            <div class="inline-actions">
              <button type="button" data-action="edit" data-username="${encodedUsername}">Edit</button>
              <button type="button" data-action="delete" data-username="${encodedUsername}">Delete</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  applyFormPermissionRules();
}

function onUsersTableClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const username = decodeURIComponent(button.dataset.username || "");
  const user = findUserByUsername(username);
  if (!user) {
    return;
  }

  if (button.dataset.action === "edit") {
    fillUserForm(user);
    return;
  }
  if (button.dataset.action === "delete") {
    deleteUser(user);
  }
}

function fillUserForm(user) {
  els.editUsername.value = user.Username;
  els.formUsername.value = user.Username;
  els.formPassword.value = "";
  els.formCompany.value = user.company;
  els.roleVolunteer.checked = hasRole(user, "Volunteer");
  els.roleOwner.checked = hasRole(user, "owner");
  els.roleJudge.checked = hasRole(user, "Judge");
  els.roleAdmin.checked = hasRole(user, "admin");
  els.roleSuperAdmin.checked = hasRole(user, "Super admin");
  els.userFormTitle.textContent = `Edit User: ${user.Username}`;
  applyFormPermissionRules();
  setStatus(els.userFormStatus, "");
}

function clearUserForm() {
  els.editUsername.value = "";
  els.userForm.reset();
  els.userFormTitle.textContent = "Create User";
  applyFormPermissionRules();
  setStatus(els.userFormStatus, "");
}

function applyFormPermissionRules() {
  const superAdmin = hasRole(state.currentUser, "Super admin");
  els.formCompany.disabled = !superAdmin;
  els.roleAdmin.disabled = !superAdmin;
  els.roleSuperAdmin.disabled = !superAdmin;

  if (!superAdmin && state.currentUser) {
    els.formCompany.value = state.currentUser.company;
    els.roleAdmin.checked = false;
    els.roleSuperAdmin.checked = false;
  }
}

function onUserFormSubmit(event) {
  event.preventDefault();
  if (!canManageUsers(state.currentUser)) {
    return;
  }

  const editingUsername = els.editUsername.value.trim();
  const existingUser = editingUsername ? findUserByUsername(editingUsername) : null;

  if (existingUser && !canManageRecord(state.currentUser, existingUser)) {
    setStatus(els.userFormStatus, "You cannot edit this user.", true);
    return;
  }

  const userPayload = buildUserPayload(existingUser);
  if (!userPayload.Username || !userPayload.company) {
    setStatus(els.userFormStatus, "Username and company are required.", true);
    return;
  }
  if (!userPayload.password) {
    setStatus(els.userFormStatus, "Password is required for new users.", true);
    return;
  }

  const duplicate = state.users.find(
    (user) =>
      user.Username.toLowerCase() === userPayload.Username.toLowerCase() &&
      user.Username.toLowerCase() !== editingUsername.toLowerCase()
  );

  if (duplicate) {
    setStatus(els.userFormStatus, "Username already exists.", true);
    return;
  }

  if (existingUser) {
    const index = state.users.findIndex((user) => user.Username === existingUser.Username);
    state.users[index] = userPayload;
  } else {
    state.users.push(userPayload);
  }

  enforceAtLeastOneSuperAdmin();
  saveUsersToStorage();
  renderUsersTable();
  clearUserForm();
  setStatus(els.userFormStatus, "User saved.");
}

function buildUserPayload(existingUser) {
  const superAdmin = hasRole(state.currentUser, "Super admin");
  const manualPassword = els.formPassword.value;
  const newPayload = {
    Username: els.formUsername.value.trim(),
    password: manualPassword || existingUser?.password || "",
    company: superAdmin ? els.formCompany.value.trim() : state.currentUser.company,
    Volunteer: els.roleVolunteer.checked ? "1" : "",
    owner: els.roleOwner.checked ? "1" : "",
    Judge: els.roleJudge.checked ? "1" : "",
    admin: "",
    "Super admin": "",
  };

  if (superAdmin) {
    newPayload.admin = els.roleAdmin.checked ? "1" : "";
    newPayload["Super admin"] = els.roleSuperAdmin.checked ? "1" : "";
  } else if (existingUser) {
    newPayload.admin = existingUser.admin;
    newPayload["Super admin"] = existingUser["Super admin"];
  }

  if (newPayload["Super admin"] === "1") {
    newPayload.admin = "1";
  }

  return newPayload;
}

function deleteUser(user) {
  if (!canManageRecord(state.currentUser, user)) {
    setStatus(els.userFormStatus, "You cannot delete this user.", true);
    return;
  }
  if (user.Username === state.currentUser.Username) {
    setStatus(els.userFormStatus, "You cannot delete your own active account.", true);
    return;
  }

  const superAdminCount = state.users.filter((entry) => hasRole(entry, "Super admin")).length;
  if (hasRole(user, "Super admin") && superAdminCount <= 1) {
    setStatus(els.userFormStatus, "At least one Super admin account is required.", true);
    return;
  }

  state.users = state.users.filter((entry) => entry.Username !== user.Username);
  saveUsersToStorage();
  renderUsersTable();
  setStatus(els.userFormStatus, `Deleted ${user.Username}.`);
}

function exportUsersJson() {
  if (!canManageUsers(state.currentUser)) {
    return;
  }
  const exportUsers = hasRole(state.currentUser, "Super admin")
    ? state.users
    : state.users.filter((user) => user.company === state.currentUser.company);
  const blob = new Blob([JSON.stringify(exportUsers, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ghmx-users-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function onImportUsers(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const imported = normalizeUsers(JSON.parse(text));
    if (!imported.length) {
      throw new Error("No valid users found in file.");
    }

    const superAdminUser = hasRole(state.currentUser, "Super admin");

    imported.forEach((incoming) => {
      let safeIncoming = { ...incoming };
      if (!superAdminUser) {
        safeIncoming.company = state.currentUser.company;
      }

      const existingIndex = state.users.findIndex(
        (existing) => existing.Username.toLowerCase() === safeIncoming.Username.toLowerCase()
      );

      if (existingIndex >= 0) {
        if (!canManageRecord(state.currentUser, state.users[existingIndex])) {
          return;
        }
        if (!superAdminUser) {
          safeIncoming.admin = state.users[existingIndex].admin;
          safeIncoming["Super admin"] = state.users[existingIndex]["Super admin"];
        }
        if (!safeIncoming.password) {
          safeIncoming.password = state.users[existingIndex].password;
        }
        state.users[existingIndex] = safeIncoming;
        return;
      }

      if (!superAdminUser) {
        safeIncoming.admin = "";
        safeIncoming["Super admin"] = "";
      }

      if (!safeIncoming.password) {
        return;
      }
      state.users.push(safeIncoming);
    });

    enforceAtLeastOneSuperAdmin();
    saveUsersToStorage();
    renderUsersTable();
    setStatus(els.userFormStatus, "Import complete.");
  } catch (error) {
    setStatus(els.userFormStatus, `Import failed: ${error.message}`, true);
  } finally {
    els.importUsersInput.value = "";
  }
}

function configureVolunteerSection() {
  const { volunteerFormUrl, volunteerEmbedUrl } = state.config.google;
  if (!volunteerFormUrl) {
    els.volunteerLink.textContent = "Volunteer form URL is not configured";
    els.volunteerLink.removeAttribute("href");
  } else {
    els.volunteerLink.href = volunteerFormUrl;
  }

  if (volunteerEmbedUrl) {
    els.volunteerIframe.src = volunteerEmbedUrl;
    els.volunteerIframe.classList.remove("hidden");
  } else {
    els.volunteerIframe.classList.add("hidden");
  }
}

function configureMap(kind) {
  const isVenue = kind === "venue";
  const mapUrl = isVenue ? state.config.maps.venueMapUrl : state.config.maps.bumpInMapUrl;
  const frame = isVenue ? els.venueMapFrame : els.bumpinMapFrame;
  const link = isVenue ? els.venueMapLink : els.bumpinMapLink;

  frame.src = mapUrl;
  link.href = mapUrl;
}

function updateJudgeTotal() {
  const values = SCORE_INPUT_IDS.map((id) => normalizeScoreInput(id));
  const total = values.reduce((sum, value) => sum + value, 0);
  els.judgeTotal.textContent = String(total);
}

async function onJudgeFormSubmit(event) {
  event.preventDefault();
  if (!state.currentUser) {
    return;
  }

  const endpoint = state.config.google.judgeAppsScriptUrl.trim();
  const fallbackUrl = state.config.google.judgeFallbackFormUrl.trim();
  updateJudgeTotal();
  const scoreValues = SCORE_INPUT_IDS.map((id) => normalizeScoreInput(id));

  const payload = {
    timestamp: new Date().toISOString(),
    judgeUsername: state.currentUser.Username,
    judgeCompany: state.currentUser.company,
    entrantId: document.getElementById("judge-entrant-id").value.trim(),
    modelTitle: document.getElementById("judge-title").value.trim(),
    category: document.getElementById("judge-category").value,
    craftsmanship: String(scoreValues[0]),
    presentation: String(scoreValues[1]),
    difficulty: String(scoreValues[2]),
    themeFit: String(scoreValues[3]),
    totalScore: els.judgeTotal.textContent,
    comments: document.getElementById("judge-comments").value.trim(),
  };

  if (!payload.entrantId || !payload.modelTitle || !payload.category) {
    setStatus(els.judgeStatus, "Entrant ID, build title, and category are required.", true);
    return;
  }

  if (scoreValues.some((score) => score < 0 || score > 25)) {
    setStatus(els.judgeStatus, "Each score must be between 0 and 25.", true);
    return;
  }

  if (!endpoint) {
    if (fallbackUrl) {
      window.open(fallbackUrl, "_blank", "noopener");
      setStatus(
        els.judgeStatus,
        "Judge endpoint is not configured yet. Opened fallback Google Form in a new tab."
      );
      return;
    }
    setStatus(els.judgeStatus, "Judge endpoint is not configured. Add it in data/site-config.json.", true);
    return;
  }

  try {
    setJudgeSubmitState(true);
    const body = new URLSearchParams(payload);
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
    });
    els.judgeForm.reset();
    updateJudgeTotal();
    setStatus(els.judgeStatus, "Score submitted. Check the linked Google Sheet.");
  } catch (error) {
    setStatus(els.judgeStatus, `Submit failed: ${error.message}`, true);
  } finally {
    setJudgeSubmitState(false);
  }
}

function updateJudgeFallbackLink() {
  const fallback = state.config.google.judgeFallbackFormUrl.trim();
  if (!fallback) {
    els.judgeFallbackLink.classList.add("hidden");
    return;
  }
  els.judgeFallbackLink.href = fallback;
  els.judgeFallbackLink.classList.remove("hidden");
}

function numberInputValue(id) {
  const value = Number(document.getElementById(id).value || "0");
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(25, value));
}

function normalizeScoreInput(id) {
  const input = document.getElementById(id);
  if (!input) {
    return 0;
  }
  const clamped = Math.round(numberInputValue(id));
  if (input.value !== String(clamped)) {
    input.value = String(clamped);
  }
  return clamped;
}

function setJudgeSubmitState(isSubmitting) {
  if (!els.judgeSubmitBtn) {
    return;
  }
  els.judgeSubmitBtn.disabled = isSubmitting;
  els.judgeSubmitBtn.textContent = isSubmitting ? "Submitting..." : "Submit Judge Score";
}

function hasRole(user, roleName) {
  if (!user) {
    return false;
  }
  return String(user[roleName] ?? "").trim() === "1";
}

function listRoles(user) {
  return ROLE_FIELDS.filter((role) => hasRole(user, role));
}

function canManageUsers(user) {
  return hasRole(user, "admin") || hasRole(user, "Super admin");
}

function canManageRecord(manager, target) {
  if (!manager || !target) {
    return false;
  }
  if (hasRole(manager, "Super admin")) {
    return true;
  }
  if (!hasRole(manager, "admin")) {
    return false;
  }
  return manager.company === target.company && !hasRole(target, "Super admin");
}

function getVisibleUsersForManager() {
  if (hasRole(state.currentUser, "Super admin")) {
    return state.users.slice().sort(sortByUsername);
  }
  return state.users
    .filter((user) => canManageRecord(state.currentUser, user))
    .sort(sortByUsername);
}

function sortByUsername(a, b) {
  return a.Username.localeCompare(b.Username);
}

function findUserByUsername(username) {
  return state.users.find((user) => user.Username.toLowerCase() === username.toLowerCase());
}

function setStatus(node, message, isError = false) {
  node.textContent = message;
  node.classList.toggle("error", Boolean(isError && message));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
