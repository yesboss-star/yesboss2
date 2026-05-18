import time
from typing import Optional, Dict, Any
import hashlib
import json

class SimpleCache:
    def __init__(self, max_size: int = 100, ttl: int = 300):
        self.cache: Dict[str, tuple[Any, float]] = {}
        self.max_size = max_size
        self.ttl = ttl
    
    def _make_key(self, prefix: str, data: dict) -> str:
        key_str = json.dumps(data, sort_keys=True)
        return f"{prefix}:{hashlib.md5(key_str.encode()).hexdigest()}"
    
    def get(self, prefix: str, data: dict) -> Optional[Any]:
        key = self._make_key(prefix, data)
        if key in self.cache:
            value, timestamp = self.cache[key]
            if time.time() - timestamp < self.ttl:
                return value
            else:
                del self.cache[key]
        return None
    
    def set(self, prefix: str, data: dict, value: Any):
        if len(self.cache) >= self.max_size:
            oldest = min(self.cache.items(), key=lambda x: x[1][1])
            del self.cache[oldest[0]]
        
        key = self._make_key(prefix, data)
        self.cache[key] = (value, time.time())
    
    def clear(self):
        self.cache.clear()


cache = SimpleCache(max_size=100, ttl=300)