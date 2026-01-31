import ollama
import tiktoken
ENV = os.getenv("ENV")

def meter(input, session, model) -> None:
    encoding = tiktoken.get_encoding(model)
    # store token count
    if ENV == "ENV":
        return chatLocal(input)
    elif ENV == "PROD":
        return chatProd(input)
    None


def chatLocal(input: str) -> None:
    response = ollama.chat(model="llama3.1", messages=[{"role": "user", "content": input}])
    return

def chatProd() -> None:
    return

