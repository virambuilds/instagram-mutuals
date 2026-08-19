"""
Pure set logic. No I/O, no framework dependencies — easy to unit test
and easy to reason about.
"""

from dataclasses import dataclass, field


@dataclass
class ComparisonResult:
    mutuals: list[str] = field(default_factory=list)
    not_following_back: list[str] = field(default_factory=list)   # I follow, they don't follow me
    im_not_following_back: list[str] = field(default_factory=list)  # they follow me, I don't follow them
    followers_count: int = 0
    following_count: int = 0


def compare_follow_sets(followers: set[str], following: set[str]) -> ComparisonResult:
    mutuals = following & followers
    not_following_back = following - followers        # accounts you follow that don't follow you
    im_not_following_back = followers - following      # accounts that follow you that you don't follow

    return ComparisonResult(
        mutuals=sorted(mutuals),
        not_following_back=sorted(not_following_back),
        im_not_following_back=sorted(im_not_following_back),
        followers_count=len(followers),
        following_count=len(following),
    )
