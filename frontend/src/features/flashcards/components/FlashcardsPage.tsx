import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Flashcard } from './Flashcard';
import { useNavigate } from 'react-router-dom';
import { markDeckStudied } from '@/features/flashcards/utils/flashcardDecks';

type ApiFlashcard = {
    id: number;
    filename: string;
    question: string;
    answer: string;
};

export function FlashcardsPage() {
    const navigate = useNavigate();
    const [cards, setCards] = useState<ApiFlashcard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const sessionId = localStorage.getItem("session_id");
        if (!sessionId) {
            setError("No session id found. Upload files to start a session.");
            setIsLoading(false);
            return;
        }
        markDeckStudied(sessionId);

        const fetchFlashcards = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch(
                    `${import.meta.env.SERVER_URL}/flashcards?session_id=${encodeURIComponent(sessionId)}`
                );
                if (!response.ok) {
                    const detail = await response.text();
                    throw new Error(detail || "Failed to load flashcards");
                }
                const data = await response.json();
                const list = Array.isArray(data?.flashcards) ? data.flashcards : [];
                setCards(list);
                setCurrentIndex(0);
            } catch (err) {
                const message = err instanceof Error ? err.message : "Failed to load flashcards";
                setError(message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchFlashcards();
    }, []);

    const handleNext = () => {
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const hasCards = cards.length > 0;

    return (
        <div className="min-h-screen w-screen bg-[#09090b] flex flex-col relative overflow-hidden selection:bg-white/10 selection:text-white">

            {/* Ambient Vignette - Very subtle, static */}
            <div className="absolute inset-0 pointer-events-none z-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,rgba(0,0,0,0.0)_70%)]" />

            {/* Nav */}
            <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-6 bg-transparent">
                <div className="text-white/40 font-medium text-sm tracking-widest uppercase font-mono">
                    <span className="text-[hsl(var(--accent))]">Unit 1</span> <span className="text-[hsl(var(--accent))/40] mx-2">/</span> Neurology
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate('/')}
                    className="text-white/40 hover:text-white hover:bg-white/5 rounded-full transition-colors duration-300"
                >
                    <X className="size-5" />
                </Button>
            </nav>

            <main className="flex-1 flex flex-col items-center justify-center w-full px-4 md:px-8 relative z-10">

                {/* Card Container */}
                <div className="w-full flex justify-center mb-16 relative perspective-1000">
                    <AnimatePresence mode='wait'>
                        {isLoading ? (
                            <motion.div
                                key="loading"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
                                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-3xl h-96 rounded-2xl border border-white/10 bg-[#18181b] flex items-center justify-center text-white/40">
                                    Loading flashcards...
                                </div>
                            </motion.div>
                        ) : error ? (
                            <motion.div
                                key="error"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
                                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-3xl h-96 rounded-2xl border border-white/10 bg-[#18181b] flex items-center justify-center text-white/40 px-10 text-center">
                                    {error}
                                </div>
                            </motion.div>
                        ) : !hasCards ? (
                            <motion.div
                                key="empty"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
                                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                                className="w-full flex justify-center"
                            >
                                <div className="w-full max-w-3xl h-96 rounded-2xl border border-white/10 bg-[#18181b] flex items-center justify-center text-white/40 px-10 text-center">
                                    No flashcards found for this session.
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={cards[currentIndex]?.id ?? currentIndex}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
                                transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
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

                {/* Controls - Quieter, aligned below */}
                <div className="flex items-center gap-12 z-20">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handlePrev}
                        disabled={!hasCards || currentIndex === 0}
                        className="h-14 w-14 rounded-full bg-[#18181b] 
                                   border border-white/5 border-t-white/10
                                   shadow-[0_4px_12px_rgba(0,0,0,0.5),0_0_10px_-2px_hsl(var(--accent)/0.1),inset_0_1px_0_rgba(255,255,255,0.05)]
                                   hover:scale-105 hover:bg-[#202023] hover:border-[hsl(var(--accent)_/_0.3)] 
                                   hover:shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_20px_-5px_hsl(var(--accent)/0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
                                   active:scale-95 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]
                                   disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100
                                   transition-all duration-200 ease-out group relative z-20"
                    >
                        <ChevronLeft className="size-6 text-white/40 group-hover:text-white transition-colors" />
                    </Button>

                    <div className="text-white/20 text-xs font-mono tracking-widest uppercase">
                        <span className="text-[hsl(var(--accent))]">{hasCards ? currentIndex + 1 : 0}</span> <span className="mx-1 opacity-50">/</span> {cards.length}
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleNext}
                        disabled={!hasCards || currentIndex === cards.length - 1}
                        className="h-14 w-14 rounded-full bg-[#18181b] 
                                   border border-white/5 border-t-white/10
                                   shadow-[0_4px_12px_rgba(0,0,0,0.5),0_0_10px_-2px_hsl(var(--accent)/0.1),inset_0_1px_0_rgba(255,255,255,0.05)]
                                   hover:scale-105 hover:bg-[#202023] hover:border-[hsl(var(--accent)_/_0.3)] 
                                   hover:shadow-[0_8px_24px_rgba(0,0,0,0.6),0_0_20px_-5px_hsl(var(--accent)/0.4),inset_0_1px_0_rgba(255,255,255,0.1)]
                                   active:scale-95 active:shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]
                                   disabled:opacity-20 disabled:cursor-not-allowed disabled:hover:scale-100
                                   transition-all duration-200 ease-out group relative z-20"
                    >
                        <ChevronRight className="size-6 text-white/40 group-hover:text-white transition-colors" />
                    </Button>
                </div>
            </main>
        </div>
    );
}
