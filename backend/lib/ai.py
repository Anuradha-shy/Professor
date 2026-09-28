"""Professor AI engine — Mistral primary, Emergent universal key fallback.

Both paths support real tool calling, so the assistant's admin powers work even
when Mistral's free tier rate-limits us. Keys stay server-side.
"""

import asyncio
import base64
import json
import logging
import os
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

logger = logging.getLogger(__name__)

MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions"
TEXT_MODEL = os.environ.get("MISTRAL_MODEL", "mistral-small-latest")
VISION_MODEL = os.environ.get("MISTRAL_VISION_MODEL", "pixtral-12b-2409")
FALLBACK_MODEL = "gpt-5.4"

Dispatch = Callable[[str, dict], Awaitable[dict]]


class AiUnavailable(Exception):
    pass


def _mistral_key() -> str:
    return os.environ.get("MISTRAL_API_KEY", "").strip()


def _emergent_key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "").strip()


async def _mistral(payload: dict, attempts: int = 3) -> dict:
    key = _mistral_key()
    if not key:
        raise AiUnavailable("MISTRAL_API_KEY is not set")
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    delay, last = 1.2, ""
    for i in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=75) as client:
                res = await client.post(MISTRAL_URL, headers=headers, json=payload)
        except httpx.HTTPError as exc:
            last = f"network error: {exc}"
        else:
            if res.status_code == 200:
                return res.json()
            last = f"{res.status_code}: {res.text[:160]}"
            if res.status_code not in (429, 500, 502, 503, 504):
                raise AiUnavailable(last)
        if i < attempts - 1:
            await asyncio.sleep(delay)
            delay *= 2
    raise AiUnavailable(last or "Mistral unavailable")


async def _mistral_agent(
    messages: list[dict], system: str, tools: list[dict], dispatch: Dispatch
) -> tuple[str, list[str]]:
    """Mistral tool-calling loop."""
    thread: list[dict] = [{"role": "system", "content": system}, *messages]
    actions: list[str] = []
    for _ in range(4):  # bounded: models can chain calls
        payload: dict[str, Any] = {
            "model": TEXT_MODEL,
            "messages": thread,
            "temperature": 0.25,
            "max_tokens": 1400,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        data = await _mistral(payload)
        msg = data["choices"][0]["message"]
        calls = msg.get("tool_calls") or []
        if not calls:
            return msg.get("content") or "", actions
        thread.append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": calls})
        for tc in calls:
            fn = tc.get("function", {})
            name = fn.get("name", "")
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            result = await dispatch(name, args)
            actions.append(f"{name}:{'ok' if result.get('ok') else 'failed'}")
            thread.append(
                {
                    "role": "tool",
                    "name": name,
                    "tool_call_id": tc.get("id", name),
                    "content": json.dumps(result),
                }
            )
    return "", actions


async def _fallback_agent(
    messages: list[dict], system: str, tools: list[dict], dispatch: Dispatch
) -> tuple[str, list[str]]:
    """Emergent universal-key path — same tools, so admin powers still work."""
    key = _emergent_key()
    if not key:
        raise AiUnavailable("no fallback key configured")
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    chat = LlmChat(api_key=key, session_id="professor", system_message=system).with_model(
        "openai", FALLBACK_MODEL
    )
    if tools:
        chat = chat.with_tools(tools, tool_choice="auto")

    # Replay prior turns as one transcript — the fallback chat starts empty each call.
    history = [m for m in messages if m.get("role") in ("user", "assistant")]
    transcript = "\n\n".join(
        f"{'User' if m['role'] == 'user' else 'You previously replied'}: {m['content']}"
        for m in history[:-1]
    )
    latest = history[-1]["content"] if history else "Hello"
    prompt = f"{transcript}\n\nUser: {latest}" if transcript else str(latest)

    actions: list[str] = []
    if not tools:
        reply = await chat.send_message(UserMessage(text=prompt))
        return str(reply), actions

    response = await chat.send_message_with_tools(UserMessage(text=prompt))
    guard = 0
    while getattr(response, "tool_calls", None) and guard < 4:
        guard += 1
        for tc in response.tool_calls:
            args = tc.arguments if isinstance(tc.arguments, dict) else {}
            result = await dispatch(tc.name, args)
            actions.append(f"{tc.name}:{'ok' if result.get('ok') else 'failed'}")
            chat.add_tool_result(tc.id, json.dumps(result))
        response = await chat.send_message_with_tools()
    text = getattr(response, "content", None) or str(response)
    return str(text), actions


async def agent_turn(
    messages: list[dict], system: str, tools: list[dict], dispatch: Dispatch
) -> tuple[str, list[str], str]:
    """One assistant turn with tools. Returns (reply, actions, provider)."""
    try:
        reply, actions = await _mistral_agent(messages, system, tools, dispatch)
        return reply, actions, f"mistral:{TEXT_MODEL}"
    except AiUnavailable as exc:
        logger.warning("Mistral unavailable (%s) — falling back", exc)
        reply, actions = await _fallback_agent(messages, system, tools, dispatch)
        return reply, actions, f"fallback:{FALLBACK_MODEL}"


async def vision_completion(image_bytes: bytes, prompt: str, system: str) -> tuple[str, str]:
    """OMR / image evaluation with the same fallback guarantee."""
    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "model": VISION_MODEL,
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": f"data:image/jpeg;base64,{b64}"},
                ],
            },
        ],
        "temperature": 0.1,
        "max_tokens": 1600,
    }
    try:
        data = await _mistral(payload, attempts=2)
        return data["choices"][0]["message"].get("content") or "", f"mistral:{VISION_MODEL}"
    except AiUnavailable as exc:
        logger.warning("Mistral vision unavailable (%s) — falling back", exc)
        key = _emergent_key()
        if not key:
            raise
        from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

        chat = LlmChat(api_key=key, session_id="professor-omr", system_message=system).with_model(
            "openai", FALLBACK_MODEL
        )
        reply = await chat.send_message(
            UserMessage(text=prompt, file_contents=[ImageContent(image_base64=b64)])
        )
        return str(reply), f"fallback:{FALLBACK_MODEL}"
