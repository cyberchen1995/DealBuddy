"""五处版本号一致性测试。

覆盖 pyproject / 扩展 manifest / __init__ / web.py(FastAPI 与 MCP serverInfo)。
release.yml 只在推 tag 时比对 pyproject 与 manifest 两处;__init__.__version__ 与
web.py 两处字符串曾因不在校验范围而漏更(0.3.0 发版时 __version__ 停在 0.2.0)。
本测试随全量 pytest 进入 release 门禁,任何一处漏改都会在发版前失败。
"""

import json
import re
import tomllib
from pathlib import Path

import dealbuddy

ROOT = Path(__file__).resolve().parents[1]


def test_version_synchronized() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    expected = pyproject["project"]["version"]

    manifest_path = ROOT / "extension" / "dealbuddy-capture" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["version"] == expected, "扩展 manifest.json 版本未同步"

    assert dealbuddy.__version__ == expected, "__init__.py __version__ 未同步"

    web_source = (ROOT / "src" / "dealbuddy" / "web.py").read_text(encoding="utf-8")
    fastapi_versions = re.findall(
        r'FastAPI\(title="DealBuddy", version="([^"]+)"\)', web_source
    )
    assert fastapi_versions == [expected], "web.py FastAPI version= 未同步"

    server_info_versions = re.findall(
        r'"serverInfo": \{"name": "dealbuddy", "version": "([^"]+)"\}', web_source
    )
    assert server_info_versions == [expected], "web.py MCP serverInfo.version 未同步"
