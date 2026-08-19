"""
FastAPI backend. Endpoints:
  POST /analyze  — upload followers + following, get mutuals/not-back lists
  POST /diff     — upload two snapshots of the same list, get who was added/removed
  GET  /api/health

Privacy notes (also see README):
- Uploaded files are read into memory, parsed, and the parsed result is
  returned in the HTTP response. Nothing is written to disk.
- Nothing is logged. No database. No third-party calls.
- When the request finishes, the uploaded bytes and parsed data are
  garbage-collected like any other Python objects — there is no
  persistence step anywhere in this code. This applies to /diff too:
  both snapshots you upload exist only for the duration of that one
  request, not stored for next time.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from parser import (
    parse_multiple_followers_files,
    parse_following_html,
    extract_export_date_range,
    parse_any_export_html,
)
from compare import compare_follow_sets, diff_snapshots

app = FastAPI(title="Instagram Mutuals")

# Frontend and backend are served from the same origin (this same app),
# so CORS isn't actually needed for normal use. This stays permissive
# only so you can still hit the API from a local file:// page or a
# separate dev server while testing. Safe to leave as-is even once
# deployed, since there's no auth/cookie state for a malicious origin
# to exploit — every request is stateless and self-contained.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


class UserEntryResponse(BaseModel):
    username: str
    followed_at: str | None = None


class DateRangeResponse(BaseModel):
    start: str
    end: str


class AnalyzeResponse(BaseModel):
    followers_count: int
    following_count: int
    mutuals: list[UserEntryResponse]
    not_following_back: list[UserEntryResponse]
    im_not_following_back: list[UserEntryResponse]
    followers_date_range: DateRangeResponse | None = None
    following_date_range: DateRangeResponse | None = None


class DiffResponse(BaseModel):
    added: list[str]
    removed: list[str]


MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  # 20MB per file, generous for an HTML export


async def _read_and_validate(file: UploadFile, label: str) -> str:
    if not file.filename.lower().endswith((".html", ".htm")):
        raise HTTPException(
            status_code=400,
            detail=f"{label}: expected an .html file, got '{file.filename}'. "
                   f"Did you upload the right export file?",
        )

    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail=f"{label}: file is empty.")
    if len(raw) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"{label}: file too large.")

    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail=f"{label}: couldn't decode as UTF-8. Is this really an Instagram export?",
        )


def _to_entry_list(entries) -> list[UserEntryResponse]:
    return [UserEntryResponse(username=e.username, followed_at=e.followed_at) for e in entries]


@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    followers_files: list[UploadFile] = File(..., description="One or more followers_N.html files"),
    following_file: UploadFile = File(..., description="following.html"),
):
    if not followers_files:
        raise HTTPException(status_code=400, detail="No followers file uploaded.")

    followers_html = [
        await _read_and_validate(f, f"Followers file '{f.filename}'")
        for f in followers_files
    ]
    following_html = await _read_and_validate(following_file, "Following file")

    followers_dict = parse_multiple_followers_files(followers_html)
    following_dict = parse_following_html(following_html)

    if not followers_dict and not following_dict:
        raise HTTPException(
            status_code=422,
            detail="No usernames could be parsed from either file. "
                   "The export format may have changed, or these aren't the right files.",
        )

    result = compare_follow_sets(followers_dict, following_dict)

    # Date range comes from the first followers file and the following
    # file. If Instagram changes this header format, extraction just
    # returns None and the frontend simply skips the warning banner.
    followers_range = extract_export_date_range(followers_html[0]) if followers_html else None
    following_range = extract_export_date_range(following_html)

    return AnalyzeResponse(
        followers_count=result.followers_count,
        following_count=result.following_count,
        mutuals=_to_entry_list(result.mutuals),
        not_following_back=_to_entry_list(result.not_following_back),
        im_not_following_back=_to_entry_list(result.im_not_following_back),
        followers_date_range=DateRangeResponse(start=followers_range[0], end=followers_range[1])
            if followers_range else None,
        following_date_range=DateRangeResponse(start=following_range[0], end=following_range[1])
            if following_range else None,
    )


@app.post("/diff", response_model=DiffResponse)
async def diff(
    previous_file: UploadFile = File(..., description="An older followers.html or following.html export"),
    current_file: UploadFile = File(..., description="A newer export of the same list type"),
):
    """
    Compares two exports of the SAME list (e.g. two followers_1.html
    files taken weeks apart) and reports who was added/removed between
    them. Works for either followers or following files — the caller
    just needs to upload two of the same kind.
    """
    previous_html = await _read_and_validate(previous_file, "Previous export")
    current_html = await _read_and_validate(current_file, "Current export")

    # Format-agnostic: works whether both files are followers exports
    # or both are following exports, since we don't know which type
    # the caller uploaded — only that both are the same type.
    previous_dict = parse_any_export_html(previous_html)
    current_dict = parse_any_export_html(current_html)

    if not previous_dict and not current_dict:
        raise HTTPException(
            status_code=422,
            detail="No usernames could be parsed from either file.",
        )

    result = diff_snapshots(previous_dict, current_dict)
    return DiffResponse(added=result["added"], removed=result["removed"])


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serve the frontend as static files so the whole app runs from one process.
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
