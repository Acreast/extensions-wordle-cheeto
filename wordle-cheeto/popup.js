const statusEl = document.querySelector("#status");
const refreshButton = document.querySelector("#refresh");
const candidateCountEl = document.querySelector("#candidate-count");
const totalWordsEl = document.querySelector("#total-words");
const guessesEl = document.querySelector("#guesses");
const recommendationsEl = document.querySelector("#recommendations");
const candidatesEl = document.querySelector("#candidates");

function setStatus(message) {
  statusEl.textContent = message;
}

async function activeWordleTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("nytimes.com")) {
    return null;
  }
  return tab;
}

async function refreshBoard() {
  const tab = await activeWordleTab();
  if (!tab) {
    setStatus("Open the NYT Wordle tab, then refresh.");
    return;
  }

  try {
    refreshButton.disabled = true;
    setStatus("Reading board...");
    await chrome.tabs.sendMessage(tab.id, { type: "COLLECT_BOARD" });
  } catch (error) {
    setStatus("Could not read this tab. Reload Wordle and try again.");
  } finally {
    refreshButton.disabled = false;
  }
}

async function getState() {
  return chrome.runtime.sendMessage({ type: "GET_STATE" });
}

function renderGuesses(guesses) {
  guessesEl.innerHTML = "";

  if (!guesses.length) {
    guessesEl.className = "guesses empty";
    guessesEl.textContent = "No completed guesses detected yet.";
    return;
  }

  guessesEl.className = "guesses";
  for (const guess of guesses) {
    const row = document.createElement("div");
    row.className = "guess-row";

    for (let i = 0; i < 5; i += 1) {
      const tile = document.createElement("span");
      tile.className = `tile ${guess.pattern[i]}`;
      tile.textContent = guess.word[i];
      row.append(tile);
    }

    guessesEl.append(row);
  }
}

function renderList(container, words, itemClass) {
  container.innerHTML = "";

  if (!words.length) {
    const empty = document.createElement(itemClass === "candidate" ? "span" : "li");
    empty.className = "empty";
    empty.textContent = "No matches";
    container.append(empty);
    return;
  }

  for (const word of words) {
    const item = document.createElement(itemClass === "candidate" ? "span" : "li");
    item.className = itemClass;
    item.textContent = word;
    container.append(item);
  }
}

function render(state) {
  if (state.error) {
    setStatus(state.error);
  } else if (state.updatedAt) {
    setStatus(`Updated ${new Date(state.updatedAt).toLocaleTimeString()}`);
  } else {
    setStatus("Ready. Refresh after entering guesses.");
  }

  candidateCountEl.textContent = state.candidateCount ?? "-";
  totalWordsEl.textContent = state.totalWords ?? "-";
  renderGuesses(state.guesses || []);
  renderList(recommendationsEl, state.recommendations || [], "recommendation");
  renderList(candidatesEl, state.candidates || [], "candidate");
}

async function load() {
  await refreshBoard();
  render(await getState());
}

refreshButton.addEventListener("click", load);
load();
