const TILE_STATE_MAP = new Map([
  ["correct", "correct"],
  ["present", "present"],
  ["absent", "absent"],
  ["wrong", "absent"]
]);

let lastPayload = "";
let observer = null;
let debounceTimer = null;

function allElementsDeep(root = document) {
  const elements = [];
  const visit = (node) => {
    if (!node) {
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      elements.push(node);
      if (node.shadowRoot) {
        visit(node.shadowRoot);
      }
    }

    for (const child of node.children || []) {
      visit(child);
    }
  };

  visit(root.documentElement || root);
  return elements;
}

function readState(tile) {
  const explicitState = tile.getAttribute("data-state") || tile.getAttribute("evaluation") || "";
  const normalizedExplicitState = explicitState.toLowerCase();
  if (["empty", "tbd"].includes(normalizedExplicitState)) {
    return null;
  }

  if (TILE_STATE_MAP.has(normalizedExplicitState)) {
    return TILE_STATE_MAP.get(normalizedExplicitState);
  }

  const rawState = tile.getAttribute("aria-label") || tile.className?.toString() || "";

  const normalized = rawState.toLowerCase();
  for (const [needle, state] of TILE_STATE_MAP) {
    if (normalized.includes(needle)) {
      return state;
    }
  }

  return null;
}

function readLetter(tile) {
  const explicitLetter = tile.getAttribute("letter") || tile.getAttribute("data-letter") || "";
  if (/^[a-z]$/i.test(explicitLetter)) {
    return explicitLetter.toLowerCase();
  }

  const textLetter = tile.textContent?.trim() || "";
  if (/^[a-z]$/i.test(textLetter)) {
    return textLetter.toLowerCase();
  }

  const ariaLabel = tile.getAttribute("aria-label") || "";
  if (ariaLabel.toLowerCase().includes("empty")) {
    return "";
  }

  const ariaMatch = ariaLabel.toLowerCase().match(/\bletter,\s*([a-z])\b.*\b(correct|present|absent|wrong)\b/);
  if (ariaMatch) {
    return ariaMatch[1];
  }

  return "";
}

function isBoardTile(element) {
  const tag = element.tagName.toLowerCase();
  const testId = element.getAttribute("data-testid") || "";
  return (
    tag === "game-tile" ||
    testId === "tile" ||
    element.hasAttribute("data-state") ||
    element.hasAttribute("evaluation")
  );
}

function readTile(element, order) {
  return {
    element,
    order,
    letter: readLetter(element),
    state: readState(element)
  };
}

function completeTiles(elements) {
  return elements
    .filter(isBoardTile)
    .map(readTile)
    .filter((tile) => tile.letter && tile.state);
}

function findRows() {
  return allElementsDeep().filter((element) => {
    const tag = element.tagName.toLowerCase();
    const marker = [
      tag,
      element.getAttribute("aria-label") || "",
      element.getAttribute("data-testid") || "",
      element.getAttribute("class") || ""
    ]
      .join(" ")
      .toLowerCase();

    return tag === "game-row" || marker.includes("row ");
  });
}

function rowGuesses() {
  const guesses = [];

  for (const row of findRows()) {
    const tiles = completeTiles(allElementsDeep(row));
    if (tiles.length < 5) {
      continue;
    }

    if (tiles.length !== 5) {
      continue;
    }

    const rowTiles = tiles;
    const word = rowTiles.map((tile) => tile.letter).join("");
    const pattern = rowTiles.map((tile) => tile.state);

    if (word.length === 5 && pattern.every(Boolean)) {
      guesses.push({ word, pattern });
    }
  }

  return dedupeGuesses(guesses);
}

function fallbackTiles() {
  const elements = allElementsDeep();
  const gameTiles = elements.filter((element) => element.tagName.toLowerCase() === "game-tile");
  return completeTiles(gameTiles.length ? gameTiles : elements);
}

function groupTilesIntoGuesses(tiles) {
  const guesses = [];

  for (let i = 0; i <= tiles.length - 5; i += 5) {
    const row = tiles.slice(i, i + 5);
    const word = row.map((tile) => tile.letter).join("");
    const pattern = row.map((tile) => tile.state);

    if (word.length === 5 && pattern.every(Boolean)) {
      guesses.push({ word, pattern });
    }
  }

  return dedupeGuesses(guesses);
}

function dedupeGuesses(guesses) {
  const seen = new Set();
  return guesses.filter((guess) => {
    const key = `${guess.word}:${guess.pattern.join("")}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function readBoard() {
  const guesses = rowGuesses();
  if (guesses.length) {
    return guesses;
  }

  return groupTilesIntoGuesses(fallbackTiles());
}

function publishBoard(force = false) {
  const guesses = readBoard();
  const payload = JSON.stringify(guesses);

  if (!force && payload === lastPayload) {
    return;
  }

  lastPayload = payload;
  chrome.runtime.sendMessage({ type: "WORDLE_BOARD_UPDATED", guesses }).catch(() => {});
}

function schedulePublish() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => publishBoard(false), 250);
}

function startObserver() {
  if (observer) {
    return;
  }

  observer = new MutationObserver(schedulePublish);
  observer.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true
  });

  publishBoard(true);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "COLLECT_BOARD") {
    const guesses = readBoard();
    chrome.runtime.sendMessage({ type: "WORDLE_BOARD_UPDATED", guesses }).then(sendResponse);
    return true;
  }

  return false;
});

startObserver();
