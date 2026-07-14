import {
  formatJobTiming,
  resumeMatchDetails,
  resumeMatchScore,
  sortJobsRecommended,
  sourceLabel,
} from "./job-utils.js?v=20260714-2";
import { readPdfPageText } from "./pdf-utils.js?v=20260713-4";

const config = window.NEW_GRAD_ALERTS_CONFIG || {};
const SOURCE_KEYS = new Set([
  "new_grad",
  "canada_new_grad",
  "internship",
  "offseason_internship",
  "ats",
]);
const APPLICATION_STATUSES = [
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
];
const JOB_PAGE_SIZE = 40;
const ACCOUNT_MIGRATION_KEY = "job-alerts-pending-account-migration";
const ONESIGNAL_IDENTITY_KEY = "job-alerts-onesignal-user";
const MIGRATABLE_PREFERENCE_FIELDS = [
  "source_keys",
  "companies",
  "locations",
  "role_categories",
  "include_keywords",
  "exclude_keywords",
  "remote_only",
  "allow_no_sponsorship",
  "allow_citizenship_required",
  "closure_alerts",
  "minimum_score",
  "email_fallback",
];
const MIGRATABLE_PROFILE_FIELDS = [
  "timezone",
  "delivery_mode",
  "digest_hour",
  "quiet_start",
  "quiet_end",
];
const SKILL_PATTERNS = {
  Python: /\bpython\b/i,
  Java: /\bjava\b/i,
  JavaScript: /\bjavascript\b|\bnode\.?js\b/i,
  TypeScript: /\btypescript\b/i,
  "C#": /\bc#\b|\.net\b/i,
  React: /\breact(?:\.?js)?\b/i,
  AWS: /\baws\b|amazon web services/i,
  Azure: /\bazure\b/i,
  Docker: /\bdocker\b|container/i,
  Kubernetes: /\bkubernetes\b|\bk8s\b/i,
  SQL: /\bsql\b|postgres|mysql/i,
  MongoDB: /\bmongodb\b/i,
  "Distributed Systems": /distributed systems|microservices|event-driven/i,
  Observability: /observability|telemetry|tracing|new relic|cloudwatch/i,
  "AI / ML": /\bai\b|machine learning|deep learning|large language model|\bllm\b/i,
  Security: /security|authentication|authorization|jwt/i,
};

const elements = {
  accountButton: document.querySelector("#account-button"),
  accountClose: document.querySelector("#account-close"),
  accountDialog: document.querySelector("#account-dialog"),
  accountForm: document.querySelector("#account-form"),
  accountHeading: document.querySelector("#account-heading"),
  accountStatus: document.querySelector("#account-status"),
  signedOutControls: document.querySelector("#signed-out-controls"),
  signedInControls: document.querySelector("#signed-in-controls"),
  signoutButton: document.querySelector("#signout-button"),
  exportDataButton: document.querySelector("#export-data-button"),
  deleteAccountButton: document.querySelector("#delete-account-button"),
  deleteAccountDialog: document.querySelector("#delete-account-dialog"),
  deleteAccountForm: document.querySelector("#delete-account-form"),
  deleteAccountConfirmation: document.querySelector("#delete-account-confirmation"),
  deleteAccountStatus: document.querySelector("#delete-account-status"),
  googleSignin: document.querySelector("#google-signin"),
  googleDivider: document.querySelector("#google-divider"),
  magicLinkSignin: document.querySelector("#magic-link-signin"),
  authEmail: document.querySelector("#auth-email"),
  navButtons: [...document.querySelectorAll("[data-view]")],
  views: [...document.querySelectorAll(".app-view")],
  locations: document.querySelector("#locations-input"),
  eligibility: document.querySelector("#eligibility-select"),
  remote: document.querySelector("#remote-select"),
  roleCategories: [
    ...document.querySelectorAll('input[name="role-category[]"]'),
  ],
  includeKeywords: document.querySelector("#include-keywords"),
  excludeKeywords: document.querySelector("#exclude-keywords"),
  minimumScore: document.querySelector("#minimum-score"),
  minimumScoreOutput: document.querySelector("#minimum-score-output"),
  closureAlerts: document.querySelector("#closure-alerts"),
  emailFallback: document.querySelector("#email-fallback"),
  emailFallbackHelp: document.querySelector("#email-fallback-help"),
  deliveryMode: document.querySelector("#delivery-mode"),
  timezone: document.querySelector("#timezone-input"),
  digestHour: document.querySelector("#digest-hour"),
  quietStart: document.querySelector("#quiet-start"),
  quietEnd: document.querySelector("#quiet-end"),
  monitorForm: document.querySelector("#monitor-form"),
  monitorCompany: document.querySelector("#monitor-company"),
  monitorUrl: document.querySelector("#monitor-url"),
  monitorList: document.querySelector("#monitor-list"),
  refreshJobs: document.querySelector("#refresh-jobs"),
  jobSearch: document.querySelector("#job-search"),
  jobFeedMode: document.querySelector("#job-feed-mode"),
  jobRoleFilter: document.querySelector("#job-role-filter"),
  jobSourceFilter: document.querySelector("#job-source-filter"),
  jobApplicationFilter: document.querySelector("#job-application-filter"),
  jobSort: document.querySelector("#job-sort"),
  jobRemoteFilter: document.querySelector("#job-remote-filter"),
  jobUnseenFilter: document.querySelector("#job-unseen-filter"),
  jobResultsStatus: document.querySelector("#job-results-status"),
  loadMoreJobs: document.querySelector("#load-more-jobs"),
  jobList: document.querySelector("#job-list"),
  applicationSummary: document.querySelector("#application-summary"),
  applicationList: document.querySelector("#application-list"),
  addApplicationButton: document.querySelector("#add-application-button"),
  exportApplicationsButton: document.querySelector("#export-applications-button"),
  showArchivedApplications: document.querySelector("#show-archived-applications"),
  applicationDialog: document.querySelector("#application-dialog"),
  applicationForm: document.querySelector("#application-form"),
  applicationId: document.querySelector("#application-id"),
  applicationCompany: document.querySelector("#application-company"),
  applicationTitle: document.querySelector("#application-title"),
  applicationLocation: document.querySelector("#application-location"),
  applicationUrl: document.querySelector("#application-url"),
  applicationStatus: document.querySelector("#application-status-input"),
  applicationDeadline: document.querySelector("#application-deadline"),
  applicationNextStep: document.querySelector("#application-next-step"),
  applicationContact: document.querySelector("#application-contact"),
  applicationArchived: document.querySelector("#application-archived"),
  applicationNotes: document.querySelector("#application-notes"),
  inboxSummary: document.querySelector("#inbox-summary"),
  inboxList: document.querySelector("#inbox-list"),
  markInboxRead: document.querySelector("#mark-inbox-read"),
  testAlertButton: document.querySelector("#test-alert-button"),
  inboxTestAlertButton: document.querySelector("#inbox-test-alert-button"),
  testAlertStatus: document.querySelector("#test-alert-status"),
  setupHealthList: document.querySelector("#setup-health-list"),
  systemHealthGrid: document.querySelector("#system-health-grid"),
  refreshStatusButton: document.querySelector("#refresh-status-button"),
  resumeFile: document.querySelector("#resume-file"),
  resumeStatus: document.querySelector("#resume-status"),
  resumeSkills: document.querySelector("#resume-skills"),
  removeResumeButton: document.querySelector("#remove-resume-button"),
};

let client = null;
let currentUser = null;
let currentProfile = null;
let currentPreferences = null;
let jobs = [];
let applications = [];
let jobOffset = 0;
let jobTotal = 0;
let jobLoadVersion = 0;
let jobSearchTimer = null;
let systemHealth = null;
let readyResolve;
const ready = new Promise((resolve) => {
  readyResolve = resolve;
});

function setText(element, value, isError = false) {
  element.textContent = value;
  element.style.color = isError ? "#ff9aa7" : "";
}

function parseList(value) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function isSignedIn() {
  return Boolean(currentUser && !currentUser.is_anonymous);
}

function selectedFields(record, fields) {
  return Object.fromEntries(
    fields
      .filter((field) => Object.hasOwn(record, field))
      .map((field) => [field, record[field]]),
  );
}

function requireAccount(message) {
  if (isSignedIn()) {
    return true;
  }
  setText(elements.accountStatus, message);
  elements.accountDialog.showModal();
  return false;
}

function createHealthItem(label, value, state = "ready") {
  const item = document.createElement("div");
  item.className = "health-item";
  item.dataset.state = state;
  const strong = document.createElement("strong");
  strong.textContent = value;
  const span = document.createElement("span");
  span.textContent = label;
  item.append(strong, span);
  return item;
}

function formatRelativeTime(value) {
  if (!value) {
    return "Never";
  }
  const elapsedMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000),
  );
  if (elapsedMinutes < 2) {
    return "Just now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} minutes ago`;
  }
  const hours = Math.round(elapsedMinutes / 60);
  return hours < 48 ? `${hours} hours ago` : `${Math.round(hours / 24)} days ago`;
}

function renderSetupHealth() {
  const pushActive = Boolean(window.JobAlertsUI?.isPushActive());
  const companies = currentPreferences?.companies?.length || 0;
  const scanAt = systemHealth?.last_successful_scan_at;
  const scanAge = scanAt ? Date.now() - new Date(scanAt).getTime() : Infinity;
  elements.setupHealthList.replaceChildren(
    createHealthItem(
      "Account",
      isSignedIn() ? "Connected" : "Sign in required",
      isSignedIn() ? "ready" : "error",
    ),
    createHealthItem(
      "Resume",
      currentProfile?.resume_path ? "Processed" : "Not uploaded",
      currentProfile?.resume_path ? "ready" : "warning",
    ),
    createHealthItem(
      "Companies",
      companies ? `${companies} selected` : "None selected",
      companies ? "ready" : "error",
    ),
    createHealthItem(
      "Push delivery",
      pushActive ? "Enabled" : "Unavailable",
      pushActive
        ? "ready"
        : currentPreferences?.email_fallback
          ? "warning"
          : "error",
    ),
    createHealthItem(
      "Email fallback",
      systemHealth?.email_fallback_configured
        ? currentPreferences?.email_fallback
          ? "Enabled"
          : "Off"
        : "Needs provider setup",
      systemHealth?.email_fallback_configured &&
        currentPreferences?.email_fallback
        ? "ready"
        : "warning",
    ),
    createHealthItem(
      "Last successful scan",
      formatRelativeTime(scanAt),
      scanAge <= 3 * 60 * 60 * 1000 ? "ready" : "error",
    ),
  );
}

async function jobAlertsUI() {
  if (window.JobAlertsUI) {
    return window.JobAlertsUI;
  }
  await new Promise((resolve) => {
    window.addEventListener("job-alerts-ui-ready", resolve, { once: true });
  });
  return window.JobAlertsUI;
}

function populateDigestHours() {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    timeZone: "UTC",
  });
  for (let hour = 0; hour < 24; hour += 1) {
    const option = document.createElement("option");
    option.value = String(hour);
    option.textContent = formatter.format(new Date(Date.UTC(2020, 0, 1, hour)));
    elements.digestHour.append(option);
  }
  elements.digestHour.value = "9";
}

function addTimezoneOption(parent, value, label = value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  parent.append(option);
}

function ensureTimezoneOption(value) {
  if (
    value &&
    ![...elements.timezone.options].some((option) => option.value === value)
  ) {
    addTimezoneOption(elements.timezone, value);
  }
}

function populateTimezones() {
  const detected =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  const commonTimezones = [
    ["America/Los_Angeles", "Pacific Time (Los Angeles)"],
    ["America/Denver", "Mountain Time (Denver)"],
    ["America/Chicago", "Central Time (Chicago)"],
    ["America/New_York", "Eastern Time (New York)"],
    ["America/Phoenix", "Arizona"],
    ["America/Anchorage", "Alaska"],
    ["Pacific/Honolulu", "Hawaii"],
    ["America/Toronto", "Toronto"],
    ["America/Vancouver", "Vancouver"],
    ["UTC", "UTC"],
  ];
  if (!commonTimezones.some(([value]) => value === detected)) {
    commonTimezones.unshift([detected, `${detected} (Detected)`]);
  }

  const commonGroup = document.createElement("optgroup");
  commonGroup.label = "Common timezones";
  for (const [value, label] of commonTimezones) {
    addTimezoneOption(commonGroup, value, label);
  }
  elements.timezone.append(commonGroup);

  const commonValues = new Set(commonTimezones.map(([value]) => value));
  const allTimezones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  if (allTimezones.length) {
    const allGroup = document.createElement("optgroup");
    allGroup.label = "All timezones";
    for (const timezone of allTimezones) {
      if (!commonValues.has(timezone)) {
        addTimezoneOption(allGroup, timezone);
      }
    }
    elements.timezone.append(allGroup);
  }
  elements.timezone.value = detected;
}

function showView(name) {
  for (const view of elements.views) {
    view.classList.toggle("hidden", view.id !== `view-${name}`);
  }
  for (const button of elements.navButtons) {
    button.classList.toggle("active", button.dataset.view === name);
  }
  history.replaceState(null, "", `#${name}`);
  if (name === "jobs") {
    resetAndLoadJobs();
  } else if (name === "applications") {
    loadApplications();
  } else if (name === "inbox") {
    loadInbox();
  } else if (name === "status") {
    loadSystemHealth();
  }
}

function populateAdvancedPreferences(preferences, profile) {
  currentPreferences = preferences;
  currentProfile = profile;
  elements.locations.value = (preferences.locations || []).join(", ");
  elements.includeKeywords.value = (preferences.include_keywords || []).join(", ");
  elements.excludeKeywords.value = (preferences.exclude_keywords || []).join(", ");
  elements.remote.value = preferences.remote_only ? "remote" : "any";
  elements.eligibility.value = !preferences.allow_no_sponsorship
    ? "sponsorship"
    : !preferences.allow_citizenship_required
      ? "no_citizenship"
      : "any";
  elements.minimumScore.value = String(preferences.minimum_score || 0);
  elements.minimumScoreOutput.value = `${preferences.minimum_score || 0}%`;
  elements.closureAlerts.checked = preferences.closure_alerts !== false;
  elements.emailFallback.checked = preferences.email_fallback === true;
  for (const input of elements.roleCategories) {
    input.checked = (preferences.role_categories || []).includes(input.value);
  }
  elements.deliveryMode.value = profile.delivery_mode || "instant";
  const timezone =
    profile.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "America/Los_Angeles";
  ensureTimezoneOption(timezone);
  elements.timezone.value = timezone;
  elements.digestHour.value = String(profile.digest_hour ?? 9);
  elements.quietStart.value = (profile.quiet_start || "").slice(0, 5);
  elements.quietEnd.value = (profile.quiet_end || "").slice(0, 5);
  renderResumeProfile(profile.resume_profile || {});
}

function collectAdvancedPreferences() {
  const eligibility = elements.eligibility.value;
  return {
    locations: parseList(elements.locations.value),
    role_categories: elements.roleCategories
      .filter((input) => input.checked)
      .map((input) => input.value),
    include_keywords: parseList(elements.includeKeywords.value),
    exclude_keywords: parseList(elements.excludeKeywords.value),
    remote_only: elements.remote.value === "remote",
    allow_no_sponsorship: eligibility !== "sponsorship",
    allow_citizenship_required: eligibility === "any",
    closure_alerts: elements.closureAlerts.checked,
    email_fallback: elements.emailFallback.checked,
    minimum_score: Number(elements.minimumScore.value),
  };
}

async function persistPreferences(basicPreferences) {
  if (!currentUser) {
    throw new Error("Supabase session is not ready.");
  }

  const sourceKeys = basicPreferences.source_keys.filter((key) =>
    SOURCE_KEYS.has(key),
  );
  const preferenceUpdate = {
    ...collectAdvancedPreferences(),
    companies: basicPreferences.companies,
    source_keys: sourceKeys,
  };
  const profileUpdate = {
    timezone: elements.timezone.value.trim() || "America/Los_Angeles",
    delivery_mode: elements.deliveryMode.value,
    digest_hour: Number(elements.digestHour.value),
    quiet_start: elements.quietStart.value || null,
    quiet_end: elements.quietEnd.value || null,
  };

  const [{ data: preferences, error: preferenceError }, { data: profile, error: profileError }] =
    await Promise.all([
      client
        .from("preferences")
        .update(preferenceUpdate)
        .eq("user_id", currentUser.id)
        .select()
        .single(),
      client
        .from("profiles")
        .update(profileUpdate)
        .eq("id", currentUser.id)
        .select()
        .single(),
    ]);
  if (preferenceError) {
    throw preferenceError;
  }
  if (profileError) {
    throw profileError;
  }
  currentPreferences = preferences;
  currentProfile = profile;
  renderSetupHealth();
}

async function savePreferences(basicPreferences) {
  await ready;
  return persistPreferences(basicPreferences);
}

window.JobAlertsData = {
  savePreferences,
  isAuthenticated: isSignedIn,
  ensurePushIdentity: () => syncOneSignalIdentity({ required: true }),
};

async function syncOneSignalIdentity({ required = false } = {}) {
  const ui = await jobAlertsUI();
  const sdk = await ui.pushReady;
  if (!sdk) {
    if (required) {
      throw new Error("Push notifications are not available in this browser.");
    }
    return false;
  }

  const userId = isSignedIn() ? currentUser.id : null;
  try {
    if (userId) {
      await sdk.login(userId);
      if (currentUser?.id === userId) {
        localStorage.setItem(ONESIGNAL_IDENTITY_KEY, userId);
        return true;
      }
      if (required) {
        throw new Error("The signed-in account changed while linking push.");
      }
      return false;
    }
    await sdk.logout();
    if (!isSignedIn()) {
      localStorage.removeItem(ONESIGNAL_IDENTITY_KEY);
    }
    return true;
  } catch (error) {
    if (currentUser?.id === userId) {
      setText(
        elements.accountStatus,
        "Signed in, but push notification identity is still connecting.",
        true,
      );
    }
    if (required) {
      throw new Error(
        "Push notification identity could not be linked. Reload and try again.",
        { cause: error },
      );
    }
    return false;
  }
}

function renderAccount() {
  const signedIn = isSignedIn();
  const displayName =
    currentProfile?.display_name ||
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email;
  elements.accountButton.textContent = signedIn
    ? displayName || "Account"
    : "Sign in";
  elements.accountButton.title = signedIn ? currentUser.email || "" : "";
  elements.accountHeading.textContent = signedIn
    ? "Your account"
    : "Sign in to Job Alerts";
  elements.signedOutControls.classList.toggle("hidden", signedIn);
  elements.signedInControls.classList.toggle("hidden", !signedIn);
  elements.accountClose.classList.toggle("hidden", !signedIn);
  elements.googleSignin.disabled = signedIn || !config.googleAuthEnabled;
  elements.magicLinkSignin.disabled = signedIn;
  document.body.classList.toggle("auth-required", !signedIn);
  setText(
    elements.accountStatus,
    signedIn
      ? `Signed in as ${currentUser.email}. Preferences sync across devices.`
      : "Sign in with Google or email to continue.",
  );
  if (signedIn) {
    if (elements.accountDialog.open) {
      elements.accountDialog.close();
    }
  } else if (!elements.accountDialog.open) {
    elements.accountDialog.showModal();
  }
  renderSetupHealth();
}

async function preserveAnonymousPreferences(user) {
  const [
    { data: profile, error: profileError },
    { data: preferences, error: preferenceError },
  ] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).single(),
    client
      .from("preferences")
      .select("*")
      .eq("user_id", user.id)
      .single(),
  ]);
  if (profileError) {
    throw profileError;
  }
  if (preferenceError) {
    throw preferenceError;
  }
  localStorage.setItem(
    ACCOUNT_MIGRATION_KEY,
    JSON.stringify({
      profile: selectedFields(profile, MIGRATABLE_PROFILE_FIELDS),
      preferences: selectedFields(
        preferences,
        MIGRATABLE_PREFERENCE_FIELDS,
      ),
    }),
  );
}

function pendingAccountMigration() {
  const serialized = localStorage.getItem(ACCOUNT_MIGRATION_KEY);
  if (!serialized) {
    return null;
  }
  try {
    return JSON.parse(serialized);
  } catch (error) {
    localStorage.removeItem(ACCOUNT_MIGRATION_KEY);
    throw new Error("Stored guest preferences could not be migrated.", {
      cause: error,
    });
  }
}

async function migrateAnonymousPreferences(profile, preferences) {
  const pending = pendingAccountMigration();
  if (!pending) {
    return { profile, preferences };
  }
  if (preferences.companies.length && !pending.preferencesMigrated) {
    localStorage.removeItem(ACCOUNT_MIGRATION_KEY);
    return { profile, preferences };
  }

  let migratedPreferences = preferences;
  let migratedProfile = profile;
  if (!pending.preferencesMigrated) {
    const { data, error } = await client
      .from("preferences")
      .update(pending.preferences)
      .eq("user_id", currentUser.id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    migratedPreferences = data;
    pending.preferencesMigrated = true;
    localStorage.setItem(ACCOUNT_MIGRATION_KEY, JSON.stringify(pending));
  }
  if (!pending.profileMigrated) {
    const { data, error } = await client
      .from("profiles")
      .update(pending.profile)
      .eq("id", currentUser.id)
      .select()
      .single();
    if (error) {
      throw error;
    }
    migratedProfile = data;
    pending.profileMigrated = true;
    localStorage.setItem(ACCOUNT_MIGRATION_KEY, JSON.stringify(pending));
  }
  localStorage.removeItem(ACCOUNT_MIGRATION_KEY);
  return {
    profile: migratedProfile,
    preferences: migratedPreferences,
  };
}

async function registeredSession(session) {
  if (!session?.user?.is_anonymous) {
    return session;
  }
  await preserveAnonymousPreferences(session.user);
  const { error } = await client.auth.signOut({ scope: "local" });
  if (error) {
    throw error;
  }
  return null;
}

async function handleSession(session) {
  currentUser = session?.user || null;
  if (!isSignedIn()) {
    currentProfile = null;
    currentPreferences = null;
    renderAccount();
    localStorage.removeItem(ONESIGNAL_IDENTITY_KEY);
    syncOneSignalIdentity();
    return;
  }

  const [{ data: storedProfile, error: profileError }, { data: storedPreferences, error: preferenceError }] =
    await Promise.all([
      client.from("profiles").select("*").eq("id", currentUser.id).single(),
      client
        .from("preferences")
        .select("*")
        .eq("user_id", currentUser.id)
        .single(),
    ]);
  if (profileError) {
    throw profileError;
  }
  if (preferenceError) {
    throw preferenceError;
  }
  const { profile, preferences } = await migrateAnonymousPreferences(
    storedProfile,
    storedPreferences,
  );

  const ui = await jobAlertsUI();
  populateAdvancedPreferences(preferences, profile);
  ui.applyBasicPreferences(preferences);
  renderAccount();
  syncOneSignalIdentity();
  await Promise.all([loadApplications(), loadMonitors(), loadSystemHealth()]);

  const local = ui.getBasicPreferences();
  if (!preferences.companies.length && local?.companies.length) {
    await persistPreferences(local);
  }
  const activeView = location.hash.slice(1) || "alerts";
  if (activeView === "jobs") {
    await resetAndLoadJobs();
  } else if (activeView === "inbox") {
    await loadInbox();
  }
}

async function initializeSupabase() {
  if (
    !config.supabaseUrl ||
    !config.supabasePublishableKey ||
    !window.supabase?.createClient
  ) {
    setText(elements.accountButton, "Setup required");
    throw new Error("Supabase frontend configuration is missing.");
  }

  client = window.supabase.createClient(
    config.supabaseUrl,
    config.supabasePublishableKey,
    {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
      },
    },
  );
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }
  const session = await registeredSession(data.session);
  await handleSession(session);
  readyResolve();

  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => {
      registeredSession(session)
        .then(handleSession)
        .catch((sessionError) => {
          console.error(sessionError);
          setText(
            elements.accountStatus,
            "Account synchronization failed.",
            true,
          );
        });
    }, 0);
  });
}

function jobScore(job) {
  return resumeMatchScore(job, currentProfile?.resume_profile);
}

async function markJobState(jobId, values) {
  const { error } = await client.from("job_user_state").upsert(
    {
      user_id: currentUser.id,
      job_id: jobId,
      ...values,
    },
    { onConflict: "user_id,job_id" },
  );
  if (error) {
    throw error;
  }
}

function createJobCard(job) {
  const card = document.createElement("article");
  card.className = "job-card";
  card.classList.toggle("unseen", !job.viewed_at);
  const header = document.createElement("div");
  header.className = "job-card-header";
  const content = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = job.title;
  const company = document.createElement("strong");
  company.textContent = job.company;
  const meta = document.createElement("div");
  meta.className = "job-meta";
  meta.textContent = `${job.location || "Location not listed"} · ${sourceLabel(job.source)}`;
  const timing = document.createElement("div");
  timing.className = "job-meta job-timing";
  timing.textContent = formatJobTiming(job);
  const score = document.createElement("span");
  score.className = "count";
  const matchDetails = resumeMatchDetails(
    job,
    currentProfile?.resume_profile,
  );
  const matchScore = matchDetails?.score ?? null;
  score.textContent =
    matchScore === null ? "Upload resume" : `${matchScore}% match`;
  content.append(title, company, meta, timing);
  if (job.application_status) {
    const applicationBadge = document.createElement("div");
    applicationBadge.className = "job-meta application-badge";
    applicationBadge.textContent = `Application: ${job.application_status}`;
    content.append(applicationBadge);
  }
  if (matchDetails?.reasons.length) {
    const reasons = document.createElement("p");
    reasons.className = "job-match-reasons";
    reasons.textContent = matchDetails.reasons.join(" · ");
    content.append(reasons);
  }

  const actions = document.createElement("div");
  actions.className = "button-row";
  const apply = document.createElement("a");
  apply.className = "button secondary";
  apply.href = job.url;
  apply.target = "_blank";
  apply.rel = "noopener";
  apply.textContent = "Apply";
  apply.addEventListener("click", () => {
    markJobState(job.id, { viewed_at: new Date().toISOString() })
      .then(() => {
        job.viewed_at = new Date().toISOString();
        card.classList.remove("unseen");
      })
      .catch(console.error);
  });
  const save = document.createElement("button");
  save.className = "button primary";
  save.type = "button";
  save.textContent = job.application_status ? "Edit application" : "Save";
  save.addEventListener("click", async () => {
    if (job.application_status) {
      if (!applications.some((application) => application.job_id === job.id)) {
        await loadApplications();
      }
      openApplicationDialog(
        applications.find((application) => application.job_id === job.id) || {
          job_id: job.id,
          company: job.company,
          title: job.title,
          location: job.location,
          url: job.url,
          status: job.application_status,
        },
      );
      return;
    }
    await saveJobApplication(job);
  });
  const hide = document.createElement("button");
  hide.className = "text-button";
  hide.type = "button";
  hide.textContent = job.hidden_at ? "Unhide" : "Hide";
  hide.addEventListener("click", async () => {
    try {
      await markJobState(job.id, {
        hidden_at: job.hidden_at ? null : new Date().toISOString(),
      });
      jobs = jobs.filter((item) => item.id !== job.id);
      jobTotal = Math.max(0, jobTotal - 1);
      renderJobs();
    } catch (error) {
      console.error(error);
      setText(elements.jobResultsStatus, "Could not hide this job.", true);
    }
  });
  actions.append(apply, save, hide);
  header.append(content, score);
  card.append(header, actions);
  return card;
}

function renderJobs() {
  if (!jobs.length) {
    elements.jobList.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "muted",
        textContent:
          elements.jobFeedMode.value === "for_you"
            ? "No jobs currently match your saved alert preferences."
            : "No matching jobs are available.",
      }),
    );
  } else {
    elements.jobList.replaceChildren(...jobs.map(createJobCard));
  }
  setText(
    elements.jobResultsStatus,
    `${jobs.length.toLocaleString()} shown of ${jobTotal.toLocaleString()} matching jobs.`,
  );
}

function jobFeedParameters() {
  const role = elements.jobRoleFilter.value;
  const source = elements.jobSourceFilter.value;
  const applicationStatus = elements.jobApplicationFilter.value;
  return {
    p_mode: elements.jobFeedMode.value,
    p_search: elements.jobSearch.value.trim() || null,
    p_roles: role ? [role] : null,
    p_sources: source ? [source] : null,
    p_remote_only: elements.jobRemoteFilter.checked,
    p_application_status: applicationStatus || null,
    p_only_unseen: elements.jobUnseenFilter.checked,
    p_sort: elements.jobSort.value === "match" ? "newest" : elements.jobSort.value,
    p_limit: elements.jobSort.value === "match" ? 1000 : JOB_PAGE_SIZE,
    p_offset: elements.jobSort.value === "match" ? 0 : jobOffset,
  };
}

async function loadJobs({ append = false } = {}) {
  if (!client || !isSignedIn()) {
    setText(
      elements.jobList,
      "Sign in to view your personalized job feed.",
    );
    setText(elements.jobResultsStatus, "");
    elements.loadMoreJobs.classList.add("hidden");
    return;
  }
  const loadVersion = ++jobLoadVersion;
  elements.loadMoreJobs.disabled = true;
  setText(elements.jobResultsStatus, append ? "Loading more jobs..." : "Loading jobs...");
  const parameters = jobFeedParameters();
  const exhaustive =
    elements.jobSort.value === "match" ||
    (
      elements.jobFeedMode.value === "for_you" &&
      Number(currentPreferences?.minimum_score || 0) > 0
    );
  if (exhaustive) {
    parameters.p_limit = 1000;
    parameters.p_offset = 0;
  }
  const { data, error } = await client.rpc("get_job_feed", parameters);
  if (loadVersion !== jobLoadVersion) {
    return;
  }
  elements.loadMoreJobs.disabled = false;
  if (error) {
    console.error(error);
    setText(elements.jobResultsStatus, "Jobs could not be loaded.", true);
    return;
  }
  const rawJobs = data || [];
  const minimumScore =
    elements.jobFeedMode.value === "for_you"
      ? Number(currentPreferences?.minimum_score || 0)
      : 0;
  let pageJobs = rawJobs.filter(
    (job) => minimumScore === 0 || (jobScore(job) || 0) >= minimumScore,
  );
  if (elements.jobSort.value === "match") {
    pageJobs = sortJobsRecommended(
      pageJobs,
      currentPreferences,
      currentProfile?.resume_profile,
    );
  }
  jobTotal = exhaustive
    ? pageJobs.length
    : Number(rawJobs[0]?.total_count || 0);
  jobOffset += rawJobs.length;
  if (append) {
    const existingIds = new Set(jobs.map((job) => job.id));
    jobs.push(...pageJobs.filter((job) => !existingIds.has(job.id)));
  } else {
    jobs = pageJobs;
  }
  elements.loadMoreJobs.classList.toggle(
    "hidden",
    exhaustive || jobOffset >= jobTotal,
  );
  renderJobs();
}

function resetAndLoadJobs() {
  jobOffset = 0;
  jobTotal = 0;
  jobs = [];
  elements.jobList.replaceChildren(
    Object.assign(document.createElement("p"), {
      className: "muted",
      textContent: "Loading jobs...",
    }),
  );
  return loadJobs();
}

async function saveJobApplication(job) {
  if (!requireAccount("Sign in before saving applications.")) {
    return;
  }
  const { error } = await client.from("applications").upsert(
    {
      user_id: currentUser.id,
      job_id: job.id,
      company: job.company,
      title: job.title,
      location: job.location,
      url: job.url,
      status: "saved",
    },
    { onConflict: "user_id,job_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error(error);
    setText(elements.jobResultsStatus, "Could not save this application.", true);
    return;
  }
  job.application_status = "saved";
  job.viewed_at = new Date().toISOString();
  await markJobState(job.id, { viewed_at: job.viewed_at });
  await loadApplications();
  renderJobs();
}

function renderApplicationSummary() {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0]));
  for (const application of applications) {
    counts[application.status] += 1;
  }
  elements.applicationSummary.replaceChildren(
    ...APPLICATION_STATUSES.map((status) => {
      const card = document.createElement("div");
      card.className = "summary-card";
      const count = document.createElement("strong");
      count.textContent = String(counts[status]);
      const label = document.createElement("span");
      label.textContent = status;
      card.append(count, label);
      return card;
    }),
  );
}

function toLocalDateTimeInput(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function openApplicationDialog(application = null) {
  if (!requireAccount("Sign in to track applications.")) {
    return;
  }
  elements.applicationForm.reset();
  elements.applicationId.value = application?.id || "";
  elements.applicationCompany.value = application?.company || "";
  elements.applicationTitle.value = application?.title || "";
  elements.applicationLocation.value = application?.location || "";
  elements.applicationUrl.value = application?.url || "";
  elements.applicationStatus.value = application?.status || "saved";
  elements.applicationDeadline.value = application?.deadline_at || "";
  elements.applicationNextStep.value = toLocalDateTimeInput(
    application?.next_step_at,
  );
  elements.applicationContact.value = application?.contact || "";
  elements.applicationArchived.checked = application?.archived === true;
  elements.applicationNotes.value = application?.notes || "";
  elements.applicationDialog.showModal();
}

function createApplicationCard(application) {
  const card = document.createElement("article");
  card.className = "list-card";
  const title = document.createElement("h3");
  title.textContent = `${application.company} — ${application.title}`;
  const meta = document.createElement("div");
  meta.className = "job-meta";
  const details = [application.location || "Location not listed"];
  if (application.deadline_at) {
    details.push(`Deadline ${application.deadline_at}`);
  }
  if (application.next_step_at) {
    details.push(
      `Next step ${new Date(application.next_step_at).toLocaleString()}`,
    );
  }
  if (application.contact) {
    details.push(`Contact: ${application.contact}`);
  }
  meta.textContent = details.join(" · ");
  const status = document.createElement("select");
  for (const value of APPLICATION_STATUSES) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    option.selected = application.status === value;
    status.append(option);
  }
  status.addEventListener("change", async () => {
    const { error } = await client
      .from("applications")
      .update({
        status: status.value,
        applied_at:
          status.value === "applied" && !application.applied_at
            ? new Date().toISOString()
            : application.applied_at,
      })
      .eq("id", application.id);
    if (!error) {
      await loadApplications();
    }
  });
  const edit = document.createElement("button");
  edit.className = "text-button";
  edit.type = "button";
  edit.textContent = "Edit";
  edit.addEventListener("click", () => openApplicationDialog(application));
  const remove = document.createElement("button");
  remove.className = "text-button danger";
  remove.type = "button";
  remove.textContent = "Delete";
  remove.addEventListener("click", async () => {
    if (!window.confirm("Delete this application from your tracker?")) {
      return;
    }
    const { error } = await client
      .from("applications")
      .delete()
      .eq("id", application.id);
    if (error) {
      console.error(error);
      return;
    }
    await loadApplications();
    if (!document.querySelector("#view-jobs").classList.contains("hidden")) {
      await resetAndLoadJobs();
    }
  });
  const controls = document.createElement("div");
  controls.className = "application-controls";
  status.className = "application-status";
  controls.append(status, edit, remove);
  card.append(title, meta, controls);
  return card;
}

async function loadApplications() {
  if (!client || !isSignedIn()) {
    applications = [];
    renderApplicationSummary();
    setText(elements.applicationList, "Sign in to track applications.");
    return;
  }
  let query = client
    .from("applications")
    .select("*")
    .order("updated_at", { ascending: false });
  if (!elements.showArchivedApplications.checked) {
    query = query.eq("archived", false);
  }
  const { data, error } = await query;
  if (error) {
    setText(elements.applicationList, "Applications could not be loaded.", true);
    return;
  }
  applications = data;
  renderApplicationSummary();
  elements.applicationList.replaceChildren(
    ...(applications.length
      ? applications.map(createApplicationCard)
      : [
          Object.assign(document.createElement("p"), {
            className: "muted",
            textContent: "No applications tracked yet.",
          }),
        ]),
  );
}

async function saveApplication(event) {
  event.preventDefault();
  if (!requireAccount("Sign in to track applications.")) {
    return;
  }
  const record = {
    user_id: currentUser.id,
    company: elements.applicationCompany.value.trim(),
    title: elements.applicationTitle.value.trim(),
    location: elements.applicationLocation.value.trim(),
    url: elements.applicationUrl.value.trim() || null,
    status: elements.applicationStatus.value,
    deadline_at: elements.applicationDeadline.value || null,
    next_step_at: elements.applicationNextStep.value
      ? new Date(elements.applicationNextStep.value).toISOString()
      : null,
    contact: elements.applicationContact.value.trim(),
    archived: elements.applicationArchived.checked,
    notes: elements.applicationNotes.value.trim(),
  };
  let query = client.from("applications");
  query = elements.applicationId.value
    ? query.update(record).eq("id", elements.applicationId.value)
    : query.insert(record);
  const { error } = await query;
  if (error) {
    console.error(error);
    return;
  }
  elements.applicationDialog.close();
  await loadApplications();
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportApplications() {
  const { data, error } = await client
    .from("applications")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  const columns = [
    "company",
    "title",
    "location",
    "status",
    "applied_at",
    "deadline_at",
    "next_step_at",
    "contact",
    "url",
    "notes",
    "archived",
  ];
  const csv = [
    columns.map(csvCell).join(","),
    ...data.map((application) =>
      columns.map((column) => csvCell(application[column])).join(","),
    ),
  ].join("\n");
  downloadFile(
    `job-applications-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    "text/csv",
  );
}

function createInboxItem(item) {
  const card = document.createElement("article");
  card.className = "list-card inbox-item";
  card.classList.toggle("unread", !item.read_at);
  const title = document.createElement("h3");
  title.textContent =
    item.event === "test"
      ? "Test alert"
      : item.event === "job_closed"
        ? `Role closed${item.job ? ` at ${item.job.company}` : ""}`
        : item.job
          ? `New role at ${item.job.company}`
          : "Job alert update";
  const meta = document.createElement("div");
  meta.className = "job-meta";
  const timestamp = item.sent_at || item.created_at;
  meta.textContent = [
    item.job?.title,
    item.status,
    timestamp ? new Date(timestamp).toLocaleString() : null,
  ].filter(Boolean).join(" · ");
  card.append(title, meta);
  if (item.last_error && item.status === "failed") {
    const error = document.createElement("p");
    error.className = "job-match-reasons";
    error.textContent = item.last_error;
    card.append(error);
  }
  if (item.job?.url) {
    const open = document.createElement("a");
    open.className = "text-button";
    open.href = item.job.url;
    open.target = "_blank";
    open.rel = "noopener";
    open.textContent = "Open role";
    open.addEventListener("click", () => markInboxItemRead(item));
    card.append(open);
  }
  return card;
}

async function markInboxItemRead(item) {
  if (item.read_at) {
    return;
  }
  const readAt = new Date().toISOString();
  const { error } = await client
    .from("notification_queue")
    .update({ read_at: readAt })
    .eq("id", item.id);
  if (!error) {
    item.read_at = readAt;
    await loadInbox();
  }
}

async function loadInbox() {
  if (!client || !isSignedIn()) {
    return;
  }
  const { data, error } = await client
    .from("notification_queue")
    .select(
      "id,event,status,created_at,sent_at,read_at,last_error,job:jobs(id,company,title,url)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    console.error(error);
    setText(elements.inboxSummary, "Alert history could not be loaded.", true);
    return;
  }
  const unread = data.filter((item) => !item.read_at).length;
  setText(
    elements.inboxSummary,
    `${data.length} recent alerts · ${unread} unread`,
  );
  elements.inboxList.replaceChildren(
    ...(data.length
      ? data.map(createInboxItem)
      : [
          Object.assign(document.createElement("p"), {
            className: "muted",
            textContent: "No alerts have been queued yet.",
          }),
        ]),
  );
}

async function markInboxRead() {
  const { error } = await client
    .from("notification_queue")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", currentUser.id)
    .is("read_at", null);
  if (error) {
    console.error(error);
    return;
  }
  await loadInbox();
}

async function requestTestAlert() {
  elements.testAlertButton.disabled = true;
  elements.inboxTestAlertButton.disabled = true;
  if (!window.JobAlertsUI?.isPushActive()) {
    setText(
      elements.testAlertStatus,
      "Enable push notifications on this device before sending a test.",
      true,
    );
    elements.testAlertButton.disabled = false;
    elements.inboxTestAlertButton.disabled = false;
    return;
  }
  setText(elements.testAlertStatus, "Linking this device for push delivery...");
  try {
    await syncOneSignalIdentity({ required: true });
  } catch (error) {
    setText(elements.testAlertStatus, error.message, true);
    elements.testAlertButton.disabled = false;
    elements.inboxTestAlertButton.disabled = false;
    return;
  }
  setText(elements.testAlertStatus, "Queueing a test alert...");
  const { error } = await client.rpc("request_test_notification");
  elements.testAlertButton.disabled = false;
  elements.inboxTestAlertButton.disabled = false;
  if (error) {
    setText(elements.testAlertStatus, error.message, true);
    setText(elements.inboxSummary, error.message, true);
    return;
  }
  setText(
    elements.testAlertStatus,
    "Test alert queued. It should arrive within 15 minutes.",
  );
  setText(
    elements.inboxSummary,
    "Test alert queued for delivery within 15 minutes.",
  );
  await loadInbox();
}

async function loadSystemHealth() {
  if (!client || !isSignedIn()) {
    return;
  }
  const { data, error } = await client.rpc("get_system_health");
  if (error) {
    console.error(error);
    elements.systemHealthGrid.replaceChildren(
      createHealthItem("Service health", "Unavailable", "error"),
    );
    return;
  }
  systemHealth = data || {};
  elements.emailFallback.disabled =
    !systemHealth.email_fallback_configured;
  elements.emailFallbackHelp.textContent =
    systemHealth.email_fallback_configured
      ? "Uses your account email only if push fails."
      : "Requires a Resend API key and verified sender.";
  const scanAge = systemHealth.last_successful_scan_at
    ? Date.now() - new Date(systemHealth.last_successful_scan_at).getTime()
    : Infinity;
  elements.systemHealthGrid.replaceChildren(
    createHealthItem(
      "Last successful scan",
      formatRelativeTime(systemHealth.last_successful_scan_at),
      scanAge <= 3 * 60 * 60 * 1000 ? "ready" : "error",
    ),
    createHealthItem(
      "Open jobs",
      Number(systemHealth.open_jobs || 0).toLocaleString(),
    ),
    createHealthItem(
      "Source failures in 24h",
      String(systemHealth.failed_runs_24h || 0),
      systemHealth.failed_runs_24h ? "warning" : "ready",
    ),
    createHealthItem(
      "Pending alerts",
      String(systemHealth.pending_notifications || 0),
      systemHealth.pending_notifications > 100 ? "warning" : "ready",
    ),
    createHealthItem(
      "Failed alerts in 24h",
      String(systemHealth.failed_notifications || 0),
      systemHealth.failed_notifications ? "error" : "ready",
    ),
    createHealthItem(
      "Shared career monitors",
      `${systemHealth.healthy_shared_monitors || 0} healthy`,
      systemHealth.shared_monitor_errors ? "warning" : "ready",
    ),
  );
  renderSetupHealth();
}

function detectMonitor(url) {
  const parsed = new URL(url);
  if (
    [
      "boards.greenhouse.io",
      "job-boards.greenhouse.io",
      "job-boards.eu.greenhouse.io",
    ].includes(parsed.hostname)
  ) {
    return "greenhouse";
  }
  if (["jobs.lever.co", "jobs.eu.lever.co"].includes(parsed.hostname)) {
    return "lever";
  }
  if (parsed.hostname === "jobs.ashbyhq.com") {
    return "ashby";
  }
  if (/^[a-z0-9-]+\.[a-z0-9-]+\.myworkdayjobs\.com$/.test(parsed.hostname)) {
    return "workday";
  }
  throw new Error("Use a Greenhouse, Lever, Ashby, or Workday career URL.");
}

function companyKey(value) {
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replaceAll(" ", "_");
}

async function addMonitor(event) {
  event.preventDefault();
  if (!requireAccount("Sign in to monitor company career sites.")) {
    return;
  }
  try {
    const companyName = elements.monitorCompany.value.trim();
    const provider = detectMonitor(elements.monitorUrl.value);
    const { error } = await client.from("company_monitors").insert({
      user_id: currentUser.id,
      company_name: companyName,
      company_key: companyKey(companyName),
      provider,
      career_url: elements.monitorUrl.value.trim(),
    });
    if (error) {
      throw error;
    }
    const preferences = window.JobAlertsUI.addCompanyAndTrack(
      companyName,
      "ats",
    );
    await savePreferences(preferences);
    elements.monitorForm.reset();
    await loadMonitors();
  } catch (error) {
    setText(elements.monitorList, error.message, true);
  }
}

async function loadMonitors() {
  if (!client || !isSignedIn()) {
    setText(elements.monitorList, "Sign in to add career-site monitors.");
    return;
  }
  const { data, error } = await client
    .from("company_monitors")
    .select("*")
    .order("created_at");
  if (error) {
    setText(elements.monitorList, "Monitors could not be loaded.", true);
    return;
  }
  elements.monitorList.replaceChildren(
    ...data.map((monitor) => {
      const card = document.createElement("div");
      card.className = "list-card";
      const title = document.createElement("strong");
      title.textContent = `${monitor.company_name} · ${monitor.provider}`;
      const remove = document.createElement("button");
      remove.className = "text-button";
      remove.type = "button";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        const { error: removeError } = await client
          .from("company_monitors")
          .delete()
          .eq("id", monitor.id);
        if (removeError) {
          setText(elements.monitorList, removeError.message, true);
          return;
        }
        await loadMonitors();
      });
      card.append(title, remove);
      return card;
    }),
  );
}

function deriveResumeProfile(text) {
  const skills = Object.entries(SKILL_PATTERNS)
    .filter(([, pattern]) => pattern.test(text))
    .map(([skill]) => skill);
  const keywords = [...new Set(
    text
      .toLowerCase()
      .match(/[a-z][a-z+#.]{2,}/g)
      ?.filter((word) => word.length < 30) || [],
  )].slice(0, 150);
  return { skills, keywords, extracted_at: new Date().toISOString() };
}

function renderResumeProfile(profile) {
  const skills = profile.skills || [];
  elements.resumeSkills.replaceChildren(
    ...skills.map((skill) =>
      Object.assign(document.createElement("span"), { textContent: skill }),
    ),
  );
  if (currentProfile?.resume_path) {
    setText(elements.resumeStatus, `Resume ready · ${skills.length} skills detected.`);
  } else {
    setText(elements.resumeStatus, "No resume uploaded.");
  }
  elements.removeResumeButton.classList.toggle(
    "hidden",
    !currentProfile?.resume_path,
  );
  renderSetupHealth();
}

async function extractPdfText(file) {
  const pdfjs = await import("./vendor/pdf.mjs?v=20260713-4");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "./vendor/pdf.worker.mjs?v=20260713-4",
    import.meta.url,
  ).href;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    pages.push(await readPdfPageText(page));
  }
  return pages.join("\n");
}

async function uploadResume() {
  const file = elements.resumeFile.files[0];
  if (!file) {
    return;
  }
  if (!requireAccount("Sign in before uploading a resume.")) {
    elements.resumeFile.value = "";
    return;
  }
  if (file.type !== "application/pdf" || file.size > 5 * 1024 * 1024) {
    setText(elements.resumeStatus, "Choose a PDF no larger than 5 MB.", true);
    return;
  }

  setText(elements.resumeStatus, "Extracting skills and uploading securely...");
  try {
    const text = await extractPdfText(file);
    if (!text.trim()) {
      throw new Error("No selectable text was found in this PDF.");
    }
    const profile = deriveResumeProfile(text);
    const path = `${currentUser.id}/resume-${Date.now()}.pdf`;
    const { error: uploadError } = await client.storage
      .from("resumes")
      .upload(path, file, { contentType: "application/pdf" });
    if (uploadError) {
      throw uploadError;
    }
    const previousPath = currentProfile.resume_path;
    const { data, error } = await client
      .from("profiles")
      .update({ resume_path: path, resume_profile: profile })
      .eq("id", currentUser.id)
      .select()
      .single();
    if (error) {
      await client.storage.from("resumes").remove([path]);
      throw error;
    }
    if (previousPath) {
      const { error: removeError } = await client.storage
        .from("resumes")
        .remove([previousPath]);
      if (removeError) {
        console.error(removeError);
      }
    }

    currentProfile = data;
    renderResumeProfile(profile);
  } catch (error) {
    console.error(error);
    setText(
      elements.resumeStatus,
      `Resume processing failed: ${error.message || "Unknown error."}`,
      true,
    );
  }
}

async function removeResume() {
  if (!currentProfile?.resume_path) {
    return;
  }
  if (!window.confirm("Remove your stored resume and detected skills?")) {
    return;
  }
  elements.removeResumeButton.disabled = true;
  const path = currentProfile.resume_path;
  const { error: removeError } = await client.storage
    .from("resumes")
    .remove([path]);
  if (removeError) {
    elements.removeResumeButton.disabled = false;
    setText(elements.resumeStatus, removeError.message, true);
    return;
  }
  const { data, error } = await client
    .from("profiles")
    .update({ resume_path: null, resume_profile: {} })
    .eq("id", currentUser.id)
    .select()
    .single();
  elements.removeResumeButton.disabled = false;
  if (error) {
    setText(elements.resumeStatus, error.message, true);
    return;
  }
  currentProfile = data;
  renderResumeProfile({});
}

function downloadFile(filename, contents, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function exportAccountData() {
  const tables = [
    "profiles",
    "preferences",
    "applications",
    "company_monitors",
    "notification_queue",
    "notification_deliveries",
    "job_user_state",
  ];
  const results = await Promise.all(
    tables.map(async (table) => {
      const { data, error } = await client.from(table).select("*");
      if (error) {
        throw error;
      }
      return [table, data];
    }),
  );
  downloadFile(
    `job-alerts-export-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        account_email: currentUser.email,
        ...Object.fromEntries(results),
      },
      null,
      2,
    ),
    "application/json",
  );
}

async function deleteAccount(event) {
  event.preventDefault();
  if (elements.deleteAccountConfirmation.value !== "DELETE") {
    setText(elements.deleteAccountStatus, "Type DELETE exactly.", true);
    return;
  }
  const submit = elements.deleteAccountForm.querySelector('[type="submit"]');
  submit.disabled = true;
  setText(elements.deleteAccountStatus, "Deleting your account...");
  const { data: resumeFiles, error: listError } = await client.storage
    .from("resumes")
    .list(currentUser.id, { limit: 100 });
  if (listError) {
    submit.disabled = false;
    setText(elements.deleteAccountStatus, listError.message, true);
    return;
  }
  if (resumeFiles.length) {
    const { error: removeError } = await client.storage
      .from("resumes")
      .remove(
        resumeFiles.map((file) => `${currentUser.id}/${file.name}`),
      );
    if (removeError) {
      submit.disabled = false;
      setText(elements.deleteAccountStatus, removeError.message, true);
      return;
    }
  }
  window.OneSignalDeferred.push(async (sdk) => {
    await sdk.logout();
  });
  const { error } = await client.rpc("delete_current_user");
  if (error) {
    submit.disabled = false;
    setText(elements.deleteAccountStatus, error.message, true);
    return;
  }
  localStorage.clear();
  await client.auth.signOut({ scope: "local" });
  window.location.reload();
}

elements.accountButton.addEventListener("click", () =>
  elements.accountDialog.showModal(),
);
elements.accountDialog.addEventListener("cancel", (event) => {
  if (!isSignedIn()) {
    event.preventDefault();
  }
});
elements.accountForm.addEventListener("submit", (event) => {
  if (isSignedIn()) {
    return;
  }
  event.preventDefault();
  if (!elements.magicLinkSignin.disabled) {
    elements.magicLinkSignin.click();
  }
});
elements.googleSignin.addEventListener("click", async () => {
  if (!config.googleAuthEnabled) {
    setText(elements.accountStatus, "Google sign-in is not configured.", true);
    return;
  }
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) {
    setText(elements.accountStatus, error.message, true);
  }
});
elements.magicLinkSignin.addEventListener("click", async () => {
  const email = elements.authEmail.value.trim();
  if (!email) {
    setText(elements.accountStatus, "Enter your email address.", true);
    return;
  }
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  setText(
    elements.accountStatus,
    error ? error.message : "Check your email for the sign-in link.",
    Boolean(error),
  );
});
elements.signoutButton.addEventListener("click", async () => {
  await client.auth.signOut();
});
elements.exportDataButton.addEventListener("click", () => {
  exportAccountData().catch((error) => {
    console.error(error);
    setText(elements.accountStatus, "Your data could not be exported.", true);
  });
});
elements.deleteAccountButton.addEventListener("click", () => {
  elements.deleteAccountConfirmation.value = "";
  setText(elements.deleteAccountStatus, "");
  elements.deleteAccountDialog.showModal();
});
elements.deleteAccountForm.addEventListener("submit", deleteAccount);
for (const button of elements.navButtons) {
  button.addEventListener("click", () => showView(button.dataset.view));
}
elements.minimumScore.addEventListener("input", () => {
  elements.minimumScoreOutput.value = `${elements.minimumScore.value}%`;
});
elements.refreshJobs.addEventListener("click", resetAndLoadJobs);
elements.loadMoreJobs.addEventListener("click", () => loadJobs({ append: true }));
elements.jobSearch.addEventListener("input", () => {
  clearTimeout(jobSearchTimer);
  jobSearchTimer = setTimeout(resetAndLoadJobs, 250);
});
for (const control of [
  elements.jobFeedMode,
  elements.jobRoleFilter,
  elements.jobSourceFilter,
  elements.jobApplicationFilter,
  elements.jobSort,
  elements.jobRemoteFilter,
  elements.jobUnseenFilter,
]) {
  control.addEventListener("change", resetAndLoadJobs);
}
elements.addApplicationButton.addEventListener("click", () =>
  openApplicationDialog(),
);
elements.exportApplicationsButton.addEventListener("click", exportApplications);
elements.showArchivedApplications.addEventListener("change", loadApplications);
elements.applicationForm.addEventListener("submit", saveApplication);
elements.markInboxRead.addEventListener("click", markInboxRead);
elements.testAlertButton.addEventListener("click", requestTestAlert);
elements.inboxTestAlertButton.addEventListener("click", requestTestAlert);
elements.refreshStatusButton.addEventListener("click", loadSystemHealth);
elements.monitorForm.addEventListener("submit", addMonitor);
elements.resumeFile.addEventListener("change", uploadResume);
elements.removeResumeButton.addEventListener("click", removeResume);
window.addEventListener("job-alerts-push-state-change", () => {
  renderSetupHealth();
  if (isSignedIn() && window.JobAlertsUI?.isPushActive()) {
    syncOneSignalIdentity();
  }
});
for (const button of document.querySelectorAll("[data-close-dialog]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}

populateDigestHours();
populateTimezones();
elements.googleSignin.classList.toggle(
  "hidden",
  !config.googleAuthEnabled,
);
elements.googleDivider.classList.toggle(
  "hidden",
  !config.googleAuthEnabled,
);
showView(location.hash.slice(1) || "alerts");
initializeSupabase().catch((error) => {
  console.error(error);
  readyResolve();
  document.body.classList.add("auth-required");
  elements.accountClose.classList.add("hidden");
  elements.signedOutControls.classList.remove("hidden");
  elements.signoutButton.classList.add("hidden");
  elements.googleSignin.disabled = true;
  elements.magicLinkSignin.disabled = true;
  if (!elements.accountDialog.open) {
    elements.accountDialog.showModal();
  }
  setText(
    elements.accountStatus,
    "Job Alerts could not connect. Reload the page to retry.",
    true,
  );
  setText(elements.accountButton, "Connection failed", true);
});
