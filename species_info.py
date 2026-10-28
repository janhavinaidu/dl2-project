import json
import os
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_FILE = os.path.join(HERE, "species_cache.json")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "openai/gpt-oss-20b"


class SpeciesInfoError(Exception):
    pass


def parse_profile(content):
    text = content.strip()
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    try:
        data = json.loads(text)
    except ValueError as exc:
        raise SpeciesInfoError("Groq returned an unreadable profile") from exc

    summary = str(data.get("summary", "")).strip()
    fun_fact = str(data.get("fun_fact", "")).strip()
    if not summary or not fun_fact:
        raise SpeciesInfoError("Groq returned an incomplete species profile")
    return {"summary": summary, "fun_fact": fun_fact}


def fetch_from_groq(name, api_key, model=GROQ_MODEL, timeout=20):
    prompt = (
        f"You are a friendly ornithologist. The bird species is '{name}'.\n"
        "Reply with ONLY a JSON object with keys \"summary\" and \"fun_fact\".\n"
        "\"summary\" must be 2-3 sentences of general information about this bird "
        "(habitat, diet, or behavior).\n"
        "\"fun_fact\" must be one surprising, memorable fact in one sentence.\n"
        "Use plain text, no markdown."
    )
    body = json.dumps(
        {
            "model": model,
            "temperature": 0.4,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "user", "content": prompt}],
        }
    ).encode("utf-8")
    request = urllib.request.Request(
        GROQ_URL,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "BirdSpotter/1.0",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        message = f"Groq request failed with status {exc.code}"
        try:
            error = json.loads(exc.read().decode("utf-8")).get("error", {})
            if error.get("message"):
                message = f"{message}: {error['message']}"
        except (ValueError, OSError):
            pass
        raise SpeciesInfoError(message) from exc
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
        raise SpeciesInfoError("Could not reach Groq") from exc

    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise SpeciesInfoError("Groq returned an unexpected response") from exc
    return parse_profile(content)


def read_cache(path):
    if not os.path.exists(path):
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def write_cache(path, cache):
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(cache, f, indent=2)
        os.replace(tmp, path)
    except OSError:
        pass


def get_species_info(name, *, api_key=None, cache_path=CACHE_FILE, fetcher=None):
    name = " ".join(name.split())
    if not name:
        raise SpeciesInfoError("A species name is required")
    key = name.upper()

    cache = read_cache(cache_path)
    if key in cache:
        return {**cache[key], "cached": True}

    api_key = api_key or os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise SpeciesInfoError("GROQ_API_KEY is not set on the server")

    fetcher = fetcher or fetch_from_groq
    info = fetcher(name, api_key)
    cache[key] = info
    write_cache(cache_path, cache)
    return {**info, "cached": False}
