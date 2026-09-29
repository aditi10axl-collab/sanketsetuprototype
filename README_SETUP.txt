SANKET SETU — PREMIUM FINAL

1. Put hand_landmarker.task in models/.
2. Copy your existing RAG knowledge.index and documents.pkl into index/.
3. Copy .env.example to .env and add GROQ_API_KEY for grounded LLM answers.
4. pip install -r requirements.txt
5. Run: python -m uvicorn backend.sanket_setu_backend:app --host 127.0.0.1 --port 8000 --reload
6. Frontend: python -m http.server 5173 --directory frontend
7. Open http://127.0.0.1:5173

Teach My Signs: capture 32-frame samples. Training requires at least 2 labels and 2 samples per label. Training creates models/custom.pkl.

Flow: Welcome -> Input Hub -> Sign/Voice/Text/Document -> /api/v1/process -> RAG -> grounded answer + sources.
