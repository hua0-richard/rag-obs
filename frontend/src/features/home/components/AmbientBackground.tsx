import { motion } from "framer-motion";

export function AmbientBackground() {
    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
            <motion.div
                className="absolute top-[-15%] left-[-10%] w-[55vw] h-[55vw] bg-[hsl(var(--accent))/12] rounded-full blur-[140px] opacity-35"
                animate={{
                    x: [0, 30, 0],
                    y: [0, 20, 0],
                }}
                transition={{
                    duration: 24,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />
        </div>
    );
}
