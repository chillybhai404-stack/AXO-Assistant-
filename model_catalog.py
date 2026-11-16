"""Starter local-model catalogue for AXO Assistant.

The files are hosted by their publishers on Hugging Face. AXO stores only
metadata; model weights are downloaded by the user's browser on demand.
"""

FEATURED_MODELS = [
    {
        "id": "qwen25-05b-instruct",
        "name": "Qwen2.5 0.5B Instruct",
        "parameters": "0.5B",
        "parameter_billions": 0.5,
        "category": "Everyday",
        "description": "Small instruction model for quick, lightweight chat and simple tasks.",
        "repo": "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
        "file": "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "quantization": "Q4_K_M",
        "size_bytes": 491000000,
        "license": "apache-2.0",
        "publisher": "Qwen",
        "device_note": "Best starting point for mobile local inference.",
    },
    {
        "id": "qwen25-15b-instruct",
        "name": "Qwen2.5 1.5B Instruct",
        "parameters": "1.5B",
        "parameter_billions": 1.5,
        "category": "Everyday",
        "description": "A compact general assistant model with a useful balance of size and capability.",
        "repo": "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
        "file": "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        "quantization": "Q4_K_M",
        "size_bytes": 1120000000,
        "license": "apache-2.0",
        "publisher": "Qwen",
        "device_note": "A larger download and memory footprint than the 0.5B model.",
    },
    {
        "id": "qwen25-coder-3b",
        "name": "Qwen2.5 Coder 3B Instruct",
        "parameters": "3B",
        "parameter_billions": 3,
        "category": "Coding",
        "description": "An instruction-tuned coding model for code explanation, generation and debugging.",
        "repo": "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF",
        "file": "qwen2.5-coder-3b-instruct-q3_k_m.gguf",
        "quantization": "Q3_K_M",
        "size_bytes": 1720000000,
        "license": "qwen-research (check publisher terms)",
        "publisher": "Qwen",
        "device_note": "Near the browser runtime's single-file size ceiling; check free storage and memory first. Review the model licence before using it.",
    },
]

MAX_DISCOVERY_BILLIONS = 14.0
