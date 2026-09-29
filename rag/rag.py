from pathlib import Path
import pickle

ROOT = Path(__file__).resolve().parents[1]

INDEX = ROOT / "index" / "knowledge.index"
DOCS = ROOT / "index" / "documents.pkl"

_m = None
_i = None
_d = None

SIMILARITY_THRESHOLD = 0.60


def retrieve(query, top_k=3):

    global _m, _i, _d

    import faiss
    from sentence_transformers import SentenceTransformer

    if _m is None:

        _m = SentenceTransformer(
            "all-MiniLM-L6-v2"
        )

        _i = faiss.read_index(
            str(INDEX)
        )

        _d = pickle.load(
            open(DOCS, "rb")
        )

    emb = _m.encode(
        [query],
        normalize_embeddings=True
    )

    scores, ids = _i.search(
        emb,
        top_k
    )

    out = []

    for score, idx in zip(
        scores[0],
        ids[0]
    ):

        if idx >= 0 and float(score) >= SIMILARITY_THRESHOLD:

            doc = _d[int(idx)].copy()

            doc["score"] = float(score)

            out.append(doc)

    return out