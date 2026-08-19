"""
FastAPI backend. One endpoint: POST /analyze

Privacy notes (also see README):
- Uploaded files are read into memory, parsed, and the parsed result is
  returned in the HTTP response. Nothing is written to disk.
- Nothing is logged. No database. No third-party calls.
- When the request finishes, the uploaded bytes and parsed sets are
  garbage-collected like any other Python objects — there is no
  persistence step anywhere in this code.
"""

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from parser import parse_multiple_followers_files, parse_following_html
from compare import compare_follow_sets

app = FastAPI(title="Instagram Mutuals")

# Wide open for local dev. Tighten this before any public deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AnalyzeResponse(BaseModel):
    followers_count: int
    following_count: int
    mutuals: list[str]
    not_following_back: list[str]
    im_not_following_back: list[str]


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

    followers_set = parse_multiple_followers_files(followers_html)
    following_set = parse_following_html(following_html)

    if not followers_set and not following_set:
        raise HTTPException(
            status_code=422,
            detail="No usernames could be parsed from either file. "
                   "The export format may have changed, or these aren't the right files.",
        )

    result = compare_follow_sets(followers_set, following_set)

    return AnalyzeResponse(
        followers_count=result.followers_count,
        following_count=result.following_count,
        mutuals=result.mutuals,
        not_following_back=result.not_following_back,
        im_not_following_back=result.im_not_following_back,
    )


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# Serve the frontend as static files so the whole app runs from one process.
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")
