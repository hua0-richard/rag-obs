import { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/lib/utils';

interface FlashcardProps {
    front: string;
    back: string;
    className?: string;
}

function normalizeMathBlocks(content: string) {
    if (!content.includes("$") && !content.includes("\\(") && !content.includes("\\[")) {
        return content;
    }
    let normalized = content;
    // Obsidian supports \(..\) and \[..\]; normalize to $/$$ for remark-math.
    normalized = normalized.replace(/\\\(([\s\S]+?)\\\)/g, (_match, inner) => `$${inner}$`);
    normalized = normalized.replace(/\\\[([\s\S]+?)\\\]/g, (_match, inner) => `$$\n${inner}\n$$`);

    // Ensure $$ block delimiters appear on their own line, even when adjacent.
    normalized = normalized.replace(/\$\$/g, "\n$$\n");
    normalized = normalized.replace(/[ \t]+\n\$\$\n/g, "\n$$\n");
    normalized = normalized.replace(/\n\$\$\n[ \t]+/g, "\n$$\n");
    normalized = normalized.replace(/\n{3,}/g, "\n\n");
    return normalized;
}

function MarkdownContent({ content, className }: { content: string; className?: string }) {
    const normalized = normalizeMathBlocks(content);
    return (
        <ReactMarkdown
            remarkPlugins={[remarkMath]}
            rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false }]]}
            className={cn("flashcard-markdown", className)}
        >
            {normalized}
        </ReactMarkdown>
    );
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
                className="relative w-full h-full text-center transform-style-3d will-change-transform"
                initial={false}
                animate={{ rotateX: isFlipped ? 180 : 0 }}
                transition={{
                    duration: 0.2,
                    ease: "linear"
                }}
                onAnimationComplete={() => setIsAnimating(false)}
            >
                {/* Front */}
                <div className="absolute inset-0 w-full h-full backface-hidden">
                    <div className="relative flex flex-col items-center justify-center w-full h-full p-10 bg-[#18181b] 
                                    border border-white/10 rounded-2xl overflow-hidden
                                    shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_-24px_rgba(0,0,0,0.7),0_2px_10px_-6px_rgba(0,0,0,0.5)] 
                                    group-hover:border-[hsl(var(--accent)_/_0.22)] group-hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_26px_60px_-26px_rgba(0,0,0,0.75),0_0_30px_-8px_hsl(var(--accent)_/_0.35)]
                                    transition-all duration-300">

                        <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-2xl bg-gradient-to-b from-[hsl(var(--accent)/0.8)] to-transparent" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.06),transparent_45%)] pointer-events-none" />

                        {/* Top sheen */}
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent opacity-70" />

                        <div className="max-h-48 overflow-y-auto pr-2">
                            <MarkdownContent
                                content={front}
                                className="text-2xl md:text-3xl font-medium text-white/90 select-none tracking-tight"
                            />
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
                    <div className="relative flex flex-col items-center justify-center w-full h-full p-10 bg-[#18181b] 
                                    border border-[hsl(var(--accent)_/_0.22)] rounded-2xl overflow-hidden
                                    shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_-24px_rgba(0,0,0,0.7),0_2px_10px_-6px_rgba(0,0,0,0.5)] 
                                    relative">

                        {/* Soft ambient glow */}
                        <div className="absolute inset-0 bg-[hsl(var(--accent))/5] pointer-events-none" />
                        <div className="absolute left-0 top-0 h-full w-1.5 rounded-l-2xl bg-gradient-to-b from-[hsl(var(--accent)/0.8)] to-transparent" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.05),transparent_45%)] pointer-events-none" />

                        <div className="max-h-48 overflow-y-auto pr-2 relative z-10">
                            <MarkdownContent
                                content={back}
                                className="text-xl md:text-2xl text-white/80 leading-relaxed select-none font-normal"
                            />
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
