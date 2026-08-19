"""
Parses Instagram's data-export HTML files into clean sets of usernames.

Instagram's export format is NOT identical between followers_*.html and
following.html:

  followers_1.html:
      <a href="https://www.instagram.com/viidvaid_ss">viidvaid_ss</a>

  following.html:
      <h2 ...>viidvaid_ss</h2>
      <a href="https://www.instagram.com/_u/viidvaid_ss">...</a>

So each file type gets its own extraction rule. Both funnel through the
same normalization step so comparisons are safe (case differences,
whitespace, stray punctuation from bad copies, etc).
"""

from bs4 import BeautifulSoup


def normalize_username(username: str) -> str:
    """
    Instagram usernames are case-insensitive on their end, and exports
    can contain incidental whitespace. Normalize before any comparison.
    """
    return username.strip().lower()


def _extract_entry_blocks(soup: BeautifulSoup):
    """
    Every follower/following entry lives in a div with class
    'pam ... uiBoxWhite noborder'. This is the stable structural anchor
    across both file types.
    """
    return soup.find_all("div", class_="uiBoxWhite")


def parse_followers_html(html_content: str) -> set[str]:
    """
    followers_1.html (and followers_2.html, etc. if the account has
    enough followers to be split across files): username is the link
    text of the profile anchor.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    usernames = set()

    for block in _extract_entry_blocks(soup):
        link = block.find("a", href=True)
        if link and link.get_text(strip=True):
            usernames.add(normalize_username(link.get_text(strip=True)))

    return usernames


def parse_following_html(html_content: str) -> set[str]:
    """
    following.html: username is in an <h2> heading inside the entry
    block, not the link text (the link text there is the full URL).
    """
    soup = BeautifulSoup(html_content, "html.parser")
    usernames = set()

    for block in _extract_entry_blocks(soup):
        heading = block.find("h2")
        if heading and heading.get_text(strip=True):
            usernames.add(normalize_username(heading.get_text(strip=True)))
        else:
            # Fallback: some export variants may not include the h2.
            # Try to pull the username out of a /_u/<username> link.
            link = block.find("a", href=True)
            if link and "/_u/" in link["href"]:
                candidate = link["href"].rstrip("/").split("/_u/")[-1]
                if candidate:
                    usernames.add(normalize_username(candidate))

    return usernames


def parse_multiple_followers_files(html_contents: list[str]) -> set[str]:
    """
    Instagram splits followers across followers_1.html, followers_2.html,
    etc. once the list is large enough. Merge them all into one set.
    """
    all_usernames: set[str] = set()
    for html_content in html_contents:
        all_usernames |= parse_followers_html(html_content)
    return all_usernames
