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
  accountDialog: document.querySelector("#account-dialog"),
  accountStatus: document.querySelector("#account-status"),
  signedOutControls: document.querySelector("#signed-out-controls"),
  signoutButton: document.querySelector("#signout-button"),
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
  jobList: document.querySelector("#job-list"),
  applicationSummary: document.querySelector("#application-summary"),
  applicationList: document.querySelector("#application-list"),
  addApplicationButton: document.querySelector("#add-application-button"),
  applicationDialog: document.querySelector("#application-dialog"),
  applicationForm: document.querySelector("#application-form"),
  applicationId: document.querySelector("#application-id"),
  applicationCompany: document.querySelector("#application-company"),
  applicationTitle: document.querySelector("#application-title"),
  applicationLocation: document.querySelector("#application-location"),
  applicationUrl: document.querySelector("#application-url"),
  applicationStatus: document.querySelector("#application-status-input"),
  applicationNotes: document.querySelector("#application-notes"),
  resumeFile: document.querySelector("#resume-file"),
  resumeStatus: document.querySelector("#resume-status"),
  resumeSkills: document.querySelector("#resume-skills"),
};

let client = null;
let currentUser = null;
let currentProfile = null;
let currentPreferences = null;
let jobs = [];
let applications = [];
let readyResolve;
const ready = new Promise((resolve) => {
  readyResolve = resolve;
});

function setText(element, value, isError = false) {
  element.textContent = value;
  element.style.color = isError ? "#b42318" : "";
}

function parseList(value) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

function isSignedIn() {
  return Boolean(currentUser && !currentUser.is_anonymous);
}

function requireAccount(message) {
  if (isSignedIn()) {
    return true;
  }
  setText(elements.accountStatus, message);
  elements.accountDialog.showModal();
  return false;
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
  elements.timezone.value =
    Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
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
    loadJobs();
  } else if (name === "applications") {
    loadApplications();
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
  for (const input of elements.roleCategories) {
    input.checked = (preferences.role_categories || []).includes(input.value);
  }
  elements.deliveryMode.value = profile.delivery_mode || "instant";
  elements.timezone.value =
    profile.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "America/Los_Angeles";
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
    minimum_score: Number(elements.minimumScore.value),
  };
}

async function savePreferences(basicPreferences) {
  await ready;
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
}

window.JobAlertsData = { savePreferences };

async function loginOneSignal(user) {
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(async (sdk) => {
    await sdk.login(user.id);
  });
}

function renderAccount() {
  const signedIn = isSignedIn();
  elements.accountButton.textContent = signedIn
    ? currentUser.email || "Account"
    : "Guest";
  elements.signedOutControls.classList.toggle("hidden", signedIn);
  elements.signoutButton.classList.toggle("hidden", !signedIn);
  setText(
    elements.accountStatus,
    signedIn
      ? `Signed in as ${currentUser.email}. Preferences sync across devices.`
      : "You are using a private guest profile. Sign in to sync applications and resumes.",
  );
}

async function handleSession(session) {
  currentUser = session?.user || null;
  if (!currentUser) {
    const { data, error } = await client.auth.signInAnonymously();
    if (error) {
      throw error;
    }
    currentUser = data.user;
  }

  await loginOneSignal(currentUser);
  const [{ data: profile, error: profileError }, { data: preferences, error: preferenceError }] =
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

  const ui = await jobAlertsUI();
  populateAdvancedPreferences(preferences, profile);
  ui.applyBasicPreferences(preferences);
  renderAccount();
  await Promise.all([loadApplications(), loadMonitors()]);

  const local = ui.getBasicPreferences();
  if (!preferences.companies.length && local?.companies.length) {
    await savePreferences(local);
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
  readyResolve();
  await handleSession(data.session);

  client.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => {
      handleSession(session).catch((sessionError) => {
        console.error(sessionError);
        setText(elements.accountStatus, "Account synchronization failed.", true);
      });
    }, 0);
  });
}

function jobScore(job) {
  const skills = currentProfile?.resume_profile?.skills || [];
  if (!skills.length) {
    return 0;
  }
  const haystack = `${job.title} ${job.description || ""}`.toLowerCase();
  const matched = skills.filter((skill) => haystack.includes(skill.toLowerCase()));
  return Math.round((matched.length / skills.length) * 100);
}

function jobMatchesSearch(job, query) {
  const haystack = `${job.company} ${job.title} ${job.location}`.toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function createJobCard(job) {
  const card = document.createElement("article");
  card.className = "job-card";
  const content = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = job.title;
  const company = document.createElement("strong");
  company.textContent = job.company;
  const meta = document.createElement("div");
  meta.className = "job-meta";
  meta.textContent = `${job.location || "Location not listed"} · ${job.source.replaceAll("_", " ")}`;
  const score = document.createElement("span");
  score.className = "count";
  score.textContent = `${jobScore(job)}% match`;
  content.append(title, company, meta);

  const actions = document.createElement("div");
  actions.className = "button-row";
  const apply = document.createElement("a");
  apply.className = "button secondary";
  apply.href = job.url;
  apply.target = "_blank";
  apply.rel = "noopener";
  apply.textContent = "Apply";
  const save = document.createElement("button");
  save.className = "button primary";
  save.type = "button";
  save.textContent = "Save";
  save.addEventListener("click", () => saveJobApplication(job));
  actions.append(apply, save);
  card.append(content, score, actions);
  return card;
}

function renderJobs() {
  const query = elements.jobSearch.value.trim();
  const visible = jobs.filter((job) => jobMatchesSearch(job, query));
  if (!visible.length) {
    elements.jobList.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "muted",
        textContent: "No matching jobs are available yet.",
      }),
    );
    return;
  }
  elements.jobList.replaceChildren(...visible.map(createJobCard));
}

async function loadJobs() {
  if (!client) {
    return;
  }
  const { data, error } = await client
    .from("jobs")
    .select("*")
    .eq("status", "open")
    .order("posted_at", { ascending: false, nullsFirst: false })
    .limit(250);
  if (error) {
    setText(elements.jobList, "Jobs could not be loaded.", true);
    return;
  }
  jobs = data;
  renderJobs();
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
    return;
  }
  await loadApplications();
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
  meta.textContent = application.location || "Location not listed";
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
  card.append(title, meta, status, edit);
  return card;
}

async function loadApplications() {
  if (!client || !isSignedIn()) {
    applications = [];
    renderApplicationSummary();
    setText(elements.applicationList, "Sign in to track applications.");
    return;
  }
  const { data, error } = await client
    .from("applications")
    .select("*")
    .order("updated_at", { ascending: false });
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
  }
}

async function extractPdfText(file) {
  const pdfjs = await import(
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.mjs"
  );
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.mjs";
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
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
    setText(elements.resumeStatus, "Resume processing failed. Please retry.", true);
  }
}

elements.accountButton.addEventListener("click", () =>
  elements.accountDialog.showModal(),
);
elements.googleSignin.addEventListener("click", async () => {
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
  elements.accountDialog.close();
});
for (const button of elements.navButtons) {
  button.addEventListener("click", () => showView(button.dataset.view));
}
elements.minimumScore.addEventListener("input", () => {
  elements.minimumScoreOutput.value = `${elements.minimumScore.value}%`;
});
elements.refreshJobs.addEventListener("click", loadJobs);
elements.jobSearch.addEventListener("input", renderJobs);
elements.addApplicationButton.addEventListener("click", () =>
  openApplicationDialog(),
);
elements.applicationForm.addEventListener("submit", saveApplication);
elements.monitorForm.addEventListener("submit", addMonitor);
elements.resumeFile.addEventListener("change", uploadResume);
for (const button of document.querySelectorAll("[data-close-dialog]")) {
  button.addEventListener("click", () => button.closest("dialog").close());
}

populateDigestHours();
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
  setText(elements.accountButton, "Connection failed", true);
});
