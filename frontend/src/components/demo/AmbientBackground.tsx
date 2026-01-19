import { motion } from "framer-motion";

export function AmbientBackground() {
    return (
        <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
            {/* Subtle Gradient Blob 1 */}
            <motion.div
                className="absolute top-[-10%] left-[-10%] w-[50vw] h-[50vw] bg-[hsl(var(--accent))/15] rounded-full blur-[120px] opacity-40"
                animate={{
                    x: [0, 50, 0],
                    y: [0, 30, 0],
                    scale: [1, 1.1, 1],
                }}
                transition={{
                    duration: 20,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />

            {/* Subtle Gradient Blob 2 */}
            <motion.div
                className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] bg-[hsl(280,80%,20%)] rounded-full blur-[140px] opacity-30"
                animate={{
                    x: [0, -40, 0],
                    y: [0, -60, 0],
                    scale: [1, 1.05, 1],
                }}
                transition={{
                    duration: 25,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 2,
                }}
            />

            {/* Light Streak */}
            <motion.div
                className="absolute top-[20%] left-[-20%] w-[140vw] h-[1px] bg-gradient-to-r from-transparent via-white/10 to-transparent rotate-12"
                animate={{
                    y: [0, 20, 0],
                    opacity: [0.1, 0.3, 0.1],
                }}
                transition={{
                    duration: 15,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
            />
        </div>
    );
}
