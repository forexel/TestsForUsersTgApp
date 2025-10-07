from __future__ import annotations

import uuid
import os
from typing import Optional

import boto3
from botocore.config import Config as BotoConfig

from api.app.core.config import get_settings


def _client():
    s = get_settings()
    if not s.s3_endpoint or not s.s3_bucket or not s.s3_access_key or not s.s3_secret_key:
        raise RuntimeError("S3 is not configured: endpoint/bucket/keys are required")
    cfg = BotoConfig(signature_version="s3v4", s3={"addressing_style": "path" if s.s3_use_path_style else "auto"})
    return boto3.client(
        "s3",
        endpoint_url=s.s3_endpoint,
        aws_access_key_id=s.s3_access_key,
        aws_secret_access_key=s.s3_secret_key,
        region_name=s.s3_region or "us-east-1",
        config=cfg,
    )


def put_bytes(data: bytes, *, key: Optional[str] = None, content_type: Optional[str] = None) -> str:
    s = get_settings()
    c = _client()
    bucket = s.s3_bucket
    assert bucket
    if not key:
        key = uuid.uuid4().hex
    extra = {}
    if content_type:
        extra["ContentType"] = content_type
    c.put_object(Bucket=bucket, Key=key, Body=data, **extra)
    return public_url(key)


def public_url(key: str) -> str:
    s = get_settings()
    if s.s3_public_base_url:
        base = s.s3_public_base_url.rstrip("/")
        return f"{base}/{key}"
    # default public path-style URL
    ep = (s.s3_endpoint or "").rstrip("/")
    bucket = s.s3_bucket or ""
    return f"{ep}/{bucket}/{key}"

