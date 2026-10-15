import os

os.environ.setdefault("KERAS_BACKEND", "torch")

import keras

MODEL_CANDIDATES = [
    os.path.join(os.path.dirname(__file__), "assets", "model.keras"),
    os.path.join(os.path.dirname(__file__), "..", "Image_classify_Birds_Model.keras"),
]


def main():
    print("keras", keras.__version__)
    print("backend", keras.backend.backend())

    model_path = next((p for p in MODEL_CANDIDATES if os.path.exists(p)), None)
    if model_path is None:
        raise SystemExit("no .keras model found")

    print("model", os.path.normpath(model_path))
    model = keras.models.load_model(model_path)

    print("input_shape", model.input_shape)
    print("output_shape", model.output_shape)
    print("params", model.count_params())
    print("classes", getattr(model, "class_names", None))
    print("OK")


if __name__ == "__main__":
    main()
