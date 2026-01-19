import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, Star } from "lucide-react";

export function HeroSection() {
    return (
        <section className="relative z-10 flex flex-col items-center justify-center min-h-[60vh] px-4 pt-32 pb-16 text-center">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="glass-panel inline-flex items-center gap-2 px-3 py-1 rounded-full mb-8"
            >
                <Star className="size-4 text-[hsl(var(--accent))] fill-[hsl(var(--accent))]" />
                <span className="text-sm font-medium text-white/80">
                    v2.0 Glass System
                </span>
            </motion.div>

            <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 max-w-4xl"
            >
                Precision in <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/50">
                    Glass & Light
                </span>
            </motion.h1>

            <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                className="text-lg md:text-xl text-white/60 max-w-2xl mb-10 leading-relaxed"
            >
                A minimal, aggressive glassmorphism design system for modern developer
                tools. Built for clarity, depth, and precision.
            </motion.p>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
                className="flex flex-wrap items-center justify-center gap-4"
            >
                <Button size="lg" className="group">
                    Explore Components
                    <ArrowRight className="size-4 ml-2 transition-transform group-hover:translate-x-1" />
                </Button>
                <Button variant="secondary" size="lg">
                    Read Documentation
                </Button>
            </motion.div>

            {/* Hero Glass Card Showcase */}
            <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut", delay: 0.4 }}
                className="mt-20 w-full max-w-5xl"
            >
                <div className="glass-panel p-8 md:p-12 border-white/15">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="space-y-2 text-left">
                            <h3 className="text-2xl font-semibold text-white">
                                System Status
                            </h3>
                            <p className="text-white/60">
                                All systems operational. Glass refraction at optimal levels.
                            </p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 border border-white/10 w-32">
                                <span className="text-3xl font-bold text-white">98%</span>
                                <span className="text-xs text-white/40 uppercase tracking-widest mt-1">Uptime</span>
                            </div>
                            <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-white/5 border border-white/10 w-32">
                                <span className="text-3xl font-bold text-[hsl(var(--accent))]">12ms</span>
                                <span className="text-xs text-white/40 uppercase tracking-widest mt-1">Latency</span>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </section>
    );
}
