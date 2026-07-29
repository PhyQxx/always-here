import base64
import os
from typing import List, Optional, Tuple

import aiohttp

from config.logger import setup_logging
from core.providers.asr.base import ASRProviderBase
from core.providers.asr.dto.dto import InterfaceType


TAG = __name__
logger = setup_logging()


class ASRProvider(ASRProviderBase):
    """MiMo ASR provider using chat/completions with input_audio."""

    def __init__(self, config: dict, delete_audio_file: bool):
        self.interface_type = InterfaceType.NON_STREAM
        self.api_key = config.get("api_key")
        self.model = config.get("model_name", "mimo-v2.5-asr")
        self.output_dir = config.get("output_dir", "tmp/")
        self.delete_audio_file = delete_audio_file
        self.timeout = float(config.get("timeout", 20))

        base_url = str(config.get("base_url", "")).rstrip("/")
        if not base_url:
            raise ValueError("MiMo ASR base_url 未配置")
        if base_url.endswith("/audio/transcriptions"):
            base_url = base_url[: -len("/audio/transcriptions")]
        self.api_url = (
            base_url
            if base_url.endswith("/chat/completions")
            else f"{base_url}/chat/completions"
        )
        os.makedirs(self.output_dir, exist_ok=True)

    async def transcribe_wav(self, wav_data: bytes) -> str:
        if not wav_data:
            return ""
        if not self.api_key:
            raise ValueError("MiMo ASR api_key 未配置")

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "input_audio",
                            "input_audio": {
                                "data": base64.b64encode(wav_data).decode("ascii"),
                                "format": "wav",
                            },
                        }
                    ],
                }
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        timeout = aiohttp.ClientTimeout(total=self.timeout)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                self.api_url, json=payload, headers=headers
            ) as response:
                response_text = await response.text()
                if response.status != 200:
                    raise RuntimeError(
                        f"MiMo ASR 请求失败: {response.status} - {response_text[:300]}"
                    )
                result = await response.json()

        text = (
            result.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
        )
        return text.strip() if isinstance(text, str) else ""

    async def speech_to_text(
        self,
        opus_data: List[bytes],
        session_id: str,
        artifacts: Optional[ASRProviderBase.AudioArtifacts] = None,
    ) -> Tuple[Optional[str], Optional[str]]:
        if artifacts is None or not artifacts.pcm_bytes:
            return "", None
        try:
            wav_data = self._pcm_to_wav(artifacts.pcm_bytes)
            text = await self.transcribe_wav(wav_data)
            return text, artifacts.file_path
        except Exception as exc:
            logger.bind(tag=TAG).error(f"MiMo ASR 识别失败: {exc}")
            return "", None
