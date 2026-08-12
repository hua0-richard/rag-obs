import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { BrandMark } from '@/shared/components/BrandMark';
import { Flashcard } from './Flashcard';
import { useNavigate } from 'react-router-dom';
import { buildDeckTitle, loadDecks, markDeckStudied } from '@/features/flashcards/utils/flashcardDecks';
import { apiUrl } from '@/shared/utils/api';
import type { ApiDeck, ApiFile, ApiFlashcard } from '@/features/flashcards/types';

const HINTS_STORAGE_KEY = 'flashcards_keyboard_hints_dismissed';

const cardVariants = {
    enter: (d: number) => ({
        opacity: 0,
        x: d * 12,
    }),
    center: {
        opacity: 1,
        x: 0,
    },
    exit: (d: number) => ({
        opacity: 0,
        x: d * -12,
    }),
};

export function FlashcardsPage() {
    const navigate = useNavigate();
    const [cards, setCards] = useState<ApiFlashcard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [direction, setDirection] = useState(1);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [files, setFiles] = useState<ApiFile[]>([]);
    const [deckSourceLabel, setDeckSourceLabel] = useState<string | null>(null);
    const [deckSources, setDeckSources] = useState<NonNullable<ApiDeck["source"]>>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [showHints, setShowHints] = useState(() => {
        try {
            return localStorage.getItem(HINTS_STORAGE_KEY) !== '1';
        } catch {
            return true;
        }
    });
    const sourcesRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const sessionId = localStorage.getItem("session_id");
        if (!sessionId) {
            setError("No session id found. Upload files to start a session.");
            setIsLoading(false);
            setDeckSourceLabel(null);
            setDeckSources([]);
            return;
        }
        const selectedDeckKey = `flashcards_selected_deck_id:${sessionId}`;
        const legacyDeckKey = "flashcards_selected_deck_id";
        const storedDeckId =
            localStorage.getItem(selectedDeckKey) ?? localStorage.getItem(legacyDeckKey);
        const initialDeckId = storedDeckId ? Number(storedDeckId) : NaN;
        const selectedDeckId = Number.isFinite(initialDeckId) ? initialDeckId : null;
        if (selectedDeckId !== null && localStorage.getItem(selectedDeckKey) === null) {
            localStorage.setItem(selectedDeckKey, String(selectedDeckId));
        }
        localStorage.removeItem(legacyDeckKey);
        if (selectedDeckId !== null) {
            const matchingLocalDeck = loadDecks().find(
                (deck) => deck.sessionId === sessionId && deck.backendDeckId === selectedDeckId
            );
            if (matchingLocalDeck) {
                markDeckStudied(sessionId, matchingLocalDeck.id);
            } else {
                markDeckStudied(sessionId);
            }
        } else {
            markDeckStudied(sessionId);
        }

        const fetchFlashcards = async () => {
            setIsLoading(true);
            setError(null);
            setIsComplete(false);
            try {
                const response = await fetch(
                    apiUrl("/flashcards", { session_id: sessionId, deck_id: selectedDeckId })
                );
                if (!response.ok) {
                    const detail = await response.text();
                    throw new Error(detail || "Failed to load flashcards");
                }
                const data = await response.json();
                const list = Array.isArray(data?.flashcards) ? data.flashcards : [];
                const resolvedDeckId =
                    typeof data?.deck_id === "number" && Number.isFinite(data.deck_id)
                        ? data.deck_id
                        : null;
                if (resolvedDeckId !== null) {
                    localStorage.setItem(selectedDeckKey, String(resolvedDeckId));
                } else {
                    localStorage.removeItem(selectedDeckKey);
                }
                setCards(list);
                setCurrentIndex(0);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to load flashcards";
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };

        const fetchFiles = async () => {
            try {
                const response = await fetch(
                    apiUrl("/files", { session_id: sessionId })
                );
                if (!response.ok) {
                    const detail = await response.text();
                    throw new Error(detail || "Failed to load files");
                }
                const data = await response.json();
                const list = Array.isArray(data?.files) ? data.files : [];
                setFiles(list);
            } catch {
                setFiles([]);
            }
        };

        const fetchDecks = async () => {
            setDeckSourceLabel(null);
            setDeckSources([]);
            try {
                const response = await fetch(
                    apiUrl("/flashcard-decks", { session_id: sessionId })
                );
                if (!response.ok) return;
                const data = await response.json();
                const list: ApiDeck[] = Array.isArray(data?.decks) ? data.decks : [];
                if (list.length > 0) {
                    const deck =
                        (selectedDeckId !== null
                            ? list.find((entry) => entry.id === selectedDeckId)
                            : undefined) ?? list[0];
                    const label =
                        typeof deck?.source_label === "string" && deck.source_label.trim().length > 0
                            ? deck.source_label
                            : typeof deck?.title === "string"
                                ? deck.title
                                : null;
                    setDeckSourceLabel(label);
                    setDeckSources(Array.isArray(deck?.source) ? deck.source : []);
                }
            } catch {
                setDeckSources([]);
            }
        };

        fetchFlashcards();
        fetchFiles();
        fetchDecks();
    }, []);

    const hasCards = cards.length > 0;
    const progressRatio = hasCards
        ? isComplete
            ? 1
            : (currentIndex + 1) / cards.length
        : 0;

    const handleNext = () => {
        if (!hasCards || isComplete) return;
        if (currentIndex < cards.length - 1) {
            setDirection(1);
            setCurrentIndex((prev) => prev + 1);
            return;
        }
        setIsComplete(true);
    };

    const handlePrev = () => {
        if (isComplete) {
            setIsComplete(false);
            setDirection(-1);
            return;
        }
        if (currentIndex > 0) {
            setDirection(-1);
            setCurrentIndex((prev) => prev - 1);
        }
    };

    const handleRestart = () => {
        setIsComplete(false);
        setDirection(-1);
        setCurrentIndex(0);
    };

    const dismissHints = () => {
        setShowHints(false);
        try {
            localStorage.setItem(HINTS_STORAGE_KEY, '1');
        } catch {
            // ignore
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            if (e.key === "ArrowRight") handleNext();
            if (e.key === "ArrowLeft") handlePrev();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    });

    const formatFilename = (value: string | null) => {
        if (!value) return "Untitled";
        const trimmed = value.trim();
        if (!trimmed) return "Untitled";
        return trimmed.split(/[\\/]/).pop() ?? trimmed;
    };

    const uniqueDeckSources = (() => {
        const seen = new Set<string>();
        const unique: NonNullable<ApiDeck["source"]> = [];
        for (const source of deckSources) {
            if (!source || typeof source.filename !== "string") continue;
            const name = source.filename.trim();
            if (!name) continue;
            const key =
                typeof source.id === "number" && Number.isFinite(source.id)
                    ? `id:${source.id}`
                    : `name:${name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(source);
        }
        return unique;
    })();

    const deckSourceNames = uniqueDeckSources
        .map((source) => source.filename)
        .filter((name): name is string => typeof name === "string" && name.trim().length > 0);
    const fallbackSourceLabel =
        deckSourceNames.length > 0
            ? buildDeckTitle(deckSourceNames)
            : files.length > 0
                ? buildDeckTitle(files.map((file) => file.filename ?? ""))
                : null;
    const deckLabel = deckSourceLabel || fallbackSourceLabel || "Flashcards";

    return (
        <div className="min-h-screen w-screen bg-[var(--bg-chrome)] flex flex-col relative overflow-hidden">

            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex flex-col border-b border-[var(--stroke-tertiary)] bg-[var(--bg-chrome)]">
                <div className="flex items-center justify-between h-16 px-5 sm:px-6">
                    <div className="flex items-center gap-3 min-w-0">
                        <BrandMark />
                        <span className="text-[var(--fg-quaternary)] flex-shrink-0">/</span>
                        <span className="text-[14px] text-[var(--fg-secondary)] truncate max-w-[36vw] sm:max-w-[48vw]" title={deckLabel}>
                            {deckLabel}
                        </span>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate('/flashcards-lab')}
                        className="flex-shrink-0"
                        aria-label="Back to lab"
                    >
                        <X className="size-4" />
                    </Button>
                </div>
                {hasCards && !isLoading && !error ? (
                    <div className="h-px w-full bg-[var(--fill-tertiary)]" aria-hidden>
                        <div
                            className="h-full bg-[var(--accent-hex)] transition-[width] duration-300 ease-out"
                            style={{ width: `${Math.round(progressRatio * 100)}%` }}
                        />
                    </div>
                ) : null}
            </nav>

            <main className="flex-1 flex flex-col items-center justify-center w-full px-5 md:px-8 relative z-10 pt-24 pb-8">

                {/* Sources */}
                {uniqueDeckSources.length > 0 && !isComplete && (
                    <div className="relative w-full max-w-2xl mb-5">
                        <div
                            ref={sourcesRef}
                            className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none"
                        >
                            <span className="flex-none text-label pr-1">
                                Sources
                            </span>
                            {uniqueDeckSources.map((source, index) => (
                                <span
                                    key={source.id ?? source.filename ?? `source-${index}`}
                                    className="flex-none rounded-md border border-[var(--stroke-tertiary)] bg-[var(--fill-quaternary)] px-2.5 py-1 text-[12px] leading-4 font-mono text-[var(--fg-secondary)] whitespace-nowrap"
                                    title={source.filename ?? undefined}
                                >
                                    {formatFilename(source.filename ?? null)}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Card */}
                <div className="w-full flex justify-center mb-8 relative">
                    <AnimatePresence mode="wait" custom={direction}>
                        {isLoading ? (
                            <div
                                key="loading"
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-2xl h-[clamp(280px,44vh,400px)] rounded-[10px] border border-[var(--stroke-tertiary)] bg-[var(--bg-elevated)] flex flex-col items-center justify-center gap-3">
                                    <div className="loader-ring loader-ring-lg" aria-hidden />
                                    <span className="text-label">Loading</span>
                                </div>
                            </div>
                        ) : error ? (
                            <div
                                key="error"
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-2xl h-[clamp(280px,44vh,400px)] rounded-[10px] border border-[var(--stroke-tertiary)] bg-[var(--bg-elevated)] flex flex-col items-center justify-center gap-4 px-8 text-center">
                                    <div className="space-y-1">
                                        <p className="text-[15px] text-[var(--fg-secondary)]">{error}</p>
                                        <p className="text-[12px] text-[var(--fg-tertiary)]">
                                            Start from upload or pick a deck in the lab.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center gap-3">
                                        <button
                                            type="button"
                                            onClick={() => navigate("/upload")}
                                            className="luminous-btn inline-flex h-9 items-center px-4 text-[14px]"
                                        >
                                            Go to upload
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => navigate("/flashcards-lab")}
                                            className="text-[14px] text-[var(--fg-tertiary)] hover:text-[var(--fg-secondary)] transition-colors"
                                        >
                                            Open lab
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : !hasCards ? (
                            <div
                                key="empty"
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-2xl h-[clamp(280px,44vh,400px)] rounded-[10px] border border-[var(--stroke-tertiary)] bg-[var(--bg-elevated)] flex flex-col items-center justify-center gap-4 px-8 text-center">
                                    {loadDecks().length === 0 ? (
                                        <>
                                            <div className="space-y-1">
                                                <p className="text-[15px] text-[var(--fg-secondary)]">No flashcards yet</p>
                                                <p className="text-[12px] text-[var(--fg-tertiary)] max-w-[280px] mx-auto leading-4">
                                                    Upload your notes, then generate a deck to start studying.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => navigate("/upload")}
                                                className="luminous-btn inline-flex h-9 items-center px-4 text-[14px]"
                                            >
                                                Upload notes
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className="space-y-1">
                                                <p className="text-[15px] text-[var(--fg-secondary)]">No cards in this deck</p>
                                                <p className="text-[12px] text-[var(--fg-tertiary)] max-w-[280px] mx-auto leading-4">
                                                    Pick another deck or generate a new one from your notes.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => navigate("/flashcards-lab")}
                                                className="luminous-btn inline-flex h-9 items-center px-4 text-[14px]"
                                            >
                                                Back to lab
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : isComplete ? (
                            <motion.div
                                key="complete"
                                custom={direction}
                                variants={cardVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-2xl h-[clamp(280px,44vh,400px)] rounded-[10px] border border-[var(--stroke-tertiary)] bg-[var(--bg-elevated)] flex flex-col items-center justify-center gap-5 px-8 text-center">
                                    <div className="space-y-1.5">
                                        <p className="text-[18px] text-heading text-[var(--fg)]">Deck complete</p>
                                        <p className="text-[13px] text-[var(--fg-tertiary)]">
                                            You reviewed {cards.length} card{cards.length === 1 ? "" : "s"}.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-center gap-3">
                                        <button
                                            type="button"
                                            onClick={handleRestart}
                                            className="luminous-btn inline-flex h-9 items-center gap-2 px-4 text-[14px]"
                                        >
                                            <RotateCcw className="size-3.5" />
                                            Study again
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => navigate("/flashcards-lab")}
                                            className="text-[14px] text-[var(--fg-tertiary)] hover:text-[var(--fg-secondary)] transition-colors"
                                        >
                                            Back to lab
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={cards[currentIndex]?.id ?? currentIndex}
                                custom={direction}
                                variants={cardVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                                className="w-full flex justify-center"
                            >
                                <Flashcard
                                    front={cards[currentIndex].question}
                                    back={cards[currentIndex].answer}
                                    className="max-w-2xl"
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Controls */}
                {!isComplete ? (
                    <div className="flex items-center gap-5 z-20">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handlePrev}
                            disabled={!hasCards || currentIndex === 0}
                            aria-label="Previous card"
                        >
                            <ChevronLeft className="size-4" />
                        </Button>

                        <div className="w-14 flex items-center justify-center text-[13px] tabular-nums font-mono text-[var(--fg-tertiary)]">
                            {hasCards ? (
                                <span className="flex items-center gap-1.5">
                                    <span className="text-[var(--accent-hex)]">{currentIndex + 1}</span>
                                    <span className="text-[var(--fg-quaternary)]">/</span>
                                    <span>{cards.length}</span>
                                </span>
                            ) : (
                                <span>— / —</span>
                            )}
                        </div>

                        <Button
                            variant="outline"
                            size="icon"
                            onClick={handleNext}
                            disabled={!hasCards}
                            aria-label={currentIndex >= cards.length - 1 ? "Finish deck" : "Next card"}
                        >
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                ) : null}

                {hasCards && !isLoading && !error && showHints ? (
                    <div className="hidden sm:flex mt-6 items-center gap-3 text-[12px] text-[var(--fg-tertiary)]">
                        <span className="inline-flex items-center gap-1.5">
                            <kbd className="kbd">Space</kbd>
                            <span>flip</span>
                        </span>
                        <span className="text-[var(--fg-quaternary)]">·</span>
                        <span className="inline-flex items-center gap-1.5">
                            <kbd className="kbd">←</kbd>
                            <kbd className="kbd">→</kbd>
                            <span>navigate</span>
                        </span>
                        <button
                            type="button"
                            onClick={dismissHints}
                            className="ml-1 text-[var(--fg-quaternary)] hover:text-[var(--fg-secondary)] transition-colors"
                            aria-label="Dismiss keyboard hints"
                        >
                            Dismiss
                        </button>
                    </div>
                ) : null}
            </main>
        </div>
    );
}
