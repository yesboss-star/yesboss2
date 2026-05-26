import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

logger = logging.getLogger("yesboss.chatbot")

from .ai_client import get_ai_response, get_chat_response
from .config import settings
from .database import get_database
from .qdrant import get_qdrant_client


class OnboardingChatbot:
    def __init__(self, provider: Optional[str] = None):
        self.provider = provider or settings.DEFAULT_AI_PROVIDER
        self.questions_flow = [
            {"topic": "company_description", "question": "What does your company do? What products or services do you offer?"},
            {"topic": "industry", "question": "What industry are you in? How would you describe your market position?"},
            {"topic": "company_size", "question": "How many employees do you have? How is your team structured?"},
            {"topic": "goals", "question": "What are your main business goals for this year? What are you trying to achieve?"},
            {"topic": "challenges", "question": "What are your biggest operational challenges? What's slowing your business down?"},
            {"topic": "workflows", "question": "Can you describe your current workflows? What processes take most of your time?"},
            {"topic": "decision_making", "question": "How are decisions made in your organization? Who handles what?"},
            {"topic": "growth", "question": "What does growth look like for your business? What's your expansion plan?"},
        ]
    
    def _get_next_question(self, answered_topics: List[str]) -> Dict[str, str]:
        for q in self.questions_flow:
            if q["topic"] not in answered_topics:
                return q
        return {"topic": "complete", "question": "Thank you! I've learned a lot about your business. You're all set!"}
    
    def _build_system_prompt(self, company_profile: Dict[str, Any], answered_topics: List[str]) -> str:
        profile_info = ""
        if company_profile:
            for key, value in company_profile.items():
                if value:
                    profile_info += f"- {key}: {value}\n"
        
        prompt = f"""You are YesBoss AI, an intelligent business analysis assistant helping a business owner through onboarding.

Your job is to ask questions to understand their business deeply. Be conversational, friendly, and helpful.

Current understanding of their business:
{profile_info if profile_info else "Still learning about their business..."}

Topics they've already covered: {', '.join(answered_topics) if answered_topics else "None yet"}

Keep responses brief (2-3 sentences max). Ask one question at a time. End with a follow-up question.

If they ask for help or advice, provide concise actionable suggestions."""
        return prompt
    
    async def start_conversation(self, company_profile: Optional[dict] = None) -> dict:
        first_question = self._get_next_question([])
        
        return {
            "message": f"Welcome! I'm your AI Business Analyst. I'll help you build your personalized business operating system.\n\n{first_question['question']}",
            "question_type": first_question["topic"],
            "company_profile": company_profile or {},
        }
    
    async def process_message(
        self,
        message: str,
        company_profile: dict,
        answered_topics: List[str],
        conversation_history: List[dict],
        provider: Optional[str] = None,
    ) -> dict:
        answered_topics = answered_topics or []
        
        topic = answered_topics[-1] if answered_topics else "intro"
        
        next_q = self._get_next_question(answered_topics)
        
        if next_q["topic"] == "complete":
            return {
                "response": "Thank you for sharing all that information! I now have a good understanding of your business. Your AI-powered workspace is ready. You can ask me anything about your business, operations, or get recommendations anytime!",
                "next_question": None,
                "is_continuing": False,
                "updated_profile": company_profile,
                "answered_topics": answered_topics,
            }
        
        profile = company_profile.copy()
        profile[topic] = message[:200]
        
        system_prompt = self._build_system_prompt(profile, answered_topics)
        
        try:
            history_text = ""
            for msg in conversation_history[-4:]:
                role = msg.get("role", "user")
                content = msg.get("content", "")
                history_text += f"{role}: {content}\n"
            
            prompt = f"""The user just answered a question about '{topic}': "{message}"

Respond naturally (2-3 sentences), acknowledge their answer, then ask this next question:
{next_q['question']}

If they ask something else, answer helpfully first, then guide back to the next question."""
            
            response = await get_ai_response(
                prompt=prompt,
                system_prompt=system_prompt,
                provider=provider,
                temperature=0.7,
                max_tokens=300
            )
            
            return {
                "response": response,
                "next_question": next_q["question"],
                "is_continuing": True,
                "updated_profile": profile,
                "answered_topics": answered_topics + [topic],
            }
        except Exception as e:
            logger.error(f"Chatbot error: {e}")
            return {
                "response": f"Thank you for sharing! {next_q['question']}",
                "next_question": next_q["question"],
                "is_continuing": True,
                "updated_profile": profile,
                "answered_topics": answered_topics + [topic],
            }


async def store_conversation(user_id: str, conversation_id: str, messages: List[dict], company_profile: dict):
    try:
        db = get_database()
        
        doc = {
            "user_id": user_id,
            "conversation_id": conversation_id,
            "messages": messages,
            "company_profile": company_profile,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
        db.conversations.update_one(
            {"conversation_id": conversation_id},
            {"$set": doc},
            upsert=True
        )
        
        logger.info(f"Stored conversation {conversation_id} for user {user_id}")
    except Exception as e:
        logger.error(f"Failed to store conversation: {e}")


async def get_conversation(conversation_id: str) -> Optional[dict]:
    try:
        db = get_database()
        conv = db.conversations.find_one({"conversation_id": conversation_id})
        if conv:
            conv["_id"] = str(conv["_id"])
        return conv
    except Exception as e:
        logger.error(f"Failed to get conversation: {e}")
        return None


async def store_conversation_embedding(conversation_id: str, user_id: str, text: str, metadata: dict):
    try:
        from .qdrant import get_qdrant_client
        
        client = get_qdrant_client()
        if not client:
            return
        
        from qdrant_client.models import PointStruct
        import uuid
        
        text_hash = hash(text)
        import random
        random.seed(text_hash % (2**32))
        embedding = [random.random() for _ in range(1536)]
        norm = sum(x*x for x in embedding) ** 0.5
        embedding = [x/norm for x in embedding]
        
        point = PointStruct(
            id=str(uuid.uuid4()),
            vector=embedding,
            payload={
                "conversation_id": conversation_id,
                "user_id": user_id,
                "text": text[:500],
                "type": metadata.get("type", "conversation"),
                "timestamp": datetime.utcnow().isoformat()
            }
        )
        
        client.upsert(
            collection_name="conversations",
            points=[point]
        )
        
        logger.info(f"Stored embedding for conversation {conversation_id}")
    except Exception as e:
        logger.error(f"Failed to store embedding: {e}")