from rag.rag import retrieve
from rag.llm import generate_answer, generate_general_answer


# =========================================================
# INTENT → MODULE ROUTING
# =========================================================

INTENT_ROUTING = {
    "government_information": "rag",
    "sign_translation": "sign",
    "object_description": "vision",
    "document_simplification": "lexi",
    "general_question": "llm",
}


# =========================================================
# INTENT UNDERSTANDING
# =========================================================

def understand_intent(input_type, content):

    text = content.lower().strip()

    # Sign input
    # A recognized sign is treated as a possible
    # government-service request and sent to RAG first.
    if input_type == "sign":
        return "government_information"

    # Image input
    if input_type == "image":
        return "object_description"

    # Document input
    if input_type == "document":
        return "document_simplification"

    # Text input
    if input_type == "text":

        government_keywords = [
            "pension",
            "scholarship",
            "udid",
            "disability",
            "certificate",
            "government",
            "scheme",
            "eligibility",
            "documents",
            "apply",
            "application",
            "benefits",
            "subsidy",
            "allowance",
            "government service",
        ]

        if any(keyword in text for keyword in government_keywords):
            return "government_information"

        return "general_question"

    return "general_question"


# =========================================================
# MAIN ORCHESTRATOR
# =========================================================

def orchestrate(input_type, content, confidence=None):

    intent = understand_intent(
        input_type,
        content
    )

    module = INTENT_ROUTING.get(
        intent,
        "llm"
    )


    # =====================================================
    # GOVERNMENT INFORMATION
    # RAG FIRST → LLM FALLBACK
    # =====================================================

    if module == "rag":

        retrieved_docs = retrieve(
            content,
            top_k=3
        )

        # -------------------------------------------------
        # RAG FOUND VERIFIED INFORMATION
        # -------------------------------------------------

        if retrieved_docs:

            try:

                result = generate_answer(
                    content,
                    retrieved_docs
                )

                sources = []

                for doc in retrieved_docs:

                    source = {
                        "title": doc.get(
                            "title",
                            "Official Government Source"
                        ),
                        "section": doc.get(
                            "section",
                            ""
                        ),
                        "url": doc.get(
                            "source_url",
                            ""
                        ),
                    }

                    if source not in sources:
                        sources.append(source)


                return {
                    "success": bool(
                        result.get(
                            "grounded",
                            False
                        )
                    ),

                    "input_type": input_type,

                    "prediction":
                        content
                        if input_type == "sign"
                        else None,

                    "intent": intent,

                    "module_used": "rag",

                    "response": {
                        "title": "Government Assistance",

                        "answer": result.get(
                            "answer",
                            "No grounded answer was generated."
                        ),

                        "sources": sources,
                    },

                    "confidence": confidence,

                    "sources": sources,

                    "grounded": bool(
                        result.get(
                            "grounded",
                            False
                        )
                    ),
                }

            except Exception as error:

                print(
                    "RAG generation failed:",
                    error
                )

        # -------------------------------------------------
        # RAG DID NOT PROVIDE AN ANSWER
        # → LLM FALLBACK
        # -------------------------------------------------

        print(
            "No usable RAG information found. "
            "Using LLM fallback."
        )

        try:

            answer = generate_general_answer(
                content
            )

            return {
                "success": True,

                "input_type": input_type,

                "prediction":
                    content
                    if input_type == "sign"
                    else None,

                "intent": intent,

                "module_used": "llm_fallback",

                "response": {
                    "title": "AI Assistance",

                    "answer": answer,

                    "sources": [],
                },

                "confidence": confidence,

                "sources": [],

                "grounded": False,
            }

        except Exception as error:

            print(
                "LLM fallback failed:",
                error
            )

            return {
                "success": False,

                "input_type": input_type,

                "prediction":
                    content
                    if input_type == "sign"
                    else None,

                "intent": intent,

                "module_used": "rag",

                "response": {
                    "title": "Assistance Unavailable",

                    "answer":
                        "I could not find enough information "
                        "to answer this request.",

                    "sources": [],
                },

                "confidence": confidence,

                "sources": [],

                "grounded": False,
            }


    # =====================================================
    # GENERAL QUESTION → LLM
    # =====================================================

    if module == "llm":

        try:

            answer = generate_general_answer(
                content
            )

        except Exception as error:

            print(
                "General LLM failed:",
                error
            )

            answer = (
                "I could not generate an answer "
                "for this request."
            )


        return {
            "success": True,

            "input_type": input_type,

            "prediction": None,

            "intent": "general_question",

            "module_used": "llm",

            "response": {
                "title": "AI Assistance",

                "answer": answer,

                "sources": [],
            },

            "confidence": confidence,

            "sources": [],

            "grounded": False,
        }


    # =====================================================
    # OTHER MODULES
    # =====================================================

    return {
        "success": True,

        "input_type": input_type,

        "prediction":
            content
            if input_type == "sign"
            else None,

        "intent": intent,

        "module_used": module,

        "response": {
            "title": f"{module.title()} Assistance",

            "answer":
                f"The {module} module will handle "
                "this request.",

            "sources": [],
        },

        "confidence": confidence,

        "sources": [],

        "grounded": False,
    }