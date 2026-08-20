"""
Parses Instagram's data-export HTML files into username -> followed-at
timestamp mappings.

Instagram's export format is NOT identical between followers_*.html and
following.html:

  followers_1.html:
      <a href="https://www.instagram.com/viidvaid_ss">viidvaid_ss</a>
      <div>Aug 03, 2026 7:37 am</div>

  following.html:
      <h2 ...>viidvaid_ss</h2>
      <a href="https://www.instagram.com/_u/viidvaid_ss">...</a>
      <div>Aug 03, 2026 7:36 am</div>

So each file type gets its own extraction rule. Both funnel through the
same normalization step so comparisons are safe (case differences,
whitespace, stray punctuation from bad copies, etc).
"""

import re
from datetime import datetime
from bs4 import BeautifulSoup

# Matches the export header text, e.g.:
# "Contains data that you requested from 13 August 2025 at 08:28 to 13 August 2026 at 08:28"
_DATE_RANGE_PATTERN = re.compile(
    r"Contains data that you requested from (.+?) to (.+)"
)

# Instagram's per-entry timestamp format, e.g. "Aug 03, 2026 7:37 am"
_TIMESTAMP_FORMAT = "%b %d, %Y %I:%M %p"


def parse_timestamp(text: str | None) -> datetime | None:
    """
    Parses Instagram's per-entry timestamp string into a real datetime,
    used for chronological sorting and the growth-over-time chart. The
    raw text is still kept separately for display, since it's already
    in a readable format users expect.
    """
    if not text:
        return None
    try:
        return datetime.strptime(text, _TIMESTAMP_FORMAT)
    except ValueError:
        return None


def normalize_username(username: str) -> str:
    """
    Instagram usernames are case-insensitive on their end, and exports
    can contain incidental whitespace. Normalize before any comparison.
    """
    return username.strip().lower()


def is_deleted_account_placeholder(username: str) -> bool:
    """
    When an account is deactivated or deleted, Instagram's export keeps
    the entry but replaces the username with a placeholder like
    '__deleted__bhiebeajebgbgecfd' instead of removing the row. These
    aren't real, reachable accounts, so they're filtered out rather
    than shown as "not following back" / "you don't follow back".
    """
    return username.startswith("__deleted__")


def _extract_entry_blocks(soup: BeautifulSoup):
    """
    Every follower/following entry lives in a div with class
    'pam ... uiBoxWhite noborder'. This is the stable structural anchor
    across both file types.
    """
    return soup.find_all("div", class_="uiBoxWhite")


def _extract_timestamp(block) -> str | None:
    """
    The follow timestamp is the last plain <div> inside the entry block,
    e.g. "Aug 03, 2026 7:37 am". Returned as the raw display string —
    Instagram doesn't give a machine-readable version in this HTML export,
    only the <head><time> tags at file level (export-generation time),
    not per-entry.
    """
    divs = block.find_all("div")
    if divs:
        text = divs[-1].get_text(strip=True)
        return text or None
    return None


def parse_followers_html(html_content: str) -> dict[str, str | None]:
    """
    followers_1.html (and followers_2.html, etc.): username is the link
    text of the profile anchor. Returns {username: followed_at_text}.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    result: dict[str, str | None] = {}

    for block in _extract_entry_blocks(soup):
        link = block.find("a", href=True)
        if link and link.get_text(strip=True):
            candidate = normalize_username(link.get_text(strip=True))
            if not is_deleted_account_placeholder(candidate):
                result[candidate] = _extract_timestamp(block)

    return result


def parse_following_html(html_content: str) -> dict[str, str | None]:
    """
    following.html: username is in an <h2> heading inside the entry
    block. Returns {username: followed_at_text}.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    result: dict[str, str | None] = {}

    for block in _extract_entry_blocks(soup):
        heading = block.find("h2")
        if heading and heading.get_text(strip=True):
            candidate = normalize_username(heading.get_text(strip=True))
        else:
            # Fallback: some export variants may not include the h2.
            candidate = None
            link = block.find("a", href=True)
            if link and "/_u/" in link["href"]:
                raw = link["href"].rstrip("/").split("/_u/")[-1]
                if raw:
                    candidate = normalize_username(raw)

        if candidate and not is_deleted_account_placeholder(candidate):
            result[candidate] = _extract_timestamp(block)

    return result


def parse_multiple_followers_files(html_contents: list[str]) -> dict[str, str | None]:
    """
    Instagram splits followers across followers_1.html, followers_2.html,
    etc. once the list is large enough. Merge them all into one dict.
    """
    merged: dict[str, str | None] = {}
    for html_content in html_contents:
        merged.update(parse_followers_html(html_content))
    return merged


def extract_export_date_range(html_content: str) -> tuple[str, str] | None:
    """
    Instagram's export header states the date range the export covers,
    e.g. "Contains data that you requested from 13 August 2025 at 08:28
    to 13 August 2026 at 08:28". Returns (start_text, end_text), or None
    if the header text isn't found (format may vary/change over time).
    """
    soup = BeautifulSoup(html_content, "html.parser")
    header = soup.find("header")
    if not header:
        return None

    header_text = header.get_text(" ", strip=True)
    match = _DATE_RANGE_PATTERN.search(header_text)
    if not match:
        return None

    return match.group(1).strip(), match.group(2).strip()


def parse_any_export_html(html_content: str) -> dict[str, str | None]:
    """
    Format-agnostic parser for the /diff endpoint, which accepts two
    snapshots of the SAME list type (both followers, or both following)
    but doesn't know in advance which. Tries the followers-style
    extraction (link text) per block, and falls back to the
    following-style extraction (h2 / _u/ link) if that block's link
    text isn't a plausible username (e.g. it's a full URL instead).
    """
    soup = BeautifulSoup(html_content, "html.parser")
    result: dict[str, str | None] = {}

    for block in _extract_entry_blocks(soup):
        candidate = None

        heading = block.find("h2")
        if heading and heading.get_text(strip=True):
            candidate = normalize_username(heading.get_text(strip=True))
        else:
            link = block.find("a", href=True)
            if link:
                link_text = link.get_text(strip=True)
                if link_text and not link_text.startswith("http"):
                    candidate = normalize_username(link_text)
                elif "/_u/" in link["href"]:
                    raw = link["href"].rstrip("/").split("/_u/")[-1]
                    if raw:
                        candidate = normalize_username(raw)

        if candidate and not is_deleted_account_placeholder(candidate):
            result[candidate] = _extract_timestamp(block)

    return result
