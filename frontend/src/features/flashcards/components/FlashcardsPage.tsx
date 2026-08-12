import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Flashcard } from './Flashcard';
import { useNavigate } from 'react-router-dom';
import { buildDeckTitle, loadDecks, markDeckStudied } from '@/features/flashcards/utils/flashcardDecks';
import { apiUrl } from '@/shared/utils/api';
import type { ApiDeck, ApiFile, ApiFlashcard } from '@/features/flashcards/types';

const cardVariants = {
    enter: (d: number) => ({
        opacity: 0,
        x: d * 40,
    }),
    center: {
        opacity: 1,
        x: 0,
    },
    exit: (d: number) => ({
        opacity: 0,
        x: d * -40,
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

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowRight") handleNext();
            if (e.key === "ArrowLeft") handlePrev();
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    });

    const handleNext = () => {
        if (cards.length > 0 && currentIndex < cards.length - 1) {
            setDirection(1);
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setDirection(-1);
            setCurrentIndex(prev => prev - 1);
        }
    };

    const hasCards = cards.length > 0;

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
    const deckSubtitle = deckSourceLabel || fallbackSourceLabel ? "Flashcards" : "Study";

    return (
        <div className="min-h-screen w-screen bg-[#09090b] flex flex-col relative overflow-hidden selection:bg-white/10 selection:text-white">

            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-6 py-5 sm:py-6">
                <div className="flex items-center gap-2 min-w-0 font-mono text-sm font-medium tracking-widest uppercase">
                    <span className="text-[hsl(var(--accent))] truncate max-w-[40vw] sm:max-w-[55vw]" title={deckLabel}>
                        {deckLabel}
                    </span>
                    <span className="text-white/20 flex-shrink-0">/</span>
                    <span className="text-white/40 flex-shrink-0">{deckSubtitle}</span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/upload')}
                    className="flex-shrink-0 text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-colors duration-200"
                >
                    <X className="size-5" />
                </Button>
            </nav>

            <main className="flex-1 flex flex-col items-center justify-center w-full px-4 md:px-8 relative z-10 pt-20 pb-4">

                {/* Sources */}
                <AnimatePresence>
                    {uniqueDeckSources.length > 0 && (
                        <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.3 }}
                            className="relative w-full max-w-3xl mb-4 sm:mb-6"
                        >
                            <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#09090b] to-transparent z-10 pointer-events-none" />
                            <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#09090b] to-transparent z-10 pointer-events-none" />

                            <div
                                ref={sourcesRef}
                                className="flex items-center gap-2 overflow-x-auto px-2 pb-1 scrollbar-none"
                            >
                                <span className="flex-none text-[10px] uppercase tracking-[0.16em] font-mono text-white/25 pr-1">
                                    Sources
                                </span>
                                {uniqueDeckSources.map((source, index) => (
                                    <span
                                        key={source.id ?? source.filename ?? `source-${index}`}
                                        className="flex-none rounded-md border border-white/8 bg-white/[0.03] px-2.5 py-1 text-[11px] font-mono text-white/45 whitespace-nowrap"
                                        title={source.filename ?? undefined}
                                    >
                                        {formatFilename(source.filename ?? null)}
                                    </span>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Card */}
                <div className="w-full flex justify-center mb-6 sm:mb-10 relative">
                    <AnimatePresence mode="wait" custom={direction}>
                        {isLoading ? (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-3xl h-[clamp(260px,42vh,384px)] rounded-2xl border border-white/10 bg-[#18181b] flex flex-col items-center justify-center gap-3">
                                    <div className="h-6 w-6 rounded-full border-2 border-white/10 border-t-[hsl(var(--accent)/0.7)] animate-spin" />
                                    <span className="text-[10px] font-mono uppercase tracking-widest text-white/25">Loading</span>
                                </div>
                            </motion.div>
                        ) : error ? (
                            <motion.div
                                key="error"
                                custom={direction}
                                variants={cardVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-3xl h-[clamp(260px,42vh,384px)] rounded-2xl border border-white/10 bg-[#18181b] flex flex-col items-center justify-center gap-4 px-10 text-center">
                                    <p className="text-white/40 text-sm">{error}</p>
                                    <button
                                        type="button"
                                        onClick={() => navigate("/upload")}
                                        className="text-sm text-[hsl(var(--accent))] hover:text-white transition-colors duration-200"
                                    >
                                        Go to upload →
                                    </button>
                                </div>
                            </motion.div>
                        ) : !hasCards ? (
                            <motion.div
                                key="empty"
                                custom={direction}
                                variants={cardVariants}
                                initial="enter"
                                animate="center"
                                exit="exit"
                                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-3xl h-[clamp(260px,42vh,384px)] rounded-2xl border border-white/10 bg-[#18181b] flex flex-col items-center justify-center gap-4 px-10 text-center">
                                    {loadDecks().length === 0 ? (
                                        <>
                                            <p className="text-white/40 text-sm">No flashcards yet.</p>
                                            <button
                                                type="button"
                                                onClick={() => navigate("/upload")}
                                                className="text-sm text-[hsl(var(--accent))] hover:text-white transition-colors duration-200"
                                            >
                                                Upload your notes to get started →
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-white/40 text-sm">No flashcards found for this deck.</p>
                                            <button
                                                type="button"
                                                onClick={() => navigate("/flashcards-lab")}
                                                className="text-sm text-[hsl(var(--accent))] hover:text-white transition-colors duration-200"
                                            >
                                                Select a different deck →
                                            </button>
                                        </>
                                    )}
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
                                transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
                                className="w-full flex justify-center"
                            >
                                <Flashcard
                                    front={cards[currentIndex].question}
                                    back={cards[currentIndex].answer}
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-6 sm:gap-10 z-20">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handlePrev}
                        disabled={!hasCards || currentIndex === 0}
                        className="h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-[#18181b]
                                   border border-white/10
                                   hover:bg-[#1f1f23] hover:border-white/20
                                   active:scale-95
                                   disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-[#18181b]
                                   transition-all duration-150 group"
                    >
                        <ChevronLeft className="size-5 text-white/45 group-hover:text-white transition-colors" />
                    </Button>

                    <div className="w-14 flex items-center justify-center text-xs font-mono tracking-widest uppercase text-white/25">
                        {hasCards ? (
                            <span className="flex items-center gap-1">
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.span
                                        key={currentIndex}
                                        initial={{ opacity: 0, y: direction > 0 ? 6 : -6 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: direction > 0 ? -6 : 6 }}
                                        transition={{ duration: 0.15, ease: "easeOut" }}
                                        className="text-[hsl(var(--accent))] inline-block w-5 text-center"
                                    >
                                        {currentIndex + 1}
                                    </motion.span>
                                </AnimatePresence>
                                <span className="opacity-40">/</span>
                                <span>{cards.length}</span>
                            </span>
                        ) : (
                            <span className="opacity-30">— / —</span>
                        )}
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleNext}
                        disabled={!hasCards || currentIndex === cards.length - 1}
                        className="h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-[#18181b]
                                   border border-white/10
                                   hover:bg-[#1f1f23] hover:border-white/20
                                   active:scale-95
                                   disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:bg-[#18181b]
                                   transition-all duration-150 group"
                    >
                        <ChevronRight className="size-5 text-white/45 group-hover:text-white transition-colors" />
                    </Button>
                </div>

                <p className="hidden sm:block mt-6 text-[10px] font-mono text-white/20 tracking-widest uppercase">
                    ← → to navigate · click card to flip
                </p>
            </main>
        </div>
    );
}
