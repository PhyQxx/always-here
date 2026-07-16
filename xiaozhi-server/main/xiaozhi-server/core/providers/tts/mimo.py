import json
import base64
import requests

from config.logger import setup_logging
from core.utils.util import check_model_key
from core.providers.tts.base import TTSProviderBase


TAG = __name__
logger = setup_logging()


class TTSProvider(TTSProviderBase):
    """小米 MiMo 语音合成(MiMo-V2.5-TTS 系列)。

    接口为 OpenAI 兼容的 chat/completions + audio 输出模式:
      - 端点:{base_url}/chat/completions(base_url 形如 https://api.xiaomimimo.com/v1)
      - 鉴权:请求头 api-key: <key>(注意是 `api-key` 头,不是 Authorization)
      - 待合成文本放在 role=assistant 的消息里(实测 MiMo 以 assistant 消息作为要朗读的内容)
      - 输出:choices[0].message.audio.data 为 base64 编码的音频
    返回 wav,交给框架的 audio_bytes_to_data_stream 重采样到 conn.sample_rate 再编码 Opus。
    """

    def __init__(self, config, delete_audio_file):
        super().__init__(config, delete_audio_file)

        base_url = config.get("base_url") or config.get("url") or "https://api.xiaomimimo.com/v1"
        base_url = base_url.rstrip("/")
        self.api_url = f"{base_url}/chat/completions"
        self.api_key = config.get("api_key")
        self.model_name = config.get("model_name", "mimo-v2.5-tts")

        # private_voice(智控台/客户端按会话下发)优先,否则用全局 voice
        # 预置音色用原文:冰糖/茉莉/苏打/白桦/Mia/Chloe/Milo/Dean/mimo_default
        if config.get("private_voice"):
            self.voice = config.get("private_voice")
        else:
            self.voice = config.get("voice", "冰糖")

        # 返回 wav,便于框架统一用 pydub 重采样
        self.audio_file_type = config.get("format", "wav")

        key_msg = check_model_key("TTS", self.api_key)
        if key_msg:
            logger.bind(tag=TAG).error(key_msg)

    async def text_to_speak(self, text, output_file):
        headers = {
            "api-key": self.api_key,
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model_name,
            "modalities": ["text", "audio"],
            "audio": {"voice": self.voice, "format": self.audio_file_type},
            # 待朗读文本作为 assistant 消息内容
            "messages": [{"role": "assistant", "content": text}],
        }

        try:
            resp = requests.post(
                self.api_url, headers=headers, data=json.dumps(payload),
                timeout=self.tts_timeout,
            )
            if resp.status_code != 200:
                raise Exception(
                    f"{__name__} status_code: {resp.status_code} response: {resp.text}"
                )
            data = resp.json()
            audio_b64 = (
                data.get("choices", [{}])[0]
                .get("message", {})
                .get("audio", {})
                .get("data")
            )
            if not audio_b64:
                raise Exception(f"{__name__} 响应中无 audio.data: {resp.text}")
            audio_bytes = base64.b64decode(audio_b64)
            if output_file:
                import os
                os.makedirs(os.path.dirname(output_file), exist_ok=True)
                with open(output_file, "wb") as f:
                    f.write(audio_bytes)
            else:
                return audio_bytes
        except Exception as e:
            raise Exception(f"{__name__} error: {e}")
