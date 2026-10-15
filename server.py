import io
import json
import os
import threading
import uuid
from datetime import datetime, timezone

os.environ.setdefault("KERAS_BACKEND", "torch")

import numpy as np
import keras
from PIL import Image
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_CANDIDATES = [
    os.path.join(HERE, "assets", "model.keras"),
    os.path.join(HERE, "..", "Image_classify_Birds_Model.keras"),
]
LABEL_CANDIDATES = [
    os.path.join(HERE, "assets", "labels.txt"),
    os.path.join(HERE, "labels.txt"),
]
DATA_FILE = os.path.join(HERE, "sightings.json")


def find(paths):
    return next((p for p in paths if os.path.exists(p)), None)


def load_labels(n):
    path = find(LABEL_CANDIDATES)
    if path is None:
        return [f"class {i}" for i in range(n)]
    with open(path, encoding="utf-8") as f:
        names = [line.strip() for line in f if line.strip()]
    if len(names) != n:
        return [f"class {i}" for i in range(n)]
    return names


print("loading model...", flush=True)
model = keras.models.load_model(find(MODEL_CANDIDATES))
labels = load_labels(model.output_shape[-1])
height, width = model.input_shape[1:3]
print(f"ready: {len(labels)} classes, input {width}x{height}", flush=True)


class SightingIn(BaseModel):
    label: str = Field(min_length=1)
    probability: float = 0.0
    latitude: float
    longitude: float


class Sighting(SightingIn):
    id: str
    created_at: str


def load_sightings():
    if not os.path.exists(DATA_FILE):
        return []
    try:
        with open(DATA_FILE, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def persist():
    tmp = DATA_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(SIGHTINGS, f, indent=2)
    os.replace(tmp, DATA_FILE)


SIGHTINGS = load_sightings()
_lock = threading.Lock()
print(f"loaded {len(SIGHTINGS)} sightings", flush=True)

app = FastAPI(title="BirdSpotter")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "backend": keras.backend.backend(),
        "classes": len(labels),
        "input": [width, height],
        "sightings": len(SIGHTINGS),
    }


@app.get("/labels")
def list_labels():
    return {"labels": labels}


@app.post("/predict")
async def predict(file: UploadFile = File(...), top_k: int = 5):
    raw = await file.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB").resize((width, height))
    batch = np.expand_dims(np.asarray(img, dtype="float32"), axis=0)

    logits = model.predict(batch, verbose=0)[0]
    probs = np.exp(logits - logits.max())
    probs = probs / probs.sum()

    k = max(1, min(top_k, probs.size))
    order = np.argsort(probs)[::-1][:k]
    return {
        "predictions": [
            {"label": labels[i], "probability": float(probs[i])} for i in order
        ]
    }


@app.post("/sightings")
def add_sighting(item: SightingIn):
    record = Sighting(
        **item.model_dump(),
        id=uuid.uuid4().hex,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    with _lock:
        SIGHTINGS.append(record.model_dump())
        persist()
    return record


def filtered(label):
    return [s for s in SIGHTINGS if not label or s.get("label") == label]


@app.get("/sightings")
def list_sightings(label: str | None = None):
    return {"sightings": filtered(label)}


@app.delete("/sightings/{sighting_id}")
def delete_sighting(sighting_id: str):
    global SIGHTINGS
    with _lock:
        remaining = [s for s in SIGHTINGS if s["id"] != sighting_id]
        removed = len(remaining) != len(SIGHTINGS)
        if removed:
            SIGHTINGS = remaining
            persist()
    return {"removed": removed, "sightings": len(SIGHTINGS)}


@app.get("/hotspots")
def hotspots(
    label: str | None = None,
    cell: float = 0.0009,
):
    points = filtered(label)
    if not points:
        return {"hotspots": [], "center": None, "max_count": 0}

    cell = max(cell, 1e-5)
    cells = {}
    for s in points:
        key = (round(s["latitude"] / cell), round(s["longitude"] / cell))
        c = cells.setdefault(
            key,
            {"count": 0, "prob": 0.0, "lat": 0.0, "lng": 0.0, "labels": {}},
        )
        c["count"] += 1
        c["prob"] += s["probability"]
        c["lat"] += s["latitude"]
        c["lng"] += s["longitude"]
        c["labels"][s["label"]] = c["labels"].get(s["label"], 0) + 1

    max_count = max(c["count"] for c in cells.values())
    result = []
    for c in cells.values():
        score = round(100 * c["count"] / max_count)
        level = "high" if score >= 66 else "medium" if score >= 33 else "low"
        top = sorted(c["labels"].items(), key=lambda kv: -kv[1])[:3]
        result.append(
            {
                "latitude": c["lat"] / c["count"],
                "longitude": c["lng"] / c["count"],
                "count": c["count"],
                "score": score,
                "level": level,
                "avg_probability": c["prob"] / c["count"],
                "top_labels": [{"label": k, "count": v} for k, v in top],
            }
        )
    result.sort(key=lambda h: (-h["count"], -h["score"]))

    return {
        "hotspots": result,
        "center": {
            "latitude": sum(s["latitude"] for s in points) / len(points),
            "longitude": sum(s["longitude"] for s in points) / len(points),
        },
        "max_count": max_count,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
