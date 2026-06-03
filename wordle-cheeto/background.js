const state = {
  ready: false,
  words: [],
  guesses: [],
  candidates: [],
  recommendations: [],
  updatedAt: null,
  error: null
};

const MAX_RECOMMENDATIONS = 20;

async function loadWords() {
  if (state.ready) {
    return;
  }

  try {
    const response = await fetch(chrome.runtime.getURL("words.json"));
    const words = await response.json();
    state.words = words.filter((word) => /^[a-z]{5}$/.test(word));
    state.candidates = [...state.words];
    state.recommendations = rankWords(state.candidates).slice(0, MAX_RECOMMENDATIONS);
    state.ready = true;
  } catch (error) {
    state.error = `Could not load words.json: ${error.message}`;
  }
}

function normalizeGuesses(guesses) {
  return guesses
    .map((guess) => ({
      word: String(guess.word || "").toLowerCase(),
      pattern: Array.isArray(guess.pattern) ? guess.pattern : []
    }))
    .filter(({ word, pattern }) => word.length === 5 && pattern.length === 5)
    .filter(({ pattern }) => pattern.every((value) => ["correct", "present", "absent"].includes(value)));
}

function evaluateGuess(guess, answer) {
  const result = Array(5).fill("absent");
  const remaining = new Map();

  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
    } else {
      remaining.set(answer[i], (remaining.get(answer[i]) || 0) + 1);
    }
  }

  for (let i = 0; i < 5; i += 1) {
    if (result[i] === "correct") {
      continue;
    }

    const count = remaining.get(guess[i]) || 0;
    if (count > 0) {
      result[i] = "present";
      remaining.set(guess[i], count - 1);
    }
  }

  return result;
}

function matchesEvidence(candidate, guesses) {
  return guesses.every(({ word, pattern }) => {
    const expected = evaluateGuess(word, candidate);
    return expected.every((value, index) => value === pattern[index]);
  });
}

function rankWords(words) {
  const positional = Array.from({ length: 5 }, () => new Map());
  const global = new Map();

  for (const word of words) {
    const uniqueLetters = new Set(word);
    for (let i = 0; i < 5; i += 1) {
      positional[i].set(word[i], (positional[i].get(word[i]) || 0) + 1);
    }
    for (const letter of uniqueLetters) {
      global.set(letter, (global.get(letter) || 0) + 1);
    }
  }

  return [...words]
    .map((word) => {
      const uniqueLetters = new Set(word);
      let score = 0;

      for (let i = 0; i < 5; i += 1) {
        score += positional[i].get(word[i]) || 0;
      }
      for (const letter of uniqueLetters) {
        score += (global.get(letter) || 0) * 0.5;
      }

      score -= (5 - uniqueLetters.size) * words.length * 0.15;
      return { word, score };
    })
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .map(({ word }) => word);
}

async function updateFromBoard(guesses) {
  await loadWords();

  state.guesses = normalizeGuesses(guesses);
  state.candidates = state.words.filter((word) => matchesEvidence(word, state.guesses));
  state.recommendations = rankWords(state.candidates).slice(0, MAX_RECOMMENDATIONS);
  state.updatedAt = Date.now();

  return snapshot();
}

function snapshot() {
  return {
    ready: state.ready,
    totalWords: state.words.length,
    guesses: state.guesses,
    candidateCount: state.candidates.length,
    candidates: state.candidates.slice(0, 200),
    recommendations: state.recommendations,
    updatedAt: state.updatedAt,
    error: state.error
  };
}

chrome.runtime.onInstalled.addListener(() => {
  loadWords();
});

chrome.runtime.onStartup.addListener(() => {
  loadWords();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "WORDLE_BOARD_UPDATED") {
    updateFromBoard(message.guesses || []).then(sendResponse);
    return true;
  }

  if (message?.type === "GET_STATE") {
    loadWords().then(() => sendResponse(snapshot()));
    return true;
  }

  return false;
});
