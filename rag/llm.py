import os
from dotenv import load_dotenv

load_dotenv()


# =========================================================
# RAG-GROUNDED ANSWER
# =========================================================

def generate_answer(query, docs):

    if not docs:
        return {
            "answer": "I could not find enough verified information in the available government sources.",
            "grounded": False
        }

    key = os.getenv("GROQ_API_KEY")

    if not key:
        return {
            "answer": (
                "Verified information was retrieved. "
                "Please review the official sources below "
                "for the current details."
            ),
            "grounded": True
        }

    from groq import Groq

    ctx = "\n---\n".join(
        f"""
Service: {d.get('service')}
Section: {d.get('section')}
Information: {d.get('content')}
Source: {d.get('source_url')}
"""
        for d in docs
    )

    prompt = f"""
Answer ONLY from this verified context.
Do not invent facts.
Keep the answer simple and accessible.

Question:
{query}

Verified Context:
{ctx}
"""

    client = Groq(api_key=key)

    r = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": (
                    "Answer only from the supplied verified context."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0
    )

    return {
        "answer": r.choices[0].message.content,
        "grounded": True
    }


# =========================================================
# GENERAL LLM
# =========================================================

def generate_general_answer(query):

    key = os.getenv("GROQ_API_KEY")

    if not key:
        return (
            "The general AI service is not configured yet. "
            "Please check the GROQ_API_KEY."
        )

    from groq import Groq

    prompt = f"""
You are the general assistance layer of Sanket Setu.

Answer the user's question clearly and briefly.

Important:
- Do not claim information is from an official government source.
- Do not invent government schemes, eligibility rules,
  documents, deadlines, or URLs.
- If the question requires current or official government
  information, tell the user that verified government
  sources should be checked.
- Keep the language simple and accessible.

User question:
{query}
"""

    client = Groq(api_key=key)

    r = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are Sanket Setu's general assistance layer."
                )
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        temperature=0.2
    )

    return r.choices[0].message.content