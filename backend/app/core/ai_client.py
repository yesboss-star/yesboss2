import logging
import json
from typing import Optional, List, Dict, Any
from .config import settings

logger = logging.getLogger("yesboss.ai_client")


class AIClient:
    def __init__(self, provider: str = "gemini"):
        self.provider = provider
        self._client = None

    def _get_openai_client(self):
        if not settings.OPENAI_API_KEY:
            raise ValueError("OPENAI_API_KEY not configured")
        from openai import AsyncOpenAI
        return AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    def _get_gemini_client(self):
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not configured")
        return None

    async def chat_complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        if self.provider == "gemini":
            return await self._gemini_complete(messages, model, temperature, max_tokens)
        elif self.provider == "openai":
            return await self._openai_complete(messages, model or "gpt-4o", temperature, max_tokens)
        elif self.provider == "anthropic":
            return await self._anthropic_complete(messages, model or "claude-sonnet-4-20250514", temperature, max_tokens)
        elif self.provider == "qwen":
            return await self._qwen_complete(messages, model or "qwen2.5:14b", temperature, max_tokens)
        else:
            raise ValueError(f"Unknown provider: {self.provider}")

    async def _gemini_complete(
        self,
        messages: List[Dict[str, str]],
        model: str = "gemini-2.0-flash",
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        if not settings.GEMINI_API_KEY:
            raise ValueError("GEMINI_API_KEY not configured")

        try:
            import google.generativeai as genai
            
            genai.configure(api_key=settings.GEMINI_API_KEY)
            
            system_prompt = ""
            chat_history = []
            for msg in messages:
                if msg.get("role") == "system":
                    system_prompt = msg.get("content", "")
                elif msg.get("role") == "user":
                    chat_history.append({"role": "user", "parts": [{"text": msg.get("content", "")}]})
                elif msg.get("role") == "assistant":
                    chat_history.append({"role": "model", "parts": [{"text": msg.get("content", "")}]})

            generation_config = {
                "temperature": temperature,
                "max_output_tokens": max_tokens,
                "top_p": 0.95,
                "top_k": 40,
            }

            if system_prompt:
                system_instruction = system_prompt
            
            model_obj = genai.GenerativeModel(
                model_name=model,
                system_instruction=system_prompt if system_prompt else None
            )
            
            result = model_obj.generate_content(
                contents=chat_history,
                generation_config=generation_config
            )

            content = result.text if result.text else ""

            return {
                "content": content,
                "model": model,
                "provider": "gemini",
                "usage": {"total_tokens": getattr(result, 'usage_metadata', {}).get('total_token_count', 0)}
            }
        except Exception as e:
            logger.error(f"Gemini API error: {e}")
            raise

    async def _openai_complete(
        self,
        messages: List[Dict[str, str]],
        model: str = "gpt-4o",
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        client = self._get_openai_client()
        
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

        return {
            "content": response.choices[0].message.content,
            "model": model,
            "provider": "openai",
            "usage": response.usage.model_dump() if response.usage else {}
        }

    async def _anthropic_complete(
        self,
        messages: List[Dict[str, str]],
        model: str = "claude-sonnet-4-20250514",
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        if not settings.ANTHROPIC_API_KEY:
            raise ValueError("ANTHROPIC_API_KEY not configured")

        try:
            import httpx
            
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }

            system_msg = next((m["content"] for m in messages if m.get("role") == "system"), "")
            anthropic_messages = [m for m in messages if m.get("role") != "system"]

            payload = {
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "system": system_msg,
                "messages": anthropic_messages
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=60.0)
                response.raise_for_status()
                data = response.json()

            return {
                "content": data.get("content", [{}])[0].get("text", ""),
                "model": model,
                "provider": "anthropic",
                "usage": data.get("usage", {})
            }
        except Exception as e:
            logger.error(f"Anthropic API error: {e}")
            raise

    async def _qwen_complete(
        self,
        messages: List[Dict[str, str]],
        model: str = "qwen2.5:14b",
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> Dict[str, Any]:
        if not settings.QWEN_API_KEY:
            raise ValueError("QWEN_API_KEY not configured")

        try:
            import httpx

            url = f"{settings.QWEN_BASE_URL}/chat/completions"
            headers = {
                "Authorization": f"Bearer {settings.QWEN_API_KEY}",
                "Content-Type": "application/json"
            }

            payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens
            }

            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=60.0)
                response.raise_for_status()
                data = response.json()

            return {
                "content": data.get("choices", [{}])[0].get("message", {}).get("content", ""),
                "model": model,
                "provider": "qwen",
                "usage": data.get("usage", {})
            }
        except Exception as e:
            logger.error(f"Qwen API error: {e}")
            raise


async def get_ai_response(
    prompt: str,
    system_prompt: str = "You are a helpful AI assistant.",
    provider: str = "gemini",
    model: Optional[str] = "gemini-1.5-flash",
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> str:
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})

    client = AIClient(provider=provider)
    result = await client.chat_complete(messages, model, temperature, max_tokens)
    return result.get("content", "")


async def get_chat_response(
    messages: List[Dict[str, str]],
    provider: str = "gemini",
    model: Optional[str] = "gemini-1.5-flash",
    temperature: float = 0.7,
    max_tokens: int = 2000,
) -> str:
    client = AIClient(provider=provider)
    result = await client.chat_complete(messages, model, temperature, max_tokens)
    return result.get("content", "")