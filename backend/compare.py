"""
Pure set/dict logic. No I/O, no framework dependencies — easy to unit
test and easy to reason about.

followers and following are now dicts of {username: followed_at_text},
not plain sets, so results can carry the follow timestamp through to
the frontend (for sorting) without a second lookup.
"""

from dataclasses import dataclass, field
from collections import Counter

from parser import parse_timestamp


@dataclass
class UserEntry:
    username: str
    followed_at: str | None = None
    followed_at_sortable: str | None = None  # ISO 8601, for chronological sort


@dataclass
class ComparisonResult:
    mutuals: list[UserEntry] = field(default_factory=list)
    not_following_back: list[UserEntry] = field(default_factory=list)   # I follow, they don't follow me
    im_not_following_back: list[UserEntry] = field(default_factory=list)  # they follow me, I don't follow them
    followers_count: int = 0
    following_count: int = 0


def compare_follow_sets(
    followers: dict[str, str | None], following: dict[str, str | None]
) -> ComparisonResult:
    followers_set = set(followers.keys())
    following_set = set(following.keys())

    mutual_names = following_set & followers_set
    not_following_back_names = following_set - followers_set
    im_not_following_back_names = followers_set - following_set

    def build(names: set[str], source: dict[str, str | None]) -> list[UserEntry]:
        entries = []
        for n in names:
            raw = source.get(n)
            parsed = parse_timestamp(raw)
            entries.append(
                UserEntry(
                    username=n,
                    followed_at=raw,
                    followed_at_sortable=parsed.isoformat() if parsed else None,
                )
            )
        return sorted(entries, key=lambda e: e.username)

    return ComparisonResult(
        # For mutuals, prefer the "following" timestamp (when you followed
        # them) since that's usually the more actionable date.
        mutuals=build(mutual_names, following),
        not_following_back=build(not_following_back_names, following),
        im_not_following_back=build(im_not_following_back_names, followers),
        followers_count=len(followers_set),
        following_count=len(following_set),
    )


def diff_snapshots(
    previous: dict[str, str | None], current: dict[str, str | None]
) -> dict[str, list[str]]:
    """
    Compares two snapshots of the same list (e.g. two follower exports
    taken weeks apart) and returns who was added / removed between them.
    Pure set difference — no persistence, both snapshots are supplied
    by the caller in the same request.
    """
    previous_set = set(previous.keys())
    current_set = set(current.keys())

    return {
        "added": sorted(current_set - previous_set),
        "removed": sorted(previous_set - current_set),
    }


def build_growth_timeline(
    followers: dict[str, str | None], following: dict[str, str | None]
) -> list[dict]:
    """
    Buckets follow events by month, using each entry's timestamp, to
    show growth over time. Only entries with a parseable timestamp
    count — Instagram doesn't always include one on very old rows in
    some export variants, so those are silently excluded rather than
    guessed at.
    """
    follower_months = Counter()
    following_months = Counter()

    for raw in followers.values():
        dt = parse_timestamp(raw)
        if dt:
            follower_months[dt.strftime("%Y-%m")] += 1

    for raw in following.values():
        dt = parse_timestamp(raw)
        if dt:
            following_months[dt.strftime("%Y-%m")] += 1

    all_months = sorted(set(follower_months) | set(following_months))

    return [
        {
            "month": month,
            "followers_gained": follower_months.get(month, 0),
            "following_gained": following_months.get(month, 0),
        }
        for month in all_months
    ]
