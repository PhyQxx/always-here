import asyncio
import copy
import io
import json
import uuid
import wave

from aiohttp import web

from config.config_loader import get_private_config_from_api
from core.api.base_handler import BaseHandler
from core.utils import llm
from core.utils.modules_initialize import initialize_asr


MAX_AUDIO_SIZE = 10 * 1024 * 1024
MAX_PROMPT_LENGTH = 20_000


class AIHandler(BaseHandler):
    """Small stateless AI endpoints used by the desktop client."""

    async def _current_config(self, request) -> dict:
        current_config = copy.deepcopy(self.config)
        if current_config.get("read_config_from_api", False):
            current_config = await get_private_config_from_api(
                current_config,
                request.headers.get("Device-Id", ""),
                request.headers.get("Client-Id", ""),
            )
        return current_config

    def _json_response(self, payload: dict, status: int = 200) -> web.Response:
        response = web.Response(
            text=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            content_type="application/json",
            status=status,
        )
        self._add_cors_headers(response)
        return response

    def _authorize(self, request):
        valid, device_id = self._verify_request_auth(request)
        if valid:
            return None
        return self._json_response(
            {"success": False, "message": "无效的认证token或token已过期"},
            status=401,
        )

    async def handle_asr(self, request):
        unauthorized = self._authorize(request)
        if unauthorized is not None:
            return unauthorized
        try:
            wav_data = await request.read()
            if not wav_data:
                raise ValueError("音频数据为空")
            if len(wav_data) > MAX_AUDIO_SIZE:
                raise ValueError("音频文件超过 10MB 限制")
            if not (wav_data.startswith(b"RIFF") and wav_data[8:12] == b"WAVE"):
                raise ValueError("仅支持 WAV 音频")

            current_config = await self._current_config(request)
            provider = initialize_asr(current_config)
            if hasattr(provider, "transcribe_wav"):
                text = await provider.transcribe_wav(wav_data)
            else:
                with wave.open(io.BytesIO(wav_data), "rb") as wav_file:
                    if wav_file.getsampwidth() != 2:
                        raise ValueError("ASR 仅支持 16-bit WAV")
                    pcm_data = wav_file.readframes(wav_file.getnframes())
                text, _ = await provider.speech_to_text_wrapper(
                    [pcm_data], f"desktop-{uuid.uuid4().hex}"
                )

            return self._json_response({"success": True, "text": text or ""})
        except ValueError as exc:
            return self._json_response(
                {"success": False, "message": str(exc)}, status=400
            )
        except Exception as exc:
            self.logger.bind(tag=__name__).error(f"桌面端 ASR 请求失败: {exc}")
            return self._json_response(
                {"success": False, "message": "语音识别失败"}, status=502
            )

    async def handle_chat(self, request):
        unauthorized = self._authorize(request)
        if unauthorized is not None:
            return unauthorized
        try:
            payload = await request.json()
            prompt = payload.get("prompt", "")
            if not isinstance(prompt, str) or not prompt.strip():
                raise ValueError("prompt 不能为空")
            if len(prompt) > MAX_PROMPT_LENGTH:
                raise ValueError("prompt 过长")

            requested_max_tokens = payload.get("max_tokens", 500)
            try:
                max_tokens = min(max(int(requested_max_tokens), 1), 2000)
            except (TypeError, ValueError):
                raise ValueError("max_tokens 必须是整数")

            current_config = await self._current_config(request)
            selected = current_config["selected_module"].get("LLM")
            if not selected:
                raise ValueError("尚未配置默认 LLM")
            llm_config = current_config["LLM"][selected]
            llm_type = llm_config.get("type", selected)
            provider = llm.create_instance(llm_type, llm_config)
            system_prompt = payload.get(
                "system_prompt",
                "你是桌面陪伴伙伴的轻量决策助手，请简洁回答。",
            )
            text = await asyncio.to_thread(
                provider.response_no_stream,
                system_prompt,
                prompt,
                max_tokens=max_tokens,
            )
            return self._json_response(
                {"success": True, "text": (text or "").strip()}
            )
        except (ValueError, KeyError) as exc:
            return self._json_response(
                {"success": False, "message": str(exc)}, status=400
            )
        except Exception as exc:
            self.logger.bind(tag=__name__).error(f"桌面端 LLM 请求失败: {exc}")
            return self._json_response(
                {"success": False, "message": "模型调用失败"}, status=502
            )
