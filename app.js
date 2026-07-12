import {
  RECOMMENDED_COMPANIES,
  companyTag,
  fetchCompanies,
  normalizeCompany,
} from "./company-data.js";

const MAX_SELECTIONS = 50;
const STORAGE_KEY = "new-grad-alert-companies";
const SYNCED_STORAGE_KEY = "new-grad-alert-synced-companies";

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
};

let companies = [];
let deferredInstallPrompt = null;
let oneSignal = null;
let selected = readStoredSet(STORAGE_KEY);

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
  element.style.color = isError ? "#b42318" : "";
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
  if (checkbox.checked && selected.size >= MAX_SELECTIONS) {
    checkbox.checked = false;
    setStatus(
      elements.saveStatus,
      `Choose at most ${MAX_SELECTIONS} companies.`,
      true,
    );
    return;
  }

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
  selected = new Set(RECOMMENDED_COMPANIES.slice(0, MAX_SELECTIONS));
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

async function syncPreferences() {
  writeStoredSet(STORAGE_KEY, selected);
  if (!oneSignal || !oneSignal.User.PushSubscription.optedIn) {
    setStatus(
      elements.saveStatus,
      "Saved on this device. Enable notifications to activate alerts.",
    );
    return;
  }

  elements.saveButton.disabled = true;
  setStatus(elements.saveStatus, "Syncing preferences...");
  try {
    const previouslySynced = readStoredSet(SYNCED_STORAGE_KEY);
    const removedTags = [...previouslySynced]
      .filter((company) => !selected.has(company))
      .map(companyTag);
    if (removedTags.length) {
      await oneSignal.User.removeTags(removedTags);
    }

    const tags = Object.fromEntries(
      [...selected].map((company) => [companyTag(company), "1"]),
    );
    if (Object.keys(tags).length) {
      await oneSignal.User.addTags(tags);
    }

    writeStoredSet(SYNCED_STORAGE_KEY, selected);
    setStatus(elements.saveStatus, "Preferences saved. Your alerts are active.");
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
  const optedIn = oneSignal.User.PushSubscription.optedIn;
  elements.enableButton.textContent = optedIn
    ? "Notifications enabled"
    : "Enable notifications";
  elements.enableButton.disabled = optedIn;
  setStatus(
    elements.notificationStatus,
    optedIn
      ? "Push notifications are active on this device."
      : "Notifications are off. Enable them after choosing your companies.",
  );
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
    renderNotificationState();
    if (oneSignal.User.PushSubscription.optedIn) {
      await syncPreferences();
    }
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
  const appId = window.NEW_GRAD_ALERTS_CONFIG?.oneSignalAppId;
  if (!appId) {
    elements.enableButton.disabled = true;
    setStatus(
      elements.notificationStatus,
      "The OneSignal connection is being configured.",
    );
    return;
  }

  elements.enableButton.disabled = true;
  setStatus(elements.notificationStatus, "Connecting to the push service...");
  window.OneSignalDeferred.push(async (sdk) => {
    try {
      await sdk.init({
        appId,
        serviceWorkerPath: "new-grad-job-alerts/OneSignalSDKWorker.js",
        serviceWorkerParam: { scope: "/new-grad-job-alerts/" },
        autoResubscribe: true,
        notifyButton: { enable: false },
        welcomeNotification: { disable: true },
      });
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

initializeInstallExperience();
initializeOneSignal();
loadCompanies();
