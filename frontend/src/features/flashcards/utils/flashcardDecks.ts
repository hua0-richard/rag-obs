export type FlashcardDeck = {
  id: string;
  sessionId: string;
  title: string;
  cardCount: number;
  noteCount: number;
  notes: string[];
  createdAt: string;
  lastStudiedAt?: string;
  mastery?: number;
};

const STORAGE_KEY = "flashcard_decks";

const isString = (value: unknown): value is string => typeof value === "string";

const normalizeNotes = (notes: unknown): string[] => {
  if (!Array.isArray(notes)) {
    return [];
  }
  return notes.filter(isString);
};

const normalizeDeck = (raw: unknown): FlashcardDeck | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const deck = raw as Record<string, unknown>;
  const sessionId = isString(deck.sessionId) ? deck.sessionId : "";
  if (!sessionId) {
    return null;
  }
  const notes = normalizeNotes(deck.notes);
  const createdAt = isString(deck.createdAt) ? deck.createdAt : new Date().toISOString();
  const lastStudiedAt = isString(deck.lastStudiedAt) ? deck.lastStudiedAt : undefined;
  const mastery = typeof deck.mastery === "number" && Number.isFinite(deck.mastery)
    ? deck.mastery
    : undefined;

  return {
    id: isString(deck.id) ? deck.id : `deck-${sessionId}`,
    sessionId,
    title: isString(deck.title) && deck.title.trim().length > 0 ? deck.title : "Untitled Deck",
    cardCount:
      typeof deck.cardCount === "number" && Number.isFinite(deck.cardCount)
        ? deck.cardCount
        : 0,
    noteCount:
      typeof deck.noteCount === "number" && Number.isFinite(deck.noteCount)
        ? deck.noteCount
        : notes.length,
    notes,
    createdAt,
    lastStudiedAt,
    mastery,
  };
};

export const loadDecks = (): FlashcardDeck[] => {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((deck) => normalizeDeck(deck))
      .filter((deck): deck is FlashcardDeck => deck !== null);
  } catch {
    return [];
  }
};

export const saveDecks = (decks: FlashcardDeck[]) => {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(decks));
  } catch {
    // Ignore storage errors (quota, private mode, etc.).
  }
};

export const upsertDeck = (deck: FlashcardDeck): FlashcardDeck[] => {
  const existing = loadDecks();
  const deckIndex = existing.findIndex((item) => item.sessionId === deck.sessionId);
  let nextDeck = deck;

  if (deckIndex >= 0) {
    const current = existing[deckIndex];
    nextDeck = {
      ...current,
      ...deck,
      createdAt: current.createdAt || deck.createdAt,
      notes: deck.notes.length > 0 ? deck.notes : current.notes,
      noteCount: deck.noteCount || current.noteCount,
    };
    existing.splice(deckIndex, 1);
  }

  const next = [nextDeck, ...existing];
  saveDecks(next);
  return next;
};

export const markDeckStudied = (sessionId: string): FlashcardDeck[] => {
  const existing = loadDecks();
  let changed = false;
  const next = existing.map((deck) => {
    if (deck.sessionId !== sessionId) {
      return deck;
    }
    changed = true;
    return {
      ...deck,
      lastStudiedAt: new Date().toISOString(),
    };
  });
  if (changed) {
    saveDecks(next);
  }
  return next;
};

export const buildDeckTitle = (filenames: string[]): string => {
  const cleaned = filenames
    .filter((name) => typeof name === "string" && name.trim().length > 0)
    .map((name) => name.split(/[\\/]/).pop() ?? name)
    .map((name) => name.replace(/\.[^/.]+$/, ""));

  if (cleaned.length === 0) {
    return "Untitled Deck";
  }
  const first = cleaned[0];
  if (cleaned.length === 1) {
    return first;
  }
  return `${first} + ${cleaned.length - 1} more`;
};
