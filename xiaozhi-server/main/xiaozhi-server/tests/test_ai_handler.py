import json
import unittest
from unittest.mock import AsyncMock, Mock, patch

from core.api.ai_handler import AIHandler


def test_config():
    return {
        "server": {
            "auth_key": "test-secret",
            "auth": {"enabled": False, "allowed_devices": []},
        },
        "read_config_from_api": False,
        "selected_module": {"ASR": "MimoASR", "LLM": "TestLLM"},
        "ASR": {"MimoASR": {"type": "mimo"}},
        "LLM": {"TestLLM": {"type": "openai"}},
    }


class FakeRequest:
    def __init__(self, *, body=b"", payload=None):
        self.headers = {
            "Device-Id": "desktop-device",
            "Client-Id": "desktop-client",
        }
        self._body = body
        self._payload = payload

    async def read(self):
        return self._body

    async def json(self):
        return self._payload


class AIHandlerTest(unittest.IsolatedAsyncioTestCase):
    async def test_asr_returns_provider_text(self):
        provider = Mock()
        provider.transcribe_wav = AsyncMock(return_value="测试语音")
        request = FakeRequest(body=b"RIFF\x00\x00\x00\x00WAVEaudio")

        with patch(
            "core.api.ai_handler.initialize_asr", return_value=provider
        ):
            response = await AIHandler(test_config()).handle_asr(request)

        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.text)["text"], "测试语音")

    async def test_chat_uses_selected_server_llm(self):
        provider = Mock()
        provider.response_no_stream.return_value = "保持安静"
        request = FakeRequest(payload={"prompt": "现在要说话吗？", "max_tokens": 500})

        with patch(
            "core.api.ai_handler.llm.create_instance", return_value=provider
        ):
            response = await AIHandler(test_config()).handle_chat(request)

        self.assertEqual(response.status, 200)
        self.assertEqual(json.loads(response.text)["text"], "保持安静")
        provider.response_no_stream.assert_called_once()

    async def test_asr_rejects_non_wav_input(self):
        response = await AIHandler(test_config()).handle_asr(
            FakeRequest(body=b"not audio")
        )

        self.assertEqual(response.status, 400)
        self.assertFalse(json.loads(response.text)["success"])


if __name__ == "__main__":
    unittest.main()
