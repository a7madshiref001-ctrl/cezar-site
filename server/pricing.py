from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone
from functools import lru_cache

from .config import ROOT


@lru_cache
def site_data() -> dict:
    text = (ROOT / "data" / "site.js").read_text(encoding="utf-8")
    match = re.search(r"window\.CEZAR_DATA\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not match:
        raise RuntimeError("Could not parse data/site.js")
    return json.loads(match.group(1))


def _alive(offer: dict) -> bool:
    if not offer.get("active"):
        return False
    until = offer.get("until")
    if not until:
        return True
    expiry = datetime.fromisoformat(until.replace("Z", "+00:00"))
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return expiry > datetime.now(timezone.utc)


def _offer(scope: str, friends: bool) -> dict | None:
    data = site_data()
    if not data["offers"].get("enabled"):
        return None
    offers = [o for o in data["offers"]["items"] if _alive(o) and o.get("appliesTo") == scope]
    offers = [o for o in offers if bool(o.get("minPeople")) == friends]
    return max(offers, key=lambda o: o["percent"], default=None)


def _discount(price: int, percent: int) -> int:
    return int(math.ceil(price * (1 - percent / 100) / 5) * 5)


def calculate(plan_type: str, plan_id: str, friends: bool = False, people: int = 1) -> int:
    data = site_data()
    base = None
    scope = None
    if plan_type == "monthly":
        plan = next((p for p in data["plans"]["monthly"] if p["id"] == plan_id), None)
        base = plan and plan["price"]
        scope = "monthly"
    elif plan_type == "yearly":
        parts = plan_id.split("|", 1)
        if len(parts) == 2 and parts[1].isdigit():
            plan = next((p for p in data["plans"]["yearly"] if p["id"] == parts[0]), None)
            tier = plan and next((t for t in plan["tiers"] if t["months"] == int(parts[1])), None)
            base = tier and tier["price"]
            scope = "yearly"
    else:
        key = "activities" if plan_type == "acts" else "singles"
        plan = next((p for p in data["plans"][key] if p["id"] == plan_id), None)
        base = plan and plan["price"]
    if base is None:
        raise ValueError("Unknown plan")
    if friends:
        offer = _offer(scope or "monthly", True)
        if not offer or people < int(offer.get("minPeople", 999)):
            raise ValueError("Friends offer is not active or minimum group size was not met")
        return _discount(base, offer["percent"]) * people
    offer = _offer(scope, False) if scope else None
    return _discount(base, offer["percent"]) if offer else int(base)
