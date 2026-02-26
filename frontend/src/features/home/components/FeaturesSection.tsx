import { motion } from "framer-motion";
import { Brain, Database, FileText, Repeat, Search, Sparkles } from "lucide-react";

const features = [
    {
        icon: Brain,
        title: "Context-Aware RAG",
        description: "Our AI understands the semantic relationships in your notes to generate relevant, high-quality questions."
    },
    {
        icon: FileText,
        title: "Markdown Native",
        description: "Works directly with your local Obsidian vault. No export required. Your data stays yours."
    },
    {
        icon: Repeat,
        title: "Spaced Repetition",
        description: "Built-in review scheduler based on the SM-2 algorithm to ensure long-term retention."
    }
];

export function FeaturesSection() {
    return (
        <section className="relative z-10 max-w-7xl mx-auto px-4 py-24">
            <div className="text-center mb-16">
                <span className="text-[hsl(var(--accent))] text-sm font-bold tracking-widest uppercase mb-2 block">
                    Powerful Features
                </span>
                <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
                    Study Smarter, Not Harder
                </h2>
                <p className="text-white/60 max-w-2xl mx-auto text-lg">
                    Transform your passive note-taking into an active learning engine.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {features.map((feature, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: index * 0.2, duration: 0.5 }}
                        className="p-1 rounded-2xl bg-gradient-to-br from-white/10 to-transparent hover:from-[hsl(var(--accent))/30] transition-colors duration-500 group"
                    >
                        <div className="bg-[#18181b] rounded-xl p-8 h-full relative overflow-hidden">
                            {/* Hover Glow */}
                            <div className="absolute top-0 right-0 w-32 h-32 bg-[hsl(var(--accent))/10] blur-[50px] rounded-full group-hover:bg-[hsl(var(--accent))/20] transition-all duration-500" />

                            <div className="w-12 h-12 rounded-lg bg-[hsl(var(--accent))/10] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                                <feature.icon className="size-6 text-[hsl(var(--accent))]" />
                            </div>

                            <h3 className="text-xl font-semibold text-white mb-3">
                                {feature.title}
                            </h3>
                            <p className="text-white/60 leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Additional "How it works" or Tech Specs could go here */}
            <div className="mt-24 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="glass-panel p-8 md:p-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-20">
                        <Database className="size-48 text-white" />
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-2xl font-bold text-white mb-4">Local Vector Database</h3>
                        <p className="text-white/60 mb-6">
                            We embed your notes locally using high-performance models.
                            Your knowledge graph is preserved and privacy is guaranteed.
                        </p>
                        <div className="flex items-center gap-2 text-sm text-[hsl(var(--accent))]">
                            <Search className="size-4" />
                            <span>Semantic Search Enabled</span>
                        </div>
                    </div>
                </div>

                <div className="glass-panel p-8 md:p-12 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-20">
                        <Sparkles className="size-48 text-[hsl(var(--accent))]" />
                    </div>
                    <div className="relative z-10">
                        <h3 className="text-2xl font-bold text-white mb-4">Smart Generation</h3>
                        <p className="text-white/60 mb-6">
                            Unlike generic flashcards, ours connect explicitly to your source material.
                            Every card links back to the original paragraph in your note.
                        </p>
                        <button className="text-white text-sm font-medium hover:text-[hsl(var(--accent))] transition-colors">
                            View Example &rarr;
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
