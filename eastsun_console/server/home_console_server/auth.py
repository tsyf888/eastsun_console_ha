"""会话与登录限流。

会话通过 sessions.json 持久化，重启后浏览器复用 Cookie 免重新登录。
登录状态长期有效，只有主动登出（/api/admin/logout）或账户被删除 / 改密码时才会失效。
"""

from __future__ import annotations

import json
import secrets
import time
from pathlib import Path
from typing import Any

FREE_ATTEMPTS = 5
BASE_LOCK_SECONDS = 60
MAX_LOCK_SECONDS = 15 * 60


def _write_private(path: Path, text: str) -> None:
    """原子写入并限制为仅属主可读写。"""
    import os
    temp = path.with_suffix(path.suffix + ".tmp")
    fd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(text)
    os.replace(temp, path)


class Sessions:
    """会话存储：token → {username, is_admin, remember}。

    持久化到 sessions.json；登录时调用 create() 拿 token 写入 Cookie。
    会话不设过期时间，只有 revoke() / revoke_all() / revoke_user() 才移除。
    """

    def __init__(self, persist_path: Path | None = None) -> None:
        self._sessions: dict[str, dict[str, Any]] = {}
        self._persist_path = persist_path
        self._load()

    def _load(self) -> None:
        if not self._persist_path or not self._persist_path.exists():
            return
        try:
            raw = json.loads(self._persist_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        if not isinstance(raw, dict):
            return
        for token, info in raw.items():
            if not isinstance(info, dict):
                continue
            self._sessions[token] = {
                "username": str(info.get("username", "")),
                "isAdmin": bool(info.get("isAdmin", False)),
                "remember": bool(info.get("remember", True)),
            }
        # 清掉旧版本残留的 expires_at 字段，保持文件结构统一。
        self._persist()

    def _persist(self) -> None:
        if not self._persist_path:
            return
        try:
            payload = {token: info for token, info in self._sessions.items()}
            _write_private(self._persist_path, json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
        except OSError:
            pass

    def create(self, username: str, is_admin: bool, remember: bool = True) -> str:
        session_id = secrets.token_urlsafe(32)
        self._sessions[session_id] = {
            "username": username,
            "isAdmin": is_admin,
            "remember": remember,
        }
        self._persist()
        return session_id

    def get(self, session_id: str | None) -> dict[str, Any] | None:
        """返回会话信息 {username, isAdmin, remember}；不存在返回 None。"""
        if not session_id:
            return None
        info = self._sessions.get(session_id)
        if not info:
            return None
        return {"username": info["username"], "isAdmin": info["isAdmin"], "remember": info["remember"]}

    def touch(self, session_id: str | None) -> bool:
        """仅校验有效性：登录长期有效，只有主动登出才会失效。"""
        return self.get(session_id) is not None

    def revoke(self, session_id: str | None) -> None:
        if session_id:
            self._sessions.pop(session_id, None)
            self._persist()

    def revoke_all(self) -> None:
        self._sessions.clear()
        self._persist()

    def revoke_user(self, username: str) -> None:
        """账户被删除或改密码时，吊销该账户的所有会话。"""
        self._sessions = {t: i for t, i in self._sessions.items() if i["username"] != username}
        self._persist()


class LoginLimiter:
    """登录限流：连续输错 5 次后锁定，锁定时间逐次翻倍，最长 15 分钟。"""

    def __init__(self) -> None:
        self.failures = 0
        self.locked_until = 0.0

    def retry_after(self) -> int:
        return max(0, int(self.locked_until - time.monotonic() + 0.999))

    def record_failure(self) -> int:
        """返回锁定秒数；未锁定时为 0。"""
        self.failures += 1
        if self.failures < FREE_ATTEMPTS:
            return 0
        seconds = min(MAX_LOCK_SECONDS, BASE_LOCK_SECONDS * 2 ** (self.failures - FREE_ATTEMPTS))
        self.locked_until = time.monotonic() + seconds
        return seconds

    def remaining_attempts(self) -> int:
        return max(0, FREE_ATTEMPTS - self.failures)

    def record_success(self) -> None:
        self.failures = 0
        self.locked_until = 0.0


class AccountLimiters:
    """按账号独立限流：每个用户名各有一个计数器，互不牵连。

    A 输错密码只会锁定 A，不会影响其他账号；用户名不存在的尝试同样计入
    输入的用户名，避免通过枚举探测绕过限流。为防随机用户名撑爆内存，
    条目数达到上限时清理没有失败记录的账号。
    """

    MAX_ENTRIES = 200

    def __init__(self) -> None:
        self._limiters: dict[str, LoginLimiter] = {}

    def for_user(self, username: str) -> LoginLimiter:
        key = username.strip().lower() or "-"
        limiter = self._limiters.get(key)
        if limiter is None:
            if len(self._limiters) >= self.MAX_ENTRIES:
                self._prune()
            limiter = self._limiters[key] = LoginLimiter()
        return limiter

    def _prune(self) -> None:
        for key, limiter in list(self._limiters.items()):
            if limiter.failures == 0 and limiter.retry_after() == 0:
                del self._limiters[key]
        # 仍超限说明这些账号都在锁定中或刚失败过，按首次出现顺序淘汰最早的一条。
        while len(self._limiters) >= self.MAX_ENTRIES:
            self._limiters.pop(next(iter(self._limiters)))
