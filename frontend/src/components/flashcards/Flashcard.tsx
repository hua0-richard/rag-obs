import { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import { cn } from '@/lib/utils';

interface FlashcardProps {
    front: string;
    back: string;
    className?: string;
}

export function Flashcard({ front, back, className }: FlashcardProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);

    // Tilt State
    const x = useMotionValue(0);
    const y = useMotionValue(0);
    const rotateX = useTransform(y, [-0.5, 0.5], [2, -2]); // Very subtle tilt
    const rotateY = useTransform(x, [-0.5, 0.5], [-2, 2]);

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const xPct = (mouseX / width) - 0.5;
        const yPct = (mouseY / height) - 0.5;

        x.set(xPct);
        y.set(yPct);
    };

    const handleMouseLeave = () => {
        x.set(0);
        y.set(0);
    };

    const handleFlip = () => {
        if (!isAnimating) {
            setIsFlipped(!isFlipped);
            setIsAnimating(true);
        }
    };

    return (
        <motion.div
            className={cn("perspective-1000 w-full max-w-3xl h-96 cursor-pointer group relative z-10", className)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleFlip}
            style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d"
            }}
        >
            <motion.div
                className="relative w-full h-full text-center transition-all duration-500 transform-style-3d will-change-transform"
                initial={false}
                animate={{ rotateX: isFlipped ? 180 : 0 }}
                transition={{
                    duration: 0.5,
                    ease: [0.23, 1, 0.32, 1] // Quartic ease out
                }}
                onAnimationComplete={() => setIsAnimating(false)}
            >
                {/* Front */}
                <div className="absolute inset-0 w-full h-full backface-hidden">
                    <div className="flex flex-col items-center justify-center w-full h-full p-10 bg-[#18181b] 
                                    border border-white/3 rounded-2xl 
                                    shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-2px_6px_rgba(0,0,0,0.35),0_18px_40px_-24px_rgba(0,0,0,0.7),0_2px_10px_-6px_rgba(0,0,0,0.5)] 
                                    group-hover:border-[hsl(var(--accent)_/_0.2)] group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-2px_6px_rgba(0,0,0,0.3),0_26px_60px_-26px_rgba(0,0,0,0.75),0_0_30px_-8px_hsl(var(--accent)_/_0.35)]
                                    transition-all duration-300">

                        {/* Top sheen + bottom falloff for depth */}
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-70" />
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/28 via-black/10 to-transparent pointer-events-none" />

                        <div className="max-h-48 overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,black_85%,transparent)]">
                            <p className="text-2xl md:text-3xl font-medium text-white/90 select-none tracking-tight">
                                {front}
                            </p>
                        </div>

                        {/* Minimal hint */}
                        <div className="absolute bottom-6 text-white/10 text-xs font-mono uppercase tracking-[0.2em] group-hover:text-[hsl(var(--accent))/60] transition-colors">
                            Click to reveal
                        </div>
                    </div>
                </div>

                {/* Back */}
                <div
                    className="absolute inset-0 w-full h-full backface-hidden"
                    style={{ transform: "rotateX(180deg)" }}
                >
                    <div className="flex flex-col items-center justify-center w-full h-full p-10 bg-[#18181b] 
                                    border border-[hsl(var(--accent)_/_0.18)] rounded-2xl 
                                    shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-2px_6px_rgba(0,0,0,0.35),0_18px_40px_-24px_rgba(0,0,0,0.7),0_2px_10px_-6px_rgba(0,0,0,0.5)] 
                                    relative overflow-hidden">

                        {/* Soft ambient glow */}
                        <div className="absolute inset-0 bg-[hsl(var(--accent))/5] pointer-events-none" />

                        <div className="max-h-48 overflow-y-auto pr-2 [mask-image:linear-gradient(to_bottom,black_85%,transparent)] relative z-10">
                            <p className="text-xl md:text-2xl text-white/80 leading-relaxed select-none font-normal">
                                {back}
                            </p>
                        </div>

                        <div className="absolute bottom-6 text-[hsl(var(--accent))/60] text-xs font-mono uppercase tracking-[0.2em]">
                            Answer
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div >
    );
}
