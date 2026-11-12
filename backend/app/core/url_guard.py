"""SSRF protection for every outbound fetch of a user-influenced URL.

Several endpoints (company scraper, social-link verifier, URL upload, prompt builder) fetched
whatever host a caller supplied - including ``169.254.169.254`` or ``localhost:8000`` - and
returned the page text. These helpers only talk to public internet hosts and re-validate every
redirect hop. (A DNS-rebinding race between the check and the connection remains possible;
network egress rules are the complete answer.)
"""
import ipaddress
import socket
from urllib.parse import urljoin, urlparse

import httpx
import requests

MAX_REDIRECTS = 5
_REDIRECT_CODES = (301, 302, 303, 307, 308)


class UnsafeURLError(requests.RequestException):
    """The URL points at a non-public / non-http(s) destination.

    A ``RequestException`` so existing "could not fetch" handlers treat it like an
    unreachable host instead of crashing the request.
    """


def _ip_is_public(ip: ipaddress._BaseAddress) -> bool:
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return not (
        ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
        or ip.is_multicast or ip.is_unspecified
    )


def assert_public_url(url: str) -> None:
    parsed = urlparse(str(url or ""))
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError(f"Unsupported URL scheme: {parsed.scheme or 'none'}")
    host = (parsed.hostname or "").strip().lower()
    if not host or host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
        raise UnsafeURLError("Host is not allowed")
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        if not _ip_is_public(literal):
            raise UnsafeURLError("Address is not public")
        return
    try:
        infos = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80), proto=socket.IPPROTO_TCP)
    except socket.gaierror as e:
        raise UnsafeURLError(f"Cannot resolve host: {e}") from e
    if not infos:
        raise UnsafeURLError("Cannot resolve host")
    for info in infos:
        if not _ip_is_public(ipaddress.ip_address(info[4][0])):
            raise UnsafeURLError("Host resolves to a non-public address")


def is_public_url(url: str) -> bool:
    try:
        assert_public_url(url)
        return True
    except UnsafeURLError:
        return False


def safe_request(method: str, url: str, **kwargs) -> requests.Response:
    """``requests.request`` that validates the URL and every redirect hop."""
    follow = kwargs.pop("allow_redirects", True)
    for _ in range(MAX_REDIRECTS + 1):
        assert_public_url(url)
        resp = requests.request(method, url, allow_redirects=False, **kwargs)
        if follow and resp.status_code in _REDIRECT_CODES and resp.headers.get("Location"):
            url = urljoin(url, resp.headers["Location"])
            if resp.status_code == 303:
                method = "GET"
            continue
        return resp
    raise UnsafeURLError("Too many redirects")


def safe_get(url: str, **kwargs) -> requests.Response:
    return safe_request("GET", url, **kwargs)


def safe_head(url: str, **kwargs) -> requests.Response:
    return safe_request("HEAD", url, **kwargs)


async def safe_httpx_get(url: str, *, timeout: float = 15.0, headers: dict | None = None) -> httpx.Response:
    """httpx GET that validates the URL and every redirect hop."""
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=False) as client:
        for _ in range(MAX_REDIRECTS + 1):
            assert_public_url(url)
            resp = await client.get(url, headers=headers)
            if resp.status_code in _REDIRECT_CODES and resp.headers.get("location"):
                url = urljoin(url, resp.headers["location"])
                continue
            return resp
    raise UnsafeURLError("Too many redirects")
