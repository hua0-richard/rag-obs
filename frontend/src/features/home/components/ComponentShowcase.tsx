import { motion } from "framer-motion";
import { ButtonsCard } from "./showcase/ButtonsCard";
import { FormsCard } from "./showcase/FormsCard";
import { TabsCard } from "./showcase/TabsCard";
import { OverlaysCard } from "./showcase/OverlaysCard";
import { DataTableCard } from "./showcase/DataTableCard";

export function ComponentShowcase() {
    const container = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const item = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    return (
        <section className="relative z-10 max-w-7xl mx-auto px-4 py-20">
            <div className="mb-12">
                <h2 className="text-3xl font-bold text-white mb-4">Interface Components</h2>
                <p className="text-white/60 max-w-2xl">
                    A comprehensive suite of glass-styled components designed for consistent aesthetics and high usability.
                </p>
            </div>

            <motion.div
                variants={container}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-100px" }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
            >
                {/* Buttons Card */}
                <motion.div variants={item} className="col-span-1">
                    <ButtonsCard />
                </motion.div>

                {/* Inputs & Forms */}
                <motion.div variants={item} className="col-span-1 md:col-span-2">
                    <FormsCard />
                </motion.div>

                {/* Tabs & Navigation */}
                <motion.div variants={item} className="col-span-1 md:col-span-2">
                    <TabsCard />
                </motion.div>

                {/* Overlays & Status */}
                <motion.div variants={item} className="col-span-1">
                    <OverlaysCard />
                </motion.div>

                {/* Data Table */}
                <motion.div variants={item} className="col-span-1 md:col-span-3">
                    <DataTableCard />
                </motion.div>

            </motion.div>
        </section>
    );
}

