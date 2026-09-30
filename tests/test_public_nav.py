from html.parser import HTMLParser
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
DESTINATIONS = [
    "index.html#top",
    "index.html#inside",
    "index.html#pricing",
    "join.html",
    "member.html",
]


class DockParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_dock = False
        self.dock_count = 0
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "nav" and "cezar-dock" in attrs.get("class", "").split():
            self.in_dock = True
            self.dock_count += 1
        elif tag == "a" and self.in_dock:
            self.links.append(attrs)

    def handle_endtag(self, tag):
        if tag == "nav" and self.in_dock:
            self.in_dock = False


@pytest.mark.parametrize(
    ("page", "active"),
    [("index.html", "index.html#top"), ("join.html", "join.html"), ("member.html", "member.html")],
)
def test_public_pages_share_the_same_accessible_dock(page, active):
    html = (ROOT / page).read_text(encoding="utf-8")
    parser = DockParser()
    parser.feed(html)

    assert parser.dock_count == 1
    assert html.index('class="cezar-dock"') < html.index("<main")
    assert [link["href"] for link in parser.links] == DESTINATIONS
    assert [link["href"] for link in parser.links if link.get("aria-current") == "page"] == [active]
    assert "assets/public-shell.css" in html
    assert "assets/public-shell.js" in html
