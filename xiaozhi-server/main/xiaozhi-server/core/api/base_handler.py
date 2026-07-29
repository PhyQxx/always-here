from aiohttp import web
from config.logger import setup_logging
from core.utils.auth import AuthToken


class BaseHandler:
    def __init__(self, config: dict):
        self.config = config
        self.logger = setup_logging()
        self.auth = AuthToken(config["server"]["auth_key"])

    def _verify_request_auth(self, request):
        """Apply the same optional authentication policy as the WebSocket server."""
        auth_config = self.config.get("server", {}).get("auth", {})
        device_id = request.headers.get("Device-Id", "")
        if not auth_config.get("enabled", False):
            return True, device_id
        if device_id in auth_config.get("allowed_devices", []):
            return True, device_id

        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return False, None
        valid, token_device_id = self.auth.verify_token(auth_header[7:])
        if not valid or (device_id and token_device_id != device_id):
            return False, None
        return True, token_device_id

    def _add_cors_headers(self, response):
        """添加CORS头信息"""
        response.headers["Access-Control-Allow-Headers"] = (
            "client-id, content-type, device-id, authorization"
        )
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Origin"] = "*"

    async def handle_options(self, request):
        """处理OPTIONS请求，添加CORS头信息"""
        response = web.Response(body=b"", content_type="text/plain")
        self._add_cors_headers(response)
        # 添加允许的方法
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        return response
