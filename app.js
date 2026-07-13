import {
  RECOMMENDED_COMPANIES,
  companyTag,
  fetchCompanies,
  normalizeCompany,
} from "./company-data.js?v=20260713-4";

const STORAGE_KEY = "new-grad-alert-companies";
const SYNCED_STORAGE_KEY = "new-grad-alert-synced-companies";
const TRACK_STORAGE_KEY = "new-grad-alert-tracks";
const SYNCED_TRACK_STORAGE_KEY = "new-grad-alert-synced-tracks";
const TRACK_TAGS = {
  new_grad: "track_new_grad",
  canada_new_grad: "track_canada_new_grad",
  internship: "track_internship",
  offseason_internship: "track_offseason_internship",
  ats: "track_ats",
};

const elements = {
  clearButton: document.querySelector("#clear-button"),
  companyList: document.querySelector("#company-list"),
  enableButton: document.querySelector("#enable-button"),
  installButton: document.querySelector("#install-button"),
  iosInstall: document.querySelector("#ios-install"),
  notificationStatus: document.querySelector("#notification-status"),
  recommendedButton: document.querySelector("#recommended-button"),
  saveButton: document.querySelector("#save-button"),
  saveStatus: document.querySelector("#save-status"),
  search: document.querySelector("#company-search"),
  selectionCount: document.querySelector("#selection-count"),
  trackInputs: [...document.querySelectorAll('input[name="track[]"]')],
};
elements.recommendedButton.textContent =
  `Select recommended ${RECOMMENDED_COMPANIES.length}`;

let companies = [];
let deferredInstallPrompt = null;
let oneSignal = null;
let selected = readStoredSet(STORAGE_KEY);
let selectedTracks = new Set(
  [...readStoredSet(TRACK_STORAGE_KEY)].filter((track) => TRACK_TAGS[track]),
);
if (!selectedTracks.size) {
  selectedTracks.add("new_grad");
}

function readStoredSet(key) {
  try {
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function writeStoredSet(key, values) {
  localStorage.setItem(key, JSON.stringify([...values].sort()));
}

function isIos() {
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.style.color = isError ? "#ff9aa7" : "";
}

function isPushActive() {
  const subscription = oneSignal?.User?.PushSubscription;
  return Boolean(
    subscription?.optedIn && subscription.id && subscription.token,
  );
}

async function waitForPushSubscription(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (isPushActive()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for the push subscription token.");
}

function renderCompanies() {
  const query = normalizeCompany(elements.search.value);
  const visible = companies.filter((company) =>
    normalizeCompany(company).includes(query),
  );

  if (!visible.length) {
    elements.companyList.innerHTML =
      '<p class="muted">No companies match that search.</p>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const company of visible) {
    const label = document.createElement("label");
    label.className = "company-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = company;
    checkbox.checked = selected.has(company);
    checkbox.addEventListener("change", () => toggleCompany(company, checkbox));

    const name = document.createElement("span");
    name.textContent = company;
    label.append(checkbox, name);
    fragment.append(label);
  }
  elements.companyList.replaceChildren(fragment);
}

function renderSelectionCount() {
  elements.selectionCount.textContent = `${selected.size} selected`;
}

function toggleCompany(company, checkbox) {
  if (checkbox.checked) {
    selected.add(company);
  } else {
    selected.delete(company);
  }
  writeStoredSet(STORAGE_KEY, selected);
  renderSelectionCount();
  setStatus(elements.saveStatus, "Preferences changed. Save to sync them.");
}

function selectRecommended() {
  selected = new Set(RECOMMENDED_COMPANIES);
  companies = [...new Set([...companies, ...selected])].sort((left, right) =>
    left.localeCompare(right),
  );
  writeStoredSet(STORAGE_KEY, selected);
  renderCompanies();
  renderSelectionCount();
  setStatus(elements.saveStatus, "Recommended companies selected. Save to sync.");
}

function clearCompanies() {
  selected.clear();
  writeStoredSet(STORAGE_KEY, selected);
  renderCompanies();
  renderSelectionCount();
  setStatus(elements.saveStatus, "Selections cleared. Save to sync.");
}

function renderTracks() {
  for (const input of elements.trackInputs) {
    input.checked = selectedTracks.has(input.value);
  }
}

function toggleTrack(input) {
  if (input.checked) {
    selectedTracks.add(input.value);
  } else if (selectedTracks.size === 1) {
    input.checked = true;
    setStatus(elements.saveStatus, "Select at least one alert type.", true);
    return;
  } else {
    selectedTracks.delete(input.value);
  }
  writeStoredSet(TRACK_STORAGE_KEY, selectedTracks);
  setStatus(elements.saveStatus, "Alert types changed. Save to sync them.");
}

async function syncPreferences() {
  writeStoredSet(STORAGE_KEY, selected);
  writeStoredSet(TRACK_STORAGE_KEY, selectedTracks);
  if (!selected.size) {
    setStatus(elements.saveStatus, "Select at least one company.", true);
    return;
  }
  if (
    window.JobAlertsData &&
    !window.JobAlertsData.isAuthenticated()
  ) {
    setStatus(elements.saveStatus, "Sign in before saving preferences.", true);
    return;
  }
  elements.saveButton.disabled = true;
  setStatus(elements.saveStatus, "Syncing preferences...");
  try {
    if (window.JobAlertsData) {
      await window.JobAlertsData.savePreferences({
        companies: [...selected],
        source_keys: [...selectedTracks],
      });
    }

    const previouslySynced = readStoredSet(SYNCED_STORAGE_KEY);
    const removedTags = [...previouslySynced].map(companyTag);
    const previouslySyncedTracks = readStoredSet(SYNCED_TRACK_STORAGE_KEY);
    removedTags.push(
      ...[...previouslySyncedTracks].map((track) => TRACK_TAGS[track]),
    );
    if (isPushActive() && removedTags.length) {
      await oneSignal.User.removeTags(removedTags);
    }

    writeStoredSet(SYNCED_STORAGE_KEY, new Set());
    writeStoredSet(SYNCED_TRACK_STORAGE_KEY, new Set());
    setStatus(
      elements.saveStatus,
      isPushActive()
        ? "Preferences saved. Your alerts are active."
        : "Preferences saved. Enable notifications to activate alerts.",
    );
  } catch (error) {
    console.error(error);
    setStatus(
      elements.saveStatus,
      "Preferences could not be synced. Please try again.",
      true,
    );
  } finally {
    elements.saveButton.disabled = false;
  }
}

function renderNotificationState() {
  if (!oneSignal) {
    return;
  }
  const active = isPushActive();
  elements.enableButton.textContent = active
    ? "Notifications enabled"
    : "Enable notifications";
  elements.enableButton.disabled = active;
  setStatus(
    elements.notificationStatus,
    active
      ? "Push notifications are active on this device."
      : "Notifications are off. Enable them after choosing your companies.",
  );
  window.dispatchEvent(new Event("job-alerts-push-state-change"));
}

async function enableNotifications() {
  if (isIos() && !isStandalone()) {
    elements.iosInstall.classList.remove("hidden");
    setStatus(
      elements.notificationStatus,
      "Install this app on your Home Screen before enabling iPhone notifications.",
    );
    return;
  }
  if (!oneSignal) {
    setStatus(
      elements.notificationStatus,
      "Push service setup is not complete yet.",
      true,
    );
    return;
  }

  elements.enableButton.disabled = true;
  try {
    await oneSignal.User.PushSubscription.optIn();
    setStatus(
      elements.notificationStatus,
      "Finalizing your push subscription...",
    );
    await waitForPushSubscription();
    renderNotificationState();
    await syncPreferences();
  } catch (error) {
    console.error(error);
    setStatus(
      elements.notificationStatus,
      "Notification permission was not granted. Check your browser settings.",
      true,
    );
    elements.enableButton.disabled = false;
  }
}

function initializeInstallExperience() {
  if (isIos() && !isStandalone()) {
    elements.iosInstall.classList.remove("hidden");
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    elements.installButton.classList.remove("hidden");
  });

  elements.installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      return;
    }
    await deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
    elements.installButton.classList.add("hidden");
  });
}

function initializeOneSignal() {
  const renderUnavailable = () => {
    elements.enableButton.disabled = true;
    setStatus(
      elements.notificationStatus,
      "Push notifications are blocked by this browser or a content blocker. Sign-in and the rest of the app still work.",
      true,
    );
  };
  const appId = window.NEW_GRAD_ALERTS_CONFIG?.oneSignalAppId;
  if (!appId) {
    elements.enableButton.disabled = true;
    setStatus(
      elements.notificationStatus,
      "The OneSignal connection is being configured.",
    );
    return;
  }
  if (window.OneSignalUnavailable) {
    renderUnavailable();
    return;
  }

  elements.enableButton.disabled = true;
  setStatus(elements.notificationStatus, "Connecting to the push service...");
  window.addEventListener("onesignal-sdk-unavailable", renderUnavailable, {
    once: true,
  });
  window.OneSignalDeferred.push(async (sdk) => {
    try {
      await sdk.init({
        appId,
        autoResubscribe: true,
        notifyButton: { enable: false },
        welcomeNotification: { disable: true },
      });
      window.removeEventListener(
        "onesignal-sdk-unavailable",
        renderUnavailable,
      );
      oneSignal = sdk;

      if (!sdk.Notifications.isPushSupported()) {
        elements.enableButton.disabled = true;
        setStatus(
          elements.notificationStatus,
          "This browser does not support push notifications.",
          true,
        );
        return;
      }

      sdk.User.PushSubscription.addEventListener("change", async (event) => {
        renderNotificationState();
        if (event.current.token && !event.previous.token) {
          await syncPreferences();
        }
      });
      renderNotificationState();
      if (isPushActive() && selected.size) {
        await syncPreferences();
      }
    } catch (error) {
      console.error(error);
      elements.enableButton.disabled = true;
      setStatus(
        elements.notificationStatus,
        "Push notifications could not be initialized.",
        true,
      );
    }
  });
}

function applyBasicPreferences(preferences) {
  if (
    Array.isArray(preferences.companies) &&
    preferences.companies.length
  ) {
    selected = new Set(preferences.companies);
    if (
      Array.isArray(preferences.source_keys) &&
      preferences.source_keys.length
    ) {
      selectedTracks = new Set(
        preferences.source_keys.filter((track) => TRACK_TAGS[track]),
      );
    }
  }
  writeStoredSet(STORAGE_KEY, selected);
  writeStoredSet(TRACK_STORAGE_KEY, selectedTracks);
  companies = [...new Set([...companies, ...selected])].sort((left, right) =>
    left.localeCompare(right),
  );
  renderTracks();
  renderCompanies();
  renderSelectionCount();
}

window.JobAlertsUI = {
  applyBasicPreferences,
  getBasicPreferences: () => ({
    companies: [...selected],
    source_keys: [...selectedTracks],
  }),
  addCompanyAndTrack: (company, track) => {
    const name = company.trim();
    selected.add(name);
    selectedTracks.add(track);
    companies = [...new Set([...companies, name])].sort((left, right) =>
      left.localeCompare(right),
    );
    writeStoredSet(STORAGE_KEY, selected);
    writeStoredSet(TRACK_STORAGE_KEY, selectedTracks);
    renderTracks();
    renderCompanies();
    renderSelectionCount();
    return {
      companies: [...selected],
      source_keys: [...selectedTracks],
    };
  },
  isPushActive,
};
window.dispatchEvent(new Event("job-alerts-ui-ready"));

async function loadCompanies() {
  try {
    companies = await fetchCompanies();
  } catch (error) {
    console.error(error);
    companies = [...RECOMMENDED_COMPANIES];
    setStatus(
      elements.saveStatus,
      "The live company list is unavailable; showing recommended companies.",
      true,
    );
  }

  companies = [...new Set([...companies, ...selected])].sort((left, right) =>
    left.localeCompare(right),
  );
  renderCompanies();
  renderSelectionCount();
}

elements.clearButton.addEventListener("click", clearCompanies);
elements.enableButton.addEventListener("click", enableNotifications);
elements.recommendedButton.addEventListener("click", selectRecommended);
elements.saveButton.addEventListener("click", syncPreferences);
elements.search.addEventListener("input", renderCompanies);
for (const input of elements.trackInputs) {
  input.addEventListener("change", () => toggleTrack(input));
}

initializeInstallExperience();
initializeOneSignal();
renderTracks();
loadCompanies();
