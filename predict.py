import argparse
import os

os.environ.setdefault("KERAS_BACKEND", "torch")

import numpy as np
import keras
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_CANDIDATES = [
    os.path.join(HERE, "assets", "model.keras"),
    os.path.join(HERE, "..", "Image_classify_Birds_Model.keras"),
]
LABEL_CANDIDATES = [
    os.path.join(HERE, "assets", "labels.txt"),
    os.path.join(HERE, "labels.txt"),
]


def find(paths):
    return next((p for p in paths if os.path.exists(p)), None)


def load_labels(n):
    path = find(LABEL_CANDIDATES)
    if path is None:
        return None
    with open(path, encoding="utf-8") as f:
        names = [line.strip() for line in f if line.strip()]
    return names if len(names) == n else None


def main():
    ap = argparse.ArgumentParser(description="Classify a bird image.")
    ap.add_argument("image", help="path to a jpg/png image")
    ap.add_argument("-k", "--top", type=int, default=5, help="top-K results")
    args = ap.parse_args()

    model_path = find(MODEL_CANDIDATES)
    if model_path is None:
        raise SystemExit("no .keras model found")
    print(f"model   {os.path.normpath(model_path)}")

    model = keras.models.load_model(model_path)
    height, width = model.input_shape[1:3]

    img = Image.open(args.image).convert("RGB").resize((width, height))
    batch = np.expand_dims(np.asarray(img, dtype="float32"), axis=0)

    logits = model.predict(batch, verbose=0)[0]
    probs = np.exp(logits - logits.max())
    probs /= probs.sum()

    k = min(args.top, probs.size)
    top = np.argsort(probs)[::-1][:k]

    labels = load_labels(probs.size)
    if labels is None:
        print(f"note    no labels.txt found; showing class indices (0-{probs.size - 1})")

    print(f"image   {args.image}")
    for rank, idx in enumerate(top, 1):
        name = labels[idx] if labels else f"class {idx}"
        print(f"{rank:>2}. {name:<40} {probs[idx] * 100:6.2f}%")


if __name__ == "__main__":
    main()
