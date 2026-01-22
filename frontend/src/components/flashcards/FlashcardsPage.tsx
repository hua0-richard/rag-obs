import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Flashcard } from './Flashcard';
import { useNavigate } from 'react-router-dom';

const MOCK_CARDS = [
    {
        id: 1,
        front: "What is the primary function of the hippocampus?",
        back: "The hippocampus is responsible for long-term memory formation, spatial navigation, and memory consolidation from short-term to long-term memory."
    },
    {
        id: 2,
        front: "Explain the difference between supervised and unsupervised learning.",
        back: "Supervised learning uses labeled datasets to train algorithms to classify data or predict outcomes. Unsupervised learning analyzes and clusters unlabeled datasets to discover hidden patterns."
    },
    {
        id: 3,
        front: "What is a closure in JavaScript?",
        back: "A closure is a function combined with its lexical environment. It allows an inner function to access variables from its outer function's scope even after the outer function has finished executing."
    },
    {
        id: 4,
        front: "Long answer test",
        back: "This is a deliberately long response to validate scrolling inside the flashcard without the layout jumping. It should remain readable, keep the card height stable, and allow a smooth, in-card scroll when content exceeds the visible area. Repeat: this is a deliberately long response to validate scrolling inside the flashcard without the layout jumping. It should remain readable, keep the card height stable, and allow a smooth, in-card scroll when content exceeds the visible area."
    }
];

export function FlashcardsPage() {
    const navigate = useNavigate();
    const [currentIndex, setCurrentIndex] = useState(0);

    const handleNext = () => {
        if (currentIndex < MOCK_CARDS.length - 1) {
            setCurrentIndex(prev => prev + 1);
        }
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

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
                        <motion.div
                            key={currentIndex}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6, filter: "blur(6px)" }}
                            transition={{ duration: 0.45, ease: [0.23, 1, 0.32, 1] }}
                            className="w-full flex justify-center"
                        >
                            <Flashcard
                                front={MOCK_CARDS[currentIndex].front}
                                back={MOCK_CARDS[currentIndex].back}
                            />
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Controls - Quieter, aligned below */}
                <div className="flex items-center gap-12 z-20">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handlePrev}
                        disabled={currentIndex === 0}
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
                        <span className="text-[hsl(var(--accent))]">{currentIndex + 1}</span> <span className="mx-1 opacity-50">/</span> {MOCK_CARDS.length}
                    </div>

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleNext}
                        disabled={currentIndex === MOCK_CARDS.length - 1}
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
