const MODEL_PRETTY_NAMES: Record<string, string> = {
    "openrouter/auto": "OpenRouter (auto)",
    "openrouter/free": "OpenRouter (auto)",
    "deepseek/deepseek-chat-v3-0324": "DeepSeek V3",
};

export const formatModelLabel = (model: string): string =>
    MODEL_PRETTY_NAMES[model] ?? model.replace(/:free$/, "").split("/").pop() ?? model;
