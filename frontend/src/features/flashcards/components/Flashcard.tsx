import { useState, useEffect } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { cn } from '@/shared/utils/classNames';

interface FlashcardProps {
    front: string;
    back: string;
    className?: string;
}

function normalizeMathInText(text: string) {
    if (!text.includes("$") && !text.includes("\\(") && !text.includes("\\[")) {
        return text;
    }
    let normalized = text;
    // Obsidian supports \(..\) and \[..\]; normalize to $/$$ for remark-math.
    normalized = normalized.replace(/\\\(([\s\S]+?)\\\)/g, (_match, inner) => `$${inner}$`);
    normalized = normalized.replace(/\\\[([\s\S]+?)\\\]/g, (_match, inner) => `$$\n${inner}\n$$`);

    // Ensure $$ block delimiters appear on their own line, even when adjacent.
    normalized = normalized.replace(/\$\$([\s\S]+?)\$\$/g, (_match, inner) => `\n$$\n${inner}\n$$\n`);
    normalized = normalized.replace(/[ \t]+\n\$\$\n/g, "\n$$\n");
    normalized = normalized.replace(/\n\$\$\n[ \t]+/g, "\n$$\n");
    normalized = normalized.replace(/\n{3,}/g, "\n\n");
    return normalized;
}

function normalizeMathBlocks(content: string) {
    if (!content.includes("$") && !content.includes("\\(") && !content.includes("\\[")) {
        return content;
    }

    const fenceRegex = /```[\s\S]*?```/g;
    let result = "";
    let lastFenceIndex = 0;
    let fenceMatch: RegExpExecArray | null;

    const applyInlineNormalization = (segment: string) => {
        const inlineCodeRegex = /`[^`]*`/g;
        let out = "";
        let lastIndex = 0;
        let inlineMatch: RegExpExecArray | null;
        while ((inlineMatch = inlineCodeRegex.exec(segment)) !== null) {
            out += normalizeMathInText(segment.slice(lastIndex, inlineMatch.index));
            out += inlineMatch[0];
            lastIndex = inlineMatch.index + inlineMatch[0].length;
        }
        out += normalizeMathInText(segment.slice(lastIndex));
        return out;
    };

    while ((fenceMatch = fenceRegex.exec(content)) !== null) {
        result += applyInlineNormalization(content.slice(lastFenceIndex, fenceMatch.index));
        result += fenceMatch[0];
        lastFenceIndex = fenceMatch.index + fenceMatch[0].length;
    }
    result += applyInlineNormalization(content.slice(lastFenceIndex));
    return result;
}

function MarkdownContent({ content, className }: { content: string; className?: string }) {
    const normalized = normalizeMathBlocks(content);
    return (
        <ReactMarkdown
            remarkPlugins={[[remarkMath, { singleDollarTextMath: true }]]}
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

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
                e.preventDefault();
                handleFlip();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isAnimating, isFlipped]);

    return (
        <motion.div
            className={cn("perspective-1000 w-full max-w-3xl cursor-pointer group relative z-10", className)}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleFlip}
            style={{
                rotateX,
                rotateY,
                transformStyle: "preserve-3d",
                height: "clamp(260px, 42vh, 384px)",
            }}
        >
            <motion.div
                className="relative w-full h-full text-center transform-style-3d will-change-transform"
                initial={false}
                animate={{ rotateX: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.2, ease: "linear" }}
                onAnimationComplete={() => setIsAnimating(false)}
            >
                {/* Front */}
                <div className="absolute inset-0 w-full h-full backface-hidden">
                    <div className="relative flex flex-col items-center justify-center w-full h-full px-6 py-8 sm:p-10 bg-[#18181b]
                                    border border-white/10 rounded-2xl overflow-hidden
                                    shadow-[0_12px_32px_-16px_rgba(0,0,0,0.65)]
                                    group-hover:border-white/15
                                    transition-colors duration-200">

                        <div className="w-full max-h-[55%] overflow-y-auto px-1 flex items-center justify-center">
                            <MarkdownContent
                                content={front}
                                className="text-xl sm:text-2xl md:text-3xl font-medium text-white/90 select-none tracking-tight text-center"
                            />
                        </div>

                        <div className="absolute bottom-4 sm:bottom-6 text-white/20 text-[10px] font-mono uppercase tracking-[0.16em] group-hover:text-white/35 transition-colors">
                            Tap to reveal
                        </div>
                    </div>
                </div>

                {/* Back */}
                <div
                    className="absolute inset-0 w-full h-full backface-hidden"
                    style={{ transform: "rotateX(180deg)" }}
                >
                    <div className="relative flex flex-col items-center justify-center w-full h-full px-6 py-8 sm:p-10 bg-[#18181b]
                                    border border-[hsl(var(--accent)_/_0.2)] rounded-2xl overflow-hidden
                                    shadow-[0_12px_32px_-16px_rgba(0,0,0,0.65)]">

                        <div className="w-full max-h-[55%] overflow-y-auto px-1 flex items-center justify-center relative z-10">
                            <MarkdownContent
                                content={back}
                                className="text-base sm:text-xl md:text-2xl text-white/80 leading-relaxed select-none font-normal text-center"
                            />
                        </div>

                        <div className="absolute bottom-4 sm:bottom-6 text-white/30 text-[10px] font-mono uppercase tracking-[0.16em]">
                            Answer
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
}
