

from __future__ import annotations
import os
import time
import hashlib
import boto3
from botocore.config import Config

S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_REGION = os.getenv("S3_REGION", "us-east-1")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "minioadmin")
S3_BUCKET = os.getenv("S3_BUCKET", "test-media")
S3_USE_PATH_STYLE = os.getenv("S3_USE_PATH_STYLE", "true").lower() == "true"

s3 = boto3.client(
    "s3",
    endpoint_url=S3_ENDPOINT,
    region_name=S3_REGION,
    aws_access_key_id=S3_ACCESS_KEY,
    aws_secret_access_key=S3_SECRET_KEY,
    config=Config(s3={"addressing_style": "path" if S3_USE_PATH_STYLE else "virtual"}),
)

def _make_key(data: bytes, ext: str) -> str:
    h = hashlib.sha256(data).hexdigest()[:16]
    ts = int(time.time())
    return f"cards/{h}_{ts}.{ext}"

def upload_bytes(data: bytes, content_type: str) -> str:
    ext = "webp" if content_type == "image/webp" else "jpg"
    key = _make_key(data, ext)
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=key,
        Body=data,
        ContentType=content_type,
        ACL="public-read",
    )
    return key