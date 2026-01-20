import { motion } from "framer-motion";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Sparkles, UploadCloud } from "lucide-react";

const LogoStreaks = () => {
    return (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] pointer-events-none z-0">
            {/* Radial gradient backing for depth */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[hsl(var(--accent))/5] to-transparent opacity-30 blur-3xl rounded-full" />

            {/* Rotating streaks */}
            {[...Array(6)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute top-1/2 left-1/2 w-[400px] h-[1px] origin-left bg-gradient-to-r from-transparent via-[hsl(var(--accent))/40] to-transparent"
                    initial={{ rotate: i * 60, opacity: 0, scale: 0.5 }}
                    animate={{
                        rotate: i * 60 + 360,
                        opacity: [0, 0.5, 0],
                        scale: [0.8, 1.2, 0.8]
                    }}
                    transition={{
                        duration: 8 + i,
                        repeat: Infinity,
                        ease: "linear",
                        delay: i * 0.5
                    }}
                />
            ))}

            {/* Outward particles/glow */}
            {[...Array(8)].map((_, i) => (
                <motion.div
                    key={`p-${i}`}
                    className="absolute top-1/2 left-1/2 w-1 h-1 rounded-full bg-[hsl(var(--accent))]"
                    initial={{ x: 0, y: 0, opacity: 0 }}
                    animate={{
                        x: Math.cos(i * 45) * 300,
                        y: Math.sin(i * 45) * 300,
                        opacity: [0, 1, 0]
                    }}
                    transition={{
                        duration: 4,
                        repeat: Infinity,
                        ease: "easeOut",
                        delay: i * 0.2
                    }}
                />
            ))}
        </div>
    );
};

export function HeroSection() {
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            console.log("Files selected:", files);
            // Handle file upload logic here likely passing it up to a parent or context
        }
    };

    return (
        <section className="relative z-10 flex flex-col items-center justify-center min-h-screen min-w-screen px-4 pt-20 pb-16 text-center bg-[#09090b] overflow-hidden">

            {/* Central Focal Point */}
            <div className="relative z-10 mb-12 group perspective-1000">
                <LogoStreaks />
                <motion.div
                    initial={{ scale: 0.8, opacity: 0, rotateX: 20 }}
                    animate={{ scale: 1, opacity: 1, rotateX: 0 }}
                    transition={{ duration: 1.2, type: "spring", bounce: 0.3 }}
                    className="relative z-10 p-8 rounded-[3rem]"
                >
                    <div className="absolute inset-0 bg-[hsl(var(--accent))/10] blur-3xl rounded-full opacity-60 group-hover:opacity-80 transition-opacity duration-1000" />
                    <img
                        src="/obsidian-logo.png"
                        alt="Obsidian Logo"
                        className="w-48 h-48 md:w-64 md:h-64 object-contain drop-shadow-2xl relative z-20"
                        style={{ filter: "drop-shadow(0 0 40px rgba(139, 92, 246, 0.3))" }}
                    />
                </motion.div>
            </div>

            {/* CTA Section */}
            <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="relative z-20 space-y-8 max-w-2xl mx-auto"
            >
                <div className="space-y-4">
                    <Button
                        size="lg"
                        className="h-14 px-8 text-lg rounded-full bg-white/5 hover:bg-white/10 border border-white/10 backdrop-blur-md transition-all duration-300 hover:scale-105 group"
                        onClick={handleUploadClick}
                    >
                        <UploadCloud className="mr-2 size-5 text-[hsl(var(--accent))]" />
                        <span className="text-white font-medium">Upload your .md notes</span>
                    </Button>
                    <p className="text-white/40 text-sm md:text-base font-light tracking-wide max-w-sm mx-auto">
                        Turn your Markdown notes into a searchable,<br /> intelligent knowledge base.
                    </p>
                </div>

                {/* Hidden File Input */}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".md,.markdown,.txt"
                    multiple
                />
            </motion.div>

            {/* Minimal Demo */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 0.8 }}
                className="mt-24 relative z-10 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12 opacity-80 hover:opacity-100 transition-opacity duration-500"
            >
                {/* Input */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-16 h-20 bg-[#18181b] border border-white/10 rounded-lg flex items-center justify-center shadow-lg transform rotate-[-6deg]">
                        <FileText className="text-white/20 size-8" />
                    </div>
                    <span className="text-xs text-white/30 font-mono">notes.md</span>
                </div>

                {/* Flow */}
                <div className="w-px h-12 md:w-24 md:h-px bg-gradient-to-b md:bg-gradient-to-r from-transparent via-white/20 to-transparent relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-[hsl(var(--accent))] rounded-full shadow-[0_0_10px_hsl(var(--accent))]" />
                </div>

                {/* Output */}
                <div className="flex flex-col items-center gap-3">
                    <div className="w-64 h-24 bg-[#18181b] border border-white/10 rounded-xl p-4 flex flex-col justify-center shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-[hsl(var(--accent))]" />
                        <div className="flex items-center gap-2 mb-2">
                            <Sparkles className="size-3 text-[hsl(var(--accent))]" />
                            <span className="text-[10px] uppercase tracking-widest text-white/40">Recall Generated</span>
                        </div>
                        <p className="text-sm text-white/80 font-medium">What is the primary function of the hippocampus?</p>
                    </div>
                    <span className="text-xs text-white/30 font-mono">flashcard</span>
                </div>
            </motion.div>
        </section>
    );
}
