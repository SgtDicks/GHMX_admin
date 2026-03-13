const USERS_URL = "data/users.json";
const CONFIG_URL = "data/site-config.json";
const STORAGE_USERS_KEY = "ghmx_users_v1";
const STORAGE_SESSION_KEY = "ghmx_session_v1";
const STORAGE_JUDGE_RESULTS_KEY = "ghmx_judge_results_v1";
const STORAGE_MODE_LOCAL = "local";
const STORAGE_MODE_SUPABASE = "supabase";
const MAX_JUDGE_RESULTS = 25;
const CATEGORY_LEADER_LIMIT = 5;
const JUDGE_CATEGORIES = [
  "Aircraft",
  "Armour",
  "Automotive",
  "Sci-Fi",
  "Diorama",
  "Figures",
  "Junior",
  "Themed Build",
];

const ROLE_FIELDS = ["Volunteer", "owner", "Judge", "admin", "Super admin"];
const SCORE_INPUT_IDS = [
  "score-craftsmanship",
  "score-presentation",
  "score-difficulty",
  "score-theme",
];

const SUPABASE_FUNCTIONS = {
  ping: "portal_ping",
  login: "portal_login",
  listUsers: "portal_list_users",
  upsertUser: "portal_upsert_user",
  deleteUser: "portal_delete_user",
  submitJudgeScore: "portal_submit_judge_score",
  listJudgeResults: "portal_list_judge_results",
  listCategoryLeaders: "portal_list_category_leaders",
  listAllJudgeResults: "portal_list_all_judge_results",
  deleteJudgeResults: "portal_delete_judge_results",
};

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
  supabase: {
    enabled: false,
    url: "",
    publishableKey: "",
  },
};

const state = {
  config: DEFAULT_CONFIG,
  seedUsers: [],
  users: [],
  currentUser: null,
  sessionSecret: "",
  storageMode: STORAGE_MODE_LOCAL,
  judgeResults: [],
  categoryLeaders: [],
  adminJudgeResults: [],
  selectedJudgeResultIds: new Set(),
  userSearchTerm: "",
};

const els = {
  loginView: document.getElementById("login-view"),
  appView: document.getElementById("app-view"),
  loginForm: document.getElementById("login-form"),
  loginStatus: document.getElementById("login-status"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  storageChip: document.getElementById("storage-chip"),
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
  usersStorageHint: document.getElementById("users-storage-hint"),
  openUserEditorBtn: document.getElementById("open-user-editor-btn"),
  closeUserEditorBtn: document.getElementById("close-user-editor-btn"),
  userEditorOverlay: document.getElementById("user-editor-overlay"),
  userSearch: document.getElementById("user-search"),
  usersSummary: document.getElementById("users-summary"),
  usersListCaption: document.getElementById("users-list-caption"),
  userFormScope: document.getElementById("user-form-scope"),
  editUsername: document.getElementById("edit-username"),
  formFullName: document.getElementById("form-full-name"),
  formEmail: document.getElementById("form-email"),
  formUsername: document.getElementById("form-username"),
  formPassword: document.getElementById("form-password"),
  formCompany: document.getElementById("form-company"),
  formStatus: document.getElementById("form-status"),
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
  judgeResultsBody: document.getElementById("judge-results-body"),
  refreshResultsBtn: document.getElementById("refresh-results-btn"),
  resultsStatus: document.getElementById("results-status"),
  categoryResultsGrid: document.getElementById("category-results-grid"),
  refreshLeaderboardBtn: document.getElementById("refresh-leaderboard-btn"),
  judgeResultsAdminPanel: document.getElementById("judge-results-admin-panel"),
  manageResultsStatus: document.getElementById("manage-results-status"),
  refreshAdminResultsBtn: document.getElementById("refresh-admin-results-btn"),
  deleteSelectedResultsBtn: document.getElementById("delete-selected-results-btn"),
  purgeResultsBtn: document.getElementById("purge-results-btn"),
  selectAllResults: document.getElementById("select-all-results"),
  adminResultsBody: document.getElementById("admin-results-body"),
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
  setStorageState("Storage: local fallback only.", "error");
});

async function init() {
  mountUserEditorOverlay();
  bindEvents();
  await Promise.all([loadConfig(), loadSeedUsers()]);
  renderOverview();
  configureVolunteerSection();
  configureMap("venue");
  configureMap("bumpin");
  updateJudgeFallbackLink();
  updateJudgeTotal();
  await configureStorageMode();
  await hydrateSession();
  refreshRoleSections();
  updateUserAdminControls();
  if (state.currentUser && canAccessUserAccounts(state.currentUser)) {
    await refreshManagedUsers();
  }
  await Promise.all([refreshJudgeResults(), refreshCategoryLeaders(), refreshAdminJudgeResults()]);
  renderUsersTable();
  if (state.currentUser) {
    showApp();
  } else {
    showLogin();
  }
}

function mountUserEditorOverlay() {
  if (!els.userEditorOverlay) {
    return;
  }

  if (els.userEditorOverlay.parentElement !== document.body) {
    document.body.appendChild(els.userEditorOverlay);
  }
}

function bindEvents() {
  els.loginForm.addEventListener("submit", onLoginSubmit);
  els.logoutBtn.addEventListener("click", logout);
  els.tabs.forEach((tab) => tab.addEventListener("click", onTabClick));
  els.usersTableBody.addEventListener("click", onUsersTableClick);
  els.userForm.addEventListener("submit", onUserFormSubmit);
  els.resetUserFormBtn.addEventListener("click", () => clearUserForm());
  els.openUserEditorBtn?.addEventListener("click", openNewUserEditor);
  els.closeUserEditorBtn?.addEventListener("click", closeUserEditor);
  els.userEditorOverlay?.addEventListener("click", onUserEditorOverlayClick);
  els.userSearch?.addEventListener("input", onUserSearchInput);
  els.exportUsersBtn.addEventListener("click", exportUsersJson);
  els.importUsersBtn.addEventListener("click", () => els.importUsersInput.click());
  els.importUsersInput.addEventListener("change", onImportUsers);
  els.judgeForm.addEventListener("submit", onJudgeFormSubmit);
  els.refreshResultsBtn?.addEventListener("click", () => {
    void refreshJudgeResults(true);
  });
  els.refreshLeaderboardBtn?.addEventListener("click", () => {
    void refreshCategoryLeaders(true);
  });
  els.refreshAdminResultsBtn?.addEventListener("click", () => {
    void refreshAdminJudgeResults(true);
  });
  els.deleteSelectedResultsBtn?.addEventListener("click", () => {
    void deleteSelectedJudgeResults();
  });
  els.purgeResultsBtn?.addEventListener("click", () => {
    void purgeAllJudgeResults();
  });
  els.selectAllResults?.addEventListener("change", onToggleAllJudgeResults);
  els.adminResultsBody?.addEventListener("change", onAdminResultsSelectionChange);
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
      supabase: { ...DEFAULT_CONFIG.supabase, ...data.supabase },
    };
  } catch (error) {
    console.warn("Using default config:", error.message);
    state.config = DEFAULT_CONFIG;
  }
}

async function loadSeedUsers() {
  const response = await fetch(USERS_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error("data/users.json not found");
  }
  const seedUsers = await response.json();
  state.seedUsers = normalizeUsers(seedUsers);
}

async function configureStorageMode() {
  if (!hasSupabaseConfig()) {
    state.storageMode = STORAGE_MODE_LOCAL;
    hydrateLocalUsers();
    setStorageState("Storage: browser local fallback.", "warn");
    updateUsersStorageHint();
    return;
  }

  try {
    await callSupabaseRpc(SUPABASE_FUNCTIONS.ping, {});
    state.storageMode = STORAGE_MODE_SUPABASE;
    state.users = [];
    setStorageState("Storage: Supabase live.", "ok");
  } catch (error) {
    console.warn("Supabase setup not live yet:", error);
    state.storageMode = STORAGE_MODE_LOCAL;
    hydrateLocalUsers();
    setStorageState(
      "Storage: Supabase configured, local fallback active until SQL setup is applied.",
      "warn"
    );
  }

  updateUsersStorageHint();
}

async function hydrateSession() {
  const session = readStoredSession();
  if (!session?.username) {
    state.currentUser = null;
    state.sessionSecret = "";
    return;
  }

  try {
    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      const user = await authenticateSupabase(session.username, session.password || "");
      state.currentUser = user;
      state.sessionSecret = session.password || "";
      return;
    }

    const user = restoreLocalSessionUser(session.username);
    if (!user) {
      throw new Error("Stored session is no longer valid.");
    }
    state.currentUser = user;
    state.sessionSecret = "";
  } catch (error) {
    console.warn("Clearing stored session:", error.message);
    clearStoredSession();
    state.currentUser = null;
    state.sessionSecret = "";
  }
}

async function onLoginSubmit(event) {
  event.preventDefault();

  const username = els.username.value.trim();
  const password = els.password.value;

  if (!username || !password) {
    setStatus(els.loginStatus, "Username and password are required.", true);
    return;
  }

  try {
    setStatus(els.loginStatus, "Signing in...");
    const user =
      state.storageMode === STORAGE_MODE_SUPABASE
        ? await authenticateSupabase(username, password)
        : authenticateLocal(username, password);

    await finishLogin(user, password, { statusMessage: "Login successful." });
    els.loginForm.reset();
  } catch (error) {
    setStatus(els.loginStatus, formatAuthError(error), true);
  }
}

async function finishLogin(user, password, { statusMessage = "" } = {}) {
  state.currentUser =
    state.storageMode === STORAGE_MODE_LOCAL ? markLocalUserLogin(user.Username) || user : user;
  state.sessionSecret = state.storageMode === STORAGE_MODE_SUPABASE ? password : "";
  writeStoredSession(state.currentUser.Username, state.sessionSecret);
  if (canAccessUserAccounts(user)) {
    await refreshManagedUsers();
  } else if (state.storageMode === STORAGE_MODE_SUPABASE) {
    state.users = [];
  }
  await Promise.all([refreshJudgeResults(), refreshCategoryLeaders(), refreshAdminJudgeResults()]);
  refreshRoleSections();
  updateUserAdminControls();
  updateJudgeResultAdminControls();
  renderUsersTable();
  showApp();
  if (statusMessage) {
    setStatus(els.loginStatus, statusMessage);
  }
}

function logout() {
  state.currentUser = null;
  state.sessionSecret = "";
  state.judgeResults = [];
  state.categoryLeaders = [];
  state.adminJudgeResults = [];
  state.selectedJudgeResultIds = new Set();
  state.userSearchTerm = "";
  if (els.userSearch) {
    els.userSearch.value = "";
  }
  clearStoredSession();
  showLogin();
  refreshRoleSections();
  updateUserAdminControls();
  updateJudgeResultAdminControls();
  renderJudgeResults();
  renderCategoryLeaders();
  renderAdminJudgeResults();
  setStatus(els.resultsStatus, "");
  setStatus(els.manageResultsStatus, "");
  renderUsersTable();
}

function showLogin() {
  els.loginView.classList.remove("hidden");
  els.appView.classList.add("hidden");
  els.sessionChip.classList.add("hidden");
  setUserEditorOpen(false);
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
  els.sessionUser.textContent = `${getUserDisplayName(state.currentUser)} | ${state.currentUser.company} | ${roleSummary}`;
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
  const userAccounts = canAccessUserAccounts(user);
  const judge = canAccessJudgeDesk(user);
  const volunteer = canAccessVolunteerTools(user);

  setTabAccess("manager", userAccounts);
  setTabAccess("judge", judge);
  setTabAccess("volunteer", volunteer);

  togglePanel("users-panel", userAccounts);
  togglePanel("judging-panel", judge);
  togglePanel("results-panel", judge);
  togglePanel("volunteer-panel", volunteer);
  updateJudgeResultAdminControls();
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
  if (!canAccessUserAccounts(state.currentUser)) {
    els.usersTableBody.innerHTML = "";
    updateUsersPanelMeta([], []);
    return;
  }

  const allManagedUsers = getVisibleUsersForManager();
  const visibleUsers = filterManagedUsers(allManagedUsers);
  updateUsersPanelMeta(allManagedUsers, visibleUsers);

  if (!visibleUsers.length) {
    els.usersTableBody.innerHTML = state.userSearchTerm
      ? "<tr><td colspan='8'>No staff accounts match the current search.</td></tr>"
      : "<tr><td colspan='8'>No user accounts available.</td></tr>";
    return;
  }

  els.usersTableBody.innerHTML = visibleUsers
    .map((user) => {
      const escapedUsername = escapeHtml(user.Username);
      const encodedUsername = encodeURIComponent(user.Username);
      const actions = [];
      const fullName = escapeHtml(getUserDisplayName(user));
      const email = user.email ? escapeHtml(user.email) : "<span class='table-empty'>No email</span>";

      if (canEditUsers(state.currentUser) && canManageRecord(state.currentUser, user)) {
        actions.push(
          `<button type="button" class="secondary action-icon-button" data-action="edit" data-username="${encodedUsername}">Edit</button>`
        );
      }
      if (canDeleteUsers(state.currentUser) && canManageRecord(state.currentUser, user)) {
        actions.push(
          `<button type="button" class="danger action-icon-button" data-action="delete" data-username="${encodedUsername}">Delete</button>`
        );
      }

      return `
        <tr>
          <td>
            <div class="user-account-cell">
              <span class="user-avatar">${escapeHtml(getUserInitials(user))}</span>
              <div class="user-identity">
                <strong>${fullName}</strong>
                <span>${escapeHtml(user.company)}</span>
              </div>
            </div>
          </td>
          <td>${email}</td>
          <td><span class="username-chip">${escapedUsername}</span></td>
          <td>${renderStatusBadge(user.status)}</td>
          <td>${renderPrimaryRoleBadge(user)}</td>
          <td>${escapeHtml(formatDateOnly(user.createdAt))}</td>
          <td>${escapeHtml(formatRelativeTime(user.lastLoginAt))}</td>
          <td>
            <div class="inline-actions">
              ${actions.join("") || "<span class='action-note'>Add only</span>"}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  applyFormPermissionRules();
}

function updateUserAdminControls() {
  const allowBulkAdmin = canEditUsers(state.currentUser);
  els.exportUsersBtn.classList.toggle("hidden", !allowBulkAdmin);
  els.importUsersBtn.classList.toggle("hidden", !allowBulkAdmin);
}

function onUserSearchInput(event) {
  state.userSearchTerm = String(event.target.value || "").trim();
  renderUsersTable();
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
    void deleteUser(user);
  }
}

function openNewUserEditor() {
  clearUserForm();
  setUserEditorOpen(true);
}

function closeUserEditor() {
  clearUserForm();
  setUserEditorOpen(false);
}

function onUserEditorOverlayClick(event) {
  if (event.target === els.userEditorOverlay) {
    closeUserEditor();
  }
}

function setUserEditorOpen(isOpen) {
  els.userEditorOverlay?.classList.toggle("hidden", !isOpen);
  document.body.classList.toggle("user-editor-open", isOpen);
}

function fillUserForm(user) {
  els.editUsername.value = user.Username;
  els.formFullName.value = getUserDisplayName(user);
  els.formEmail.value = user.email || "";
  els.formUsername.value = user.Username;
  els.formPassword.value = "";
  els.formCompany.value = user.company;
  els.formStatus.value = normalizeUserStatus(user.status);
  els.roleVolunteer.checked = hasRole(user, "Volunteer");
  els.roleOwner.checked = hasRole(user, "owner");
  els.roleJudge.checked = hasRole(user, "Judge");
  els.roleAdmin.checked = hasRole(user, "admin");
  els.roleSuperAdmin.checked = hasRole(user, "Super admin");
  els.userFormTitle.textContent = `Edit User: ${getUserDisplayName(user)}`;
  applyFormPermissionRules();
  updateUserFormScope(user);
  setUserEditorOpen(true);
  setStatus(els.userFormStatus, "");
}

function clearUserForm() {
  els.editUsername.value = "";
  els.userForm.reset();
  els.formStatus.value = "Active";
  els.userFormTitle.textContent = "New User";
  applyFormPermissionRules();
  updateUserFormScope();
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

function updateUsersPanelMeta(allManagedUsers, visibleUsers) {
  if (els.usersSummary) {
    const activeCount = allManagedUsers.filter((user) => normalizeUserStatus(user.status) === "Active").length;
    const elevatedCount = allManagedUsers.filter(
      (user) => hasRole(user, "admin") || hasRole(user, "Super admin")
    ).length;
    const hiddenCount = Math.max(allManagedUsers.length - visibleUsers.length, 0);

    els.usersSummary.innerHTML = [
      renderSummaryPill(visibleUsers.length, "Visible"),
      renderSummaryPill(activeCount, "Active"),
      renderSummaryPill(elevatedCount, "Admins"),
      hiddenCount ? renderSummaryPill(hiddenCount, "Filtered") : "",
    ]
      .filter(Boolean)
      .join("");
  }

  if (els.usersListCaption) {
    if (!allManagedUsers.length) {
      els.usersListCaption.textContent = "No staff accounts are currently available in your management scope.";
    } else if (!visibleUsers.length && state.userSearchTerm) {
      els.usersListCaption.textContent = `No staff accounts matched "${state.userSearchTerm}".`;
    } else if (state.userSearchTerm) {
      els.usersListCaption.textContent = `Showing ${visibleUsers.length} of ${allManagedUsers.length} staff accounts for "${state.userSearchTerm}".`;
    } else {
      els.usersListCaption.textContent = `Showing ${visibleUsers.length} staff account${visibleUsers.length === 1 ? "" : "s"} in your management scope.`;
    }
  }

  updateUserFormScope();
}

function updateUserFormScope(existingUser = null) {
  if (!els.userFormScope) {
    return;
  }

  if (!state.currentUser) {
    els.userFormScope.textContent = "";
    return;
  }

  const isEditing = Boolean(existingUser || els.editUsername.value.trim());
  if (hasRole(state.currentUser, "Super admin")) {
    els.userFormScope.textContent = isEditing
      ? "You can edit company assignment, status, email, and elevated access for this account."
      : "You can create accounts across any company, including admin and super admin access.";
    return;
  }

  if (hasRole(state.currentUser, "admin")) {
    els.userFormScope.textContent = isEditing
      ? `This account stays scoped to ${state.currentUser.company}. Email and status can be updated here. Elevated roles remain locked to super admins.`
      : `New accounts will be created inside ${state.currentUser.company}. Only super admins can assign admin or super admin access.`;
    return;
  }

  els.userFormScope.textContent = `You can add new users for ${state.currentUser.company}. Editing and deletion stay with admins and super admins.`;
}

function filterManagedUsers(users) {
  const query = state.userSearchTerm.trim().toLowerCase();
  if (!query) {
    return users;
  }

  return users.filter((user) => {
    const roles = listRoles(user).join(" ").toLowerCase();
    return [user.fullName, user.email, user.Username, user.company, user.status, roles]
      .some((value) => String(value).toLowerCase().includes(query));
  });
}

function renderSummaryPill(value, label) {
  return `
    <article class="summary-pill">
      <strong>${escapeHtml(String(value))}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function renderRoleBadges(user) {
  const roles = listRoles(user);
  if (!roles.length) {
    return '<span class="role-pill muted">No flags</span>';
  }

  return roles
    .map((role) => `<span class="role-pill ${getRoleBadgeClass(role)}">${escapeHtml(role)}</span>`)
    .join("");
}

function getRoleBadgeClass(role) {
  switch (String(role).toLowerCase()) {
    case "super admin":
      return "super";
    case "admin":
      return "admin";
    case "owner":
      return "owner";
    case "judge":
      return "judge";
    case "volunteer":
      return "volunteer";
    default:
      return "";
  }
}

function getUserScopeLabel(user) {
  if (hasRole(user, "Super admin")) {
    return "Global access";
  }
  if (hasRole(user, "admin")) {
    return "Admin account";
  }
  if (hasRole(user, "owner")) {
    return "Company owner";
  }
  return "Staff account";
}

function getUserDisplayName(user) {
  return user.fullName || humanizeUsername(user.Username);
}

function getUserInitials(user) {
  const name = getUserDisplayName(user);
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    return "U";
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");
}

function humanizeUsername(username) {
  return String(username || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function renderStatusBadge(status) {
  const normalizedStatus = normalizeUserStatus(status);
  return `<span class="status-pill ${normalizedStatus.toLowerCase()}">${escapeHtml(normalizedStatus)}</span>`;
}

function renderPrimaryRoleBadge(user) {
  const primaryRole = getPrimaryRole(user);
  return `<span class="role-pill ${getRoleBadgeClass(primaryRole)}">${escapeHtml(primaryRole)}</span>`;
}

function getPrimaryRole(user) {
  if (hasRole(user, "Super admin")) {
    return "Super admin";
  }
  if (hasRole(user, "admin")) {
    return "Admin";
  }
  if (hasRole(user, "owner")) {
    return "Owner";
  }
  if (hasRole(user, "Judge")) {
    return "Judge";
  }
  if (hasRole(user, "Volunteer")) {
    return "Volunteer";
  }
  return "Staff";
}

async function onUserFormSubmit(event) {
  event.preventDefault();
  if (!canCreateUsers(state.currentUser)) {
    return;
  }

  const editingUsername = els.editUsername.value.trim();
  const existingUser = editingUsername ? findUserByUsername(editingUsername) : null;
  const isEditingExistingUser = Boolean(editingUsername);

  if (isEditingExistingUser && state.storageMode === STORAGE_MODE_LOCAL && !existingUser) {
    setStatus(els.userFormStatus, "The original user record could not be found. Refresh and try again.", true);
    return;
  }

  if (existingUser && !canManageRecord(state.currentUser, existingUser)) {
    setStatus(els.userFormStatus, "You cannot edit this user.", true);
    return;
  }

  const userPayload = buildUserPayload(existingUser, { isEditingExistingUser });
  if (!userPayload.fullName || !userPayload.Username || !userPayload.company) {
    setStatus(els.userFormStatus, "Full name, username, and company are required.", true);
    return;
  }
  if (!userPayload.password && !isEditingExistingUser) {
    setStatus(els.userFormStatus, "Password is required for new users.", true);
    return;
  }

  try {
    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      setStatus(els.userFormStatus, "Saving user to Supabase...");
      await saveUserToSupabase(userPayload, editingUsername || null);
      await refreshSessionAfterPotentialSelfEdit(editingUsername, userPayload);
      await refreshManagedUsers();
    } else {
      saveUserLocally(userPayload, editingUsername, existingUser);
    }

    refreshRoleSections();
    renderUsersTable();
    clearUserForm();
    setUserEditorOpen(false);
    setStatus(els.userFormStatus, "User saved.");
  } catch (error) {
    const saveError = formatUserSaveError(error, { isEditingExistingUser });
    setStatus(els.userFormStatus, saveError, true);
  }
}

function buildUserPayload(existingUser, { isEditingExistingUser = false } = {}) {
  const superAdmin = hasRole(state.currentUser, "Super admin");
  const manualPassword = els.formPassword.value;
  const password =
    state.storageMode === STORAGE_MODE_SUPABASE
      ? manualPassword
      : manualPassword || existingUser?.password || (isEditingExistingUser ? "__preserve__" : "");

  const newPayload = {
    fullName: els.formFullName.value.trim(),
    email: els.formEmail.value.trim(),
    Username: els.formUsername.value.trim(),
    password,
    company: superAdmin ? els.formCompany.value.trim() : state.currentUser.company,
    status: normalizeUserStatus(els.formStatus.value),
    createdAt: existingUser?.createdAt || new Date().toISOString(),
    lastLoginAt: existingUser?.lastLoginAt || "",
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

  if (state.storageMode !== STORAGE_MODE_SUPABASE && password === "__preserve__") {
    newPayload.password = "";
  }

  return newPayload;
}

function saveUserLocally(userPayload, editingUsername, existingUser) {
  const duplicate = state.users.find(
    (user) =>
      user.Username.toLowerCase() === userPayload.Username.toLowerCase() &&
      user.Username.toLowerCase() !== editingUsername.toLowerCase()
  );

  if (duplicate) {
    throw new Error("Username already exists.");
  }

  const superAdminCount = state.users.filter((user) => hasRole(user, "Super admin")).length;
  if (
    existingUser &&
    hasRole(existingUser, "Super admin") &&
    !hasRole(userPayload, "Super admin") &&
    superAdminCount <= 1
  ) {
    throw new Error("At least one Super admin account is required.");
  }

  if (existingUser) {
    const index = state.users.findIndex((user) => user.Username === existingUser.Username);
    state.users[index] = {
      ...existingUser,
      ...userPayload,
      createdAt: existingUser.createdAt || userPayload.createdAt,
      lastLoginAt: existingUser.lastLoginAt || userPayload.lastLoginAt,
    };
  } else {
    state.users.push(userPayload);
  }

  enforceAtLeastOneSuperAdmin();
  saveUsersToStorage();

  if (state.currentUser && editingUsername && editingUsername.toLowerCase() === state.currentUser.Username.toLowerCase()) {
    const refreshedCurrentUser = findUserByUsername(userPayload.Username);
    if (refreshedCurrentUser) {
      state.currentUser = refreshedCurrentUser;
      writeStoredSession(refreshedCurrentUser.Username, "");
    }
  }
}

async function deleteUser(user) {
  if (!canDeleteUsers(state.currentUser)) {
    setStatus(els.userFormStatus, "Only admins and super admins can delete users.", true);
    return;
  }
  if (!canManageRecord(state.currentUser, user)) {
    setStatus(els.userFormStatus, "You cannot delete this user.", true);
    return;
  }
  if (user.Username === state.currentUser.Username) {
    setStatus(els.userFormStatus, "You cannot delete your own active account.", true);
    return;
  }

  try {
    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      await callSupabaseRpc(SUPABASE_FUNCTIONS.deleteUser, {
        actor_username: state.currentUser.Username,
        actor_password: state.sessionSecret,
        target_username: user.Username,
      });
      await refreshManagedUsers();
    } else {
      const superAdminCount = state.users.filter((entry) => hasRole(entry, "Super admin")).length;
      if (hasRole(user, "Super admin") && superAdminCount <= 1) {
        setStatus(els.userFormStatus, "At least one Super admin account is required.", true);
        return;
      }

      state.users = state.users.filter((entry) => entry.Username !== user.Username);
      saveUsersToStorage();
    }

    renderUsersTable();
    setStatus(els.userFormStatus, `Deleted ${user.Username}.`);
  } catch (error) {
    setStatus(els.userFormStatus, formatSupabaseError(error, "Unable to delete user."), true);
  }
}

function exportUsersJson() {
  if (!canEditUsers(state.currentUser)) {
    return;
  }

  const exportUsers =
    state.storageMode === STORAGE_MODE_SUPABASE
      ? state.users
      : hasRole(state.currentUser, "Super admin")
        ? state.users
        : state.users.filter((user) => user.company === state.currentUser.company);

  const serialized = exportUsers.map((user) => ({
    ...user,
    password: state.storageMode === STORAGE_MODE_SUPABASE ? "" : user.password,
  }));

  const blob = new Blob([JSON.stringify(serialized, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ghmx-users-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);

  if (state.storageMode === STORAGE_MODE_SUPABASE) {
    setStatus(els.userFormStatus, "Exported users. Passwords are omitted from Supabase exports.");
  }
}

async function onImportUsers(event) {
  if (!canEditUsers(state.currentUser)) {
    els.importUsersInput.value = "";
    return;
  }

  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const imported = normalizeUsers(JSON.parse(text), {
      requirePassword: state.storageMode !== STORAGE_MODE_SUPABASE,
    });
    if (!imported.length) {
      throw new Error("No valid users found in file.");
    }

    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      setStatus(els.userFormStatus, "Importing users to Supabase...");
      let sessionPasswordCandidate = state.sessionSecret;

      for (const incoming of imported) {
        const safeIncoming = normalizeImportedUser(incoming);
        await saveUserToSupabase(safeIncoming, null);
        if (
          state.currentUser &&
          safeIncoming.Username.toLowerCase() === state.currentUser.Username.toLowerCase() &&
          safeIncoming.password
        ) {
          sessionPasswordCandidate = safeIncoming.password;
        }
      }

      if (sessionPasswordCandidate !== state.sessionSecret && state.currentUser) {
        state.sessionSecret = sessionPasswordCandidate;
        writeStoredSession(state.currentUser.Username, state.sessionSecret);
      }

      await refreshManagedUsers();
      renderUsersTable();
      setStatus(els.userFormStatus, `Import complete (${imported.length} users).`);
      return;
    }

    importUsersLocally(imported);
    renderUsersTable();
    setStatus(els.userFormStatus, "Import complete.");
  } catch (error) {
    setStatus(els.userFormStatus, `Import failed: ${error.message}`, true);
  } finally {
    els.importUsersInput.value = "";
  }
}

function importUsersLocally(imported) {
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
}

function normalizeImportedUser(incoming) {
  const safeIncoming = { ...incoming };
  if (!hasRole(state.currentUser, "Super admin")) {
    safeIncoming.company = state.currentUser.company;
    safeIncoming.admin = "";
    safeIncoming["Super admin"] = "";
  }
  return safeIncoming;
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

  updateJudgeTotal();
  const scoreValues = SCORE_INPUT_IDS.map((id) => normalizeScoreInput(id));
  const payload = {
    timestamp: new Date().toISOString(),
    judgeUsername: state.currentUser.Username,
    judgeCompany: state.currentUser.company,
    entrantId: document.getElementById("judge-entrant-id").value.trim(),
    category: document.getElementById("judge-category").value,
    craftsmanship: scoreValues[0],
    presentation: scoreValues[1],
    difficulty: scoreValues[2],
    themeFit: scoreValues[3],
    totalScore: Number(els.judgeTotal.textContent || "0"),
    comments: document.getElementById("judge-comments").value.trim(),
  };

  if (!payload.entrantId || !payload.category) {
    setStatus(els.judgeStatus, "Entrant ID and category are required.", true);
    return;
  }

  if (scoreValues.some((score) => score < 0 || score > 25)) {
    setStatus(els.judgeStatus, "Each score must be between 0 and 25.", true);
    return;
  }

  if (state.storageMode === STORAGE_MODE_SUPABASE) {
    try {
      setJudgeSubmitState(true);
      await callSupabaseRpc(SUPABASE_FUNCTIONS.submitJudgeScore, {
        actor_username: state.currentUser.Username,
        actor_password: state.sessionSecret,
        entrant_id: payload.entrantId,
        category: payload.category,
        craftsmanship: payload.craftsmanship,
        presentation: payload.presentation,
        difficulty: payload.difficulty,
        theme_fit: payload.themeFit,
        comments: payload.comments,
      });
      els.judgeForm.reset();
      updateJudgeTotal();
      await Promise.all([refreshJudgeResults(), refreshCategoryLeaders(), refreshAdminJudgeResults()]);
      setStatus(els.judgeStatus, "Score submitted to Supabase.");
    } catch (error) {
      setStatus(els.judgeStatus, formatSupabaseError(error, "Submit failed."), true);
    } finally {
      setJudgeSubmitState(false);
    }
    return;
  }

  const endpoint = state.config.google.judgeAppsScriptUrl.trim();
  const fallbackUrl = state.config.google.judgeFallbackFormUrl.trim();

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
    const body = new URLSearchParams({
      timestamp: payload.timestamp,
      judgeUsername: payload.judgeUsername,
      judgeCompany: payload.judgeCompany,
      entrantId: payload.entrantId,
      category: payload.category,
      craftsmanship: String(payload.craftsmanship),
      presentation: String(payload.presentation),
      difficulty: String(payload.difficulty),
      themeFit: String(payload.themeFit),
      totalScore: String(payload.totalScore),
      comments: payload.comments,
    });
    await fetch(endpoint, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
    });
    recordJudgeResult(payload);
    els.judgeForm.reset();
    updateJudgeTotal();
    await Promise.all([refreshJudgeResults(), refreshCategoryLeaders(), refreshAdminJudgeResults()]);
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

async function refreshJudgeResults(showStatus = false) {
  if (!canAccessJudgeDesk(state.currentUser)) {
    state.judgeResults = [];
    renderJudgeResults();
    return;
  }

  try {
    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      const result = await callSupabaseRpc(SUPABASE_FUNCTIONS.listJudgeResults, {
        actor_username: state.currentUser.Username,
        actor_password: state.sessionSecret,
      });
      state.judgeResults = asArray(result).map(normalizeJudgeResult);
    } else {
      state.judgeResults = getStoredJudgeResultsForCurrentUser();
    }

    renderJudgeResults();
    if (showStatus) {
      setStatus(els.judgeStatus, "Results refreshed.");
    }
  } catch (error) {
    if (showStatus) {
      setStatus(els.judgeStatus, formatSupabaseError(error, "Unable to refresh results."), true);
    }
  }
}

function renderJudgeResults() {
  if (!els.judgeResultsBody) {
    return;
  }

  if (!state.judgeResults.length) {
    els.judgeResultsBody.innerHTML = "<tr><td colspan='5'>No results submitted yet.</td></tr>";
    return;
  }

  els.judgeResultsBody.innerHTML = state.judgeResults
    .map((result) => {
      const submittedAt = formatDateTime(result.submittedAt);
      const comments = result.comments ? escapeHtml(result.comments) : "None";
      return `
        <tr>
          <td>${escapeHtml(submittedAt)}</td>
          <td>${escapeHtml(result.entrantId)}</td>
          <td>${escapeHtml(result.category)}</td>
          <td>${escapeHtml(String(result.totalScore))}</td>
          <td>${comments}</td>
        </tr>
      `;
    })
    .join("");
}

async function refreshCategoryLeaders(showStatus = false) {
  if (!canAccessJudgeDesk(state.currentUser)) {
    state.categoryLeaders = [];
    renderCategoryLeaders();
    return;
  }

  try {
    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      const result = await callSupabaseRpc(SUPABASE_FUNCTIONS.listCategoryLeaders, {
        actor_username: state.currentUser.Username,
        actor_password: state.sessionSecret,
      });
      state.categoryLeaders = asArray(result).map(normalizeCategoryLeader);
    } else {
      state.categoryLeaders = computeCategoryLeaders(readJudgeResultsFromStorage());
    }

    renderCategoryLeaders();
    if (showStatus) {
      setStatus(els.resultsStatus, "Leaderboard refreshed.");
    } else {
      setStatus(els.resultsStatus, "");
    }
  } catch (error) {
    state.categoryLeaders = [];
    renderCategoryLeaders();
    setStatus(els.resultsStatus, formatSupabaseError(error, "Unable to refresh leaderboard."), true);
  }
}

function renderCategoryLeaders() {
  if (!els.categoryResultsGrid) {
    return;
  }

  if (!canAccessJudgeDesk(state.currentUser)) {
    els.categoryResultsGrid.innerHTML = "";
    return;
  }

  els.categoryResultsGrid.innerHTML = getLeaderboardCategories()
    .map((category) => renderCategoryLeaderboardCard(category))
    .join("");
}

function renderCategoryLeaderboardCard(category) {
  const leaders = state.categoryLeaders.filter((entry) => entry.category === category).slice(0, CATEGORY_LEADER_LIMIT);

  if (!leaders.length) {
    return `
      <article class="leaderboard-card">
        <div class="leaderboard-head">
          <div>
            <p class="leaderboard-label">Category</p>
            <h3>${escapeHtml(category)}</h3>
          </div>
          <span class="leaderboard-summary">No scores yet</span>
        </div>
        <p class="leaderboard-empty">No judging submissions have been recorded in this category yet.</p>
      </article>
    `;
  }

  return `
    <article class="leaderboard-card">
      <div class="leaderboard-head">
        <div>
          <p class="leaderboard-label">Category</p>
          <h3>${escapeHtml(category)}</h3>
        </div>
        <span class="leaderboard-summary">Top ${leaders.length}</span>
      </div>
      <div class="leaderboard-list">
        ${leaders.map((entry) => renderLeaderboardRow(entry)).join("")}
      </div>
    </article>
  `;
}

function renderLeaderboardRow(entry) {
  return `
    <article class="leaderboard-row">
      <div class="leaderboard-rank leaderboard-rank-${Math.min(entry.position || 0, CATEGORY_LEADER_LIMIT)}">
        ${escapeHtml(String(entry.position))}
      </div>
      <div class="leaderboard-entry">
        <div class="leaderboard-entry-line">
          <strong>${escapeHtml(entry.entrantId)}</strong>
          <span>${escapeHtml(formatAverageScore(entry.averageScore))} avg</span>
        </div>
        <div class="leaderboard-meta">
          <span>Best ${escapeHtml(String(entry.bestTotal))}</span>
          <span>${escapeHtml(String(entry.scoreCount))} score${entry.scoreCount === 1 ? "" : "s"}</span>
          <span>Updated ${escapeHtml(formatDateTime(entry.latestSubmittedAt))}</span>
        </div>
      </div>
    </article>
  `;
}

function updateJudgeResultAdminControls() {
  const allowed = canManageJudgeResults(state.currentUser);
  els.judgeResultsAdminPanel?.classList.toggle("hidden", !allowed);

  if (!allowed) {
    state.adminJudgeResults = [];
    state.selectedJudgeResultIds = new Set();
    setStatus(els.manageResultsStatus, "");
  }

  syncJudgeResultSelectionUi();
}

async function refreshAdminJudgeResults(showStatus = false) {
  if (!canManageJudgeResults(state.currentUser)) {
    state.adminJudgeResults = [];
    state.selectedJudgeResultIds = new Set();
    renderAdminJudgeResults();
    return;
  }

  try {
    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      const result = await callSupabaseRpc(SUPABASE_FUNCTIONS.listAllJudgeResults, {
        actor_username: state.currentUser.Username,
        actor_password: state.sessionSecret,
      });
      state.adminJudgeResults = asArray(result).map(normalizeJudgeResult);
    } else {
      state.adminJudgeResults = getStoredJudgeResultsForAdmin();
    }

    pruneSelectedJudgeResultIds();
    renderAdminJudgeResults();
    if (showStatus) {
      setStatus(els.manageResultsStatus, "Score submissions refreshed.");
    } else {
      setStatus(els.manageResultsStatus, "");
    }
  } catch (error) {
    state.adminJudgeResults = [];
    state.selectedJudgeResultIds = new Set();
    renderAdminJudgeResults();
    setStatus(els.manageResultsStatus, formatSupabaseError(error, "Unable to load score submissions."), true);
  }
}

function renderAdminJudgeResults() {
  if (!els.adminResultsBody) {
    return;
  }

  if (!canManageJudgeResults(state.currentUser)) {
    els.adminResultsBody.innerHTML = "";
    syncJudgeResultSelectionUi();
    return;
  }

  if (!state.adminJudgeResults.length) {
    els.adminResultsBody.innerHTML =
      "<tr><td colspan='8'>No judging submissions are available to manage yet.</td></tr>";
    syncJudgeResultSelectionUi();
    return;
  }

  els.adminResultsBody.innerHTML = state.adminJudgeResults
    .map((result) => {
      const selected = state.selectedJudgeResultIds.has(String(result.id)) ? "checked" : "";
      const comments = result.comments ? escapeHtml(result.comments) : "None";

      return `
        <tr>
          <td>
            <label class="results-checkbox">
              <input type="checkbox" data-result-id="${escapeHtml(String(result.id))}" ${selected} />
              <span class="hidden">Select result ${escapeHtml(String(result.id))}</span>
            </label>
          </td>
          <td>${escapeHtml(formatDateTime(result.submittedAt))}</td>
          <td>${escapeHtml(result.judgeUsername)}</td>
          <td>${escapeHtml(result.judgeCompany)}</td>
          <td>${escapeHtml(result.entrantId)}</td>
          <td>${escapeHtml(result.category)}</td>
          <td>${escapeHtml(String(result.totalScore))}</td>
          <td>${comments}</td>
        </tr>
      `;
    })
    .join("");

  syncJudgeResultSelectionUi();
}

function onAdminResultsSelectionChange(event) {
  const checkbox = event.target.closest("input[data-result-id]");
  if (!checkbox) {
    return;
  }

  const resultId = String(checkbox.dataset.resultId || "");
  if (!resultId) {
    return;
  }

  if (checkbox.checked) {
    state.selectedJudgeResultIds.add(resultId);
  } else {
    state.selectedJudgeResultIds.delete(resultId);
  }

  syncJudgeResultSelectionUi();
}

function onToggleAllJudgeResults(event) {
  if (!canManageJudgeResults(state.currentUser)) {
    return;
  }

  const shouldSelectAll = Boolean(event.target.checked);
  state.selectedJudgeResultIds = shouldSelectAll
    ? new Set(state.adminJudgeResults.map((result) => String(result.id)))
    : new Set();

  renderAdminJudgeResults();
}

function pruneSelectedJudgeResultIds() {
  const validIds = new Set(state.adminJudgeResults.map((result) => String(result.id)));
  state.selectedJudgeResultIds = new Set(
    Array.from(state.selectedJudgeResultIds).filter((resultId) => validIds.has(resultId))
  );
}

function syncJudgeResultSelectionUi() {
  const total = state.adminJudgeResults.length;
  const selectedCount = state.selectedJudgeResultIds.size;

  if (els.deleteSelectedResultsBtn) {
    els.deleteSelectedResultsBtn.disabled = !selectedCount;
    els.deleteSelectedResultsBtn.textContent =
      selectedCount > 0 ? `Delete Selected (${selectedCount})` : "Delete Selected";
  }

  if (els.purgeResultsBtn) {
    els.purgeResultsBtn.disabled = !total;
  }

  if (els.selectAllResults) {
    const allSelected = total > 0 && selectedCount === total;
    els.selectAllResults.checked = allSelected;
    els.selectAllResults.indeterminate = selectedCount > 0 && selectedCount < total;
    els.selectAllResults.disabled = !total;
  }
}

async function deleteSelectedJudgeResults() {
  if (!canManageJudgeResults(state.currentUser)) {
    return;
  }

  const selectedIds = Array.from(state.selectedJudgeResultIds);
  if (!selectedIds.length) {
    setStatus(els.manageResultsStatus, "Select at least one score submission to delete.", true);
    return;
  }

  const confirmed = window.confirm(
    `Delete ${selectedIds.length} selected judging submission${selectedIds.length === 1 ? "" : "s"}?`
  );
  if (!confirmed) {
    return;
  }

  try {
    setJudgeResultAdminActionState(true);

    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      const result = await callSupabaseRpc(SUPABASE_FUNCTIONS.deleteJudgeResults, {
        actor_username: state.currentUser.Username,
        actor_password: state.sessionSecret,
        target_ids: selectedIds.map((resultId) => Number(resultId)),
        purge_all: false,
      });

      state.selectedJudgeResultIds = new Set();
      await Promise.all([refreshJudgeResults(), refreshCategoryLeaders(), refreshAdminJudgeResults()]);
      setStatus(
        els.manageResultsStatus,
        `Deleted ${Number(result?.deleted_count ?? selectedIds.length)} selected score submission${
          selectedIds.length === 1 ? "" : "s"
        }.`
      );
      return;
    }

    deleteJudgeResultsLocally(selectedIds);
    state.selectedJudgeResultIds = new Set();
    await Promise.all([refreshJudgeResults(), refreshCategoryLeaders(), refreshAdminJudgeResults()]);
    setStatus(
      els.manageResultsStatus,
      `Deleted ${selectedIds.length} selected score submission${selectedIds.length === 1 ? "" : "s"}.`
    );
  } catch (error) {
    setStatus(els.manageResultsStatus, formatSupabaseError(error, "Unable to delete selected results."), true);
  } finally {
    setJudgeResultAdminActionState(false);
  }
}

async function purgeAllJudgeResults() {
  if (!canManageJudgeResults(state.currentUser)) {
    return;
  }

  if (!state.adminJudgeResults.length) {
    setStatus(els.manageResultsStatus, "There are no score submissions to purge.", true);
    return;
  }

  const confirmed = window.confirm(
    "Purge all judging submissions? This will permanently clear every saved score and recalculate the leaderboard."
  );
  if (!confirmed) {
    return;
  }

  try {
    setJudgeResultAdminActionState(true);

    if (state.storageMode === STORAGE_MODE_SUPABASE) {
      const result = await callSupabaseRpc(SUPABASE_FUNCTIONS.deleteJudgeResults, {
        actor_username: state.currentUser.Username,
        actor_password: state.sessionSecret,
        target_ids: [],
        purge_all: true,
      });

      state.selectedJudgeResultIds = new Set();
      await Promise.all([refreshJudgeResults(), refreshCategoryLeaders(), refreshAdminJudgeResults()]);
      setStatus(
        els.manageResultsStatus,
        `Purged ${Number(result?.deleted_count ?? 0)} judging submission${
          Number(result?.deleted_count ?? 0) === 1 ? "" : "s"
        }.`
      );
      return;
    }

    saveJudgeResultsToStorage([]);
    state.selectedJudgeResultIds = new Set();
    await Promise.all([refreshJudgeResults(), refreshCategoryLeaders(), refreshAdminJudgeResults()]);
    setStatus(els.manageResultsStatus, "Purged all judging submissions.");
  } catch (error) {
    setStatus(els.manageResultsStatus, formatSupabaseError(error, "Unable to purge results."), true);
  } finally {
    setJudgeResultAdminActionState(false);
  }
}

function setJudgeResultAdminActionState(isBusy) {
  els.refreshAdminResultsBtn && (els.refreshAdminResultsBtn.disabled = isBusy);
  els.selectAllResults && (els.selectAllResults.disabled = isBusy || !state.adminJudgeResults.length);
  els.deleteSelectedResultsBtn && (els.deleteSelectedResultsBtn.disabled = isBusy || !state.selectedJudgeResultIds.size);
  els.purgeResultsBtn && (els.purgeResultsBtn.disabled = isBusy || !state.adminJudgeResults.length);

  if (!els.deleteSelectedResultsBtn || !els.purgeResultsBtn) {
    return;
  }

  if (isBusy) {
    els.deleteSelectedResultsBtn.textContent = "Working...";
    els.purgeResultsBtn.textContent = "Working...";
    return;
  }

  syncJudgeResultSelectionUi();
  els.purgeResultsBtn.textContent = "Purge All Results";
}

function recordJudgeResult(payload) {
  const storedResults = readJudgeResultsFromStorage();
  storedResults.unshift({
    id: createLocalJudgeResultId(),
    submittedAt: payload.timestamp,
    judgeUsername: payload.judgeUsername,
    judgeCompany: payload.judgeCompany,
    entrantId: payload.entrantId,
    category: payload.category,
    totalScore: payload.totalScore,
    comments: payload.comments,
  });
  saveJudgeResultsToStorage(storedResults.slice(0, 100));
}

function readJudgeResultsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_JUDGE_RESULTS_KEY);
    return raw ? asArray(JSON.parse(raw)).map(normalizeJudgeResult) : [];
  } catch (error) {
    console.warn("Ignoring invalid judge results storage:", error.message);
    return [];
  }
}

function saveJudgeResultsToStorage(results) {
  localStorage.setItem(STORAGE_JUDGE_RESULTS_KEY, JSON.stringify(results, null, 2));
}

function getStoredJudgeResultsForCurrentUser() {
  if (!state.currentUser) {
    return [];
  }

  return readJudgeResultsFromStorage()
    .filter((result) => result.judgeUsername.toLowerCase() === state.currentUser.Username.toLowerCase())
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
    .slice(0, MAX_JUDGE_RESULTS);
}

function getStoredJudgeResultsForAdmin() {
  return readJudgeResultsFromStorage().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
}

function deleteJudgeResultsLocally(targetIds) {
  const targetSet = new Set(targetIds.map(String));
  const filtered = readJudgeResultsFromStorage().filter((result) => !targetSet.has(String(result.id)));
  saveJudgeResultsToStorage(filtered);
}

function normalizeJudgeResult(raw, sourceIndex = 0) {
  return {
    id: String(raw?.id ?? raw?.resultId ?? raw?.result_id ?? buildLegacyJudgeResultId(raw, sourceIndex)),
    submittedAt: String(raw?.submittedAt ?? raw?.submitted_at ?? raw?.timestamp ?? new Date().toISOString()),
    judgeUsername: String(raw?.judgeUsername ?? raw?.judge_username ?? ""),
    judgeCompany: String(raw?.judgeCompany ?? raw?.judge_company ?? ""),
    entrantId: String(raw?.entrantId ?? raw?.entrant_id ?? "").trim(),
    category: String(raw?.category ?? "").trim(),
    totalScore: Number(raw?.totalScore ?? raw?.total_score ?? 0),
    comments: String(raw?.comments ?? "").trim(),
  };
}

function createLocalJudgeResultId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildLegacyJudgeResultId(raw, sourceIndex = 0) {
  const submittedAt = String(raw?.submittedAt ?? raw?.submitted_at ?? raw?.timestamp ?? "");
  const judgeUsername = String(raw?.judgeUsername ?? raw?.judge_username ?? "");
  const entrantId = String(raw?.entrantId ?? raw?.entrant_id ?? "");
  const category = String(raw?.category ?? "");
  return `legacy-${submittedAt}-${judgeUsername}-${entrantId}-${category}-${sourceIndex}`;
}

function normalizeCategoryLeader(raw) {
  return {
    category: String(raw?.category ?? "").trim(),
    entrantId: String(raw?.entrantId ?? raw?.entrant_id ?? "").trim(),
    position: Number(raw?.position ?? raw?.rank_position ?? 0) || 0,
    averageScore: Number(raw?.averageScore ?? raw?.average_score ?? 0),
    bestTotal: Number(raw?.bestTotal ?? raw?.best_total ?? 0),
    scoreCount: Number(raw?.scoreCount ?? raw?.score_count ?? 0),
    latestSubmittedAt: String(raw?.latestSubmittedAt ?? raw?.latest_submitted_at ?? ""),
  };
}

function computeCategoryLeaders(results) {
  const groupedEntries = new Map();

  results.map(normalizeJudgeResult).forEach((result) => {
    if (!result.category || !result.entrantId) {
      return;
    }

    const key = `${result.category}\u0000${result.entrantId}`;
    const existing = groupedEntries.get(key);

    if (existing) {
      existing.totalScoreSum += result.totalScore;
      existing.scoreCount += 1;
      existing.bestTotal = Math.max(existing.bestTotal, result.totalScore);
      if (new Date(result.submittedAt) > new Date(existing.latestSubmittedAt)) {
        existing.latestSubmittedAt = result.submittedAt;
      }
      return;
    }

    groupedEntries.set(key, {
      category: result.category,
      entrantId: result.entrantId,
      totalScoreSum: result.totalScore,
      scoreCount: 1,
      bestTotal: result.totalScore,
      latestSubmittedAt: result.submittedAt,
    });
  });

  const groupedByCategory = new Map();

  Array.from(groupedEntries.values()).forEach((entry) => {
    const normalized = {
      category: entry.category,
      entrantId: entry.entrantId,
      averageScore: entry.totalScoreSum / entry.scoreCount,
      bestTotal: entry.bestTotal,
      scoreCount: entry.scoreCount,
      latestSubmittedAt: entry.latestSubmittedAt,
    };

    if (!groupedByCategory.has(normalized.category)) {
      groupedByCategory.set(normalized.category, []);
    }

    groupedByCategory.get(normalized.category).push(normalized);
  });

  return Array.from(groupedByCategory.entries())
    .sort(([categoryA], [categoryB]) => categoryA.localeCompare(categoryB))
    .flatMap(([, entries]) =>
      entries
        .sort(compareCategoryLeaders)
        .slice(0, CATEGORY_LEADER_LIMIT)
        .map((entry, index) => ({
          ...entry,
          position: index + 1,
        }))
    );
}

function compareCategoryLeaders(a, b) {
  return (
    b.averageScore - a.averageScore ||
    b.bestTotal - a.bestTotal ||
    b.scoreCount - a.scoreCount ||
    new Date(b.latestSubmittedAt) - new Date(a.latestSubmittedAt) ||
    a.entrantId.localeCompare(b.entrantId)
  );
}

function getLeaderboardCategories() {
  const seen = new Set(JUDGE_CATEGORIES);
  const categories = JUDGE_CATEGORIES.slice();

  state.categoryLeaders
    .map((entry) => entry.category)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .forEach((category) => {
      if (seen.has(category)) {
        return;
      }
      seen.add(category);
      categories.push(category);
    });

  return categories;
}

function formatAverageScore(value) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }

  return rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

async function refreshManagedUsers() {
  if (!canAccessUserAccounts(state.currentUser)) {
    state.users = [];
    return;
  }

  if (state.storageMode !== STORAGE_MODE_SUPABASE) {
    return;
  }

  const result = await callSupabaseRpc(SUPABASE_FUNCTIONS.listUsers, {
    actor_username: state.currentUser.Username,
    actor_password: state.sessionSecret,
  });
  state.users = normalizeUsers(asArray(result), { requirePassword: false });
}

async function saveUserToSupabase(userPayload, originalUsername) {
  await callSupabaseRpc(SUPABASE_FUNCTIONS.upsertUser, {
    actor_username: state.currentUser.Username,
    actor_password: state.sessionSecret,
    original_username: originalUsername || null,
    target_full_name: userPayload.fullName,
    target_email: userPayload.email || null,
    target_username: userPayload.Username,
    target_password: userPayload.password || null,
    target_company: userPayload.company,
    target_status: userPayload.status,
    target_volunteer: hasRole(userPayload, "Volunteer"),
    target_owner: hasRole(userPayload, "owner"),
    target_judge: hasRole(userPayload, "Judge"),
    target_admin: hasRole(userPayload, "admin"),
    target_super_admin: hasRole(userPayload, "Super admin"),
  });
}

async function refreshSessionAfterPotentialSelfEdit(editingUsername, userPayload) {
  if (!editingUsername || !state.currentUser) {
    return;
  }
  if (editingUsername.toLowerCase() !== state.currentUser.Username.toLowerCase()) {
    return;
  }

  if (state.storageMode === STORAGE_MODE_SUPABASE) {
    const nextPassword = userPayload.password || state.sessionSecret;
    const refreshed = await authenticateSupabase(userPayload.Username, nextPassword);
    state.currentUser = refreshed;
    state.sessionSecret = nextPassword;
    writeStoredSession(refreshed.Username, nextPassword);
    return;
  }

  const refreshedCurrentUser = findUserByUsername(userPayload.Username);
  if (refreshedCurrentUser) {
    state.currentUser = refreshedCurrentUser;
    writeStoredSession(refreshedCurrentUser.Username, "");
  }
}

async function authenticateSupabase(username, password) {
  if (!password) {
    throw new Error("Stored session needs a password to reconnect to Supabase.");
  }

  const result = await callSupabaseRpc(SUPABASE_FUNCTIONS.login, {
    p_username: username,
    p_password: password,
  });
  const [user] = normalizeUsers(asArray(result), { requirePassword: false });
  if (!user) {
    throw new Error("Invalid username or password.");
  }
  return user;
}

function authenticateLocal(username, password) {
  const user = state.users.find(
    (entry) => entry.Username.toLowerCase() === username.toLowerCase() && entry.password === password
  );

  if (!user) {
    throw new Error("Invalid username or password.");
  }
  return user;
}

function markLocalUserLogin(username) {
  const index = state.users.findIndex((entry) => entry.Username.toLowerCase() === username.toLowerCase());
  if (index < 0) {
    return null;
  }

  const updatedUser = {
    ...state.users[index],
    lastLoginAt: new Date().toISOString(),
  };
  state.users[index] = updatedUser;
  saveUsersToStorage();
  return updatedUser;
}

function restoreLocalSessionUser(username) {
  return findUserByUsername(username) || null;
}

function hydrateLocalUsers() {
  const storedUsers = readUsersFromStorage();
  state.users = storedUsers.length ? storedUsers : state.seedUsers.slice();
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

function normalizeUsers(input, { requirePassword = true } = {}) {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((raw) => normalizeUser(raw))
    .filter((user) => user.Username && user.company && (!requirePassword || user.password));
}

function normalizeUser(raw) {
  const user = {
    fullName: String(raw?.fullName ?? raw?.full_name ?? "").trim(),
    email: String(raw?.email ?? "").trim(),
    Username: String(raw?.Username ?? raw?.username ?? "").trim(),
    password: String(raw?.password ?? ""),
    company: String(raw?.company ?? "").trim(),
    status: normalizeUserStatus(raw?.status),
    createdAt: String(raw?.createdAt ?? raw?.created_at ?? new Date().toISOString()),
    lastLoginAt: String(raw?.lastLoginAt ?? raw?.last_login_at ?? ""),
    Volunteer: normalizeRoleValue(raw?.Volunteer ?? raw?.volunteer),
    owner: normalizeRoleValue(raw?.owner),
    Judge: normalizeRoleValue(raw?.Judge ?? raw?.judge),
    admin: normalizeRoleValue(raw?.admin),
    "Super admin": normalizeRoleValue(raw?.["Super admin"] ?? raw?.super_admin),
  };

  if (user["Super admin"] === "1") {
    user.admin = "1";
  }
  if (!user.fullName) {
    user.fullName = humanizeUsername(user.Username);
  }
  return user;
}

function normalizeRoleValue(value) {
  if (value === true) {
    return "1";
  }
  return String(value ?? "").trim() === "1" ? "1" : "";
}

function normalizeUserStatus(value) {
  const normalized = String(value ?? "Active").trim().toLowerCase();
  const allowedStatuses = {
    active: "Active",
    inactive: "Inactive",
    pending: "Pending",
    suspended: "Suspended",
    banned: "Banned",
  };
  return allowedStatuses[normalized] || "Active";
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

function readStoredSession() {
  const raw = localStorage.getItem(STORAGE_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        username: String(parsed.username ?? ""),
        password: String(parsed.password ?? ""),
      };
    }
  } catch (error) {
    return {
      username: String(raw),
      password: "",
    };
  }

  return null;
}

function writeStoredSession(username, password = "") {
  localStorage.setItem(
    STORAGE_SESSION_KEY,
    JSON.stringify({
      username,
      password,
    })
  );
}

function clearStoredSession() {
  localStorage.removeItem(STORAGE_SESSION_KEY);
}

function hasSupabaseConfig() {
  const { supabase } = state.config;
  return Boolean(supabase.enabled && supabase.url && supabase.publishableKey);
}

async function callSupabaseRpc(functionName, payload) {
  const { url, publishableKey } = state.config.supabase;
  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/rpc/${functionName}`;
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload ?? {}),
  });

  const raw = await response.text();
  const data = raw ? tryParseJson(raw) : null;

  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.hint || response.statusText || "RPC failed";
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (!value) {
    return [];
  }
  return [value];
}

function setStorageState(message, tone = "") {
  els.storageChip.textContent = message;
  els.storageChip.classList.remove("ok", "warn", "error");
  if (tone) {
    els.storageChip.classList.add(tone);
  }
}

function updateUsersStorageHint() {
  if (!els.usersStorageHint) {
    return;
  }

  if (state.storageMode === STORAGE_MODE_SUPABASE) {
    els.usersStorageHint.textContent =
      "User changes are stored in Supabase. Exports omit passwords because the database stores password hashes.";
    return;
  }

  if (hasSupabaseConfig()) {
    els.usersStorageHint.textContent =
      "Supabase is configured, but the portal SQL setup is not live yet. User changes are temporarily stored in browser local storage.";
    return;
  }

  els.usersStorageHint.textContent =
    "User changes are stored in browser local storage for GitHub Pages compatibility.";
}

function formatAuthError(error) {
  if (!error) {
    return "Unable to sign in.";
  }
  const message = String(error.message || error);
  if (/Invalid username or password/i.test(message)) {
    return "Invalid username or password.";
  }
  return formatSupabaseError(error, "Unable to sign in.");
}

function formatUserSaveError(error, { isEditingExistingUser = false } = {}) {
  if (
    isEditingExistingUser &&
    /Password is required for new users/i.test(String(error?.message || ""))
  ) {
    return "Supabase user management needs the latest email/profile fix. Run docs/supabase-user-management-upgrade.sql in Supabase SQL Editor.";
  }

  return formatSupabaseError(error, "Unable to save user.");
}

function formatSupabaseError(error, fallbackMessage) {
  if (!error) {
    return fallbackMessage;
  }

  const message = String(error.message || fallbackMessage || "Request failed.");
  if (/portal_upsert_user|full_name|last_login_at|target_full_name|target_status/i.test(message)) {
    return "User management needs the latest profile patch. Run docs/supabase-user-management-upgrade.sql in Supabase SQL Editor.";
  }
  if (/portal_list_all_judge_results|portal_delete_judge_results/i.test(message)) {
    return "Judge-results management needs the latest Supabase admin patch. Run docs/supabase-judge-results-admin-patch.sql in Supabase SQL Editor.";
  }
  if (/portal_list_category_leaders/i.test(message)) {
    return "The Results page needs the latest Supabase SQL patch. Run docs/supabase-results-page-patch.sql in Supabase SQL Editor.";
  }
  if (/schema cache|Could not find the function|does not exist/i.test(message)) {
    return "Supabase is configured, but the portal SQL setup has not been applied yet.";
  }
  if (/duplicate key value/i.test(message)) {
    return "That username already exists.";
  }
  return message;
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

function canAccessUserAccounts(user) {
  return hasRole(user, "owner") || hasRole(user, "admin") || hasRole(user, "Super admin");
}

function canCreateUsers(user) {
  return canAccessUserAccounts(user);
}

function canEditUsers(user) {
  return hasRole(user, "admin") || hasRole(user, "Super admin");
}

function canDeleteUsers(user) {
  return canEditUsers(user);
}

function canAccessJudgeDesk(user) {
  return hasRole(user, "Judge") || hasRole(user, "admin") || hasRole(user, "Super admin");
}

function canManageJudgeResults(user) {
  return hasRole(user, "Super admin") || (hasRole(user, "admin") && hasRole(user, "Judge"));
}

function canAccessVolunteerTools(user) {
  return hasRole(user, "Volunteer") || hasRole(user, "admin") || hasRole(user, "Super admin");
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
  if (!state.currentUser) {
    return [];
  }

  if (state.storageMode === STORAGE_MODE_SUPABASE) {
    return state.users.slice().sort(sortByUsername);
  }

  if (hasRole(state.currentUser, "Super admin")) {
    return state.users.slice().sort(sortByUsername);
  }

  if (hasRole(state.currentUser, "admin") || hasRole(state.currentUser, "owner")) {
    return state.users
      .filter((user) => user.company === state.currentUser.company && !hasRole(user, "Super admin"))
      .sort(sortByUsername);
  }

  return [];
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
  node.classList.remove("warn");
}

function formatDateOnly(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(value) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const diffMs = date.getTime() - Date.now();
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const month = 30 * day;

  if (Math.abs(diffMs) < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute");
  }
  if (Math.abs(diffMs) < day) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }
  if (Math.abs(diffMs) < month) {
    return rtf.format(Math.round(diffMs / day), "day");
  }
  return rtf.format(Math.round(diffMs / month), "month");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
