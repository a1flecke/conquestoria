#!/usr/bin/env python3
"""Dual-backend Nano Banana client: AI Studio primary with automatic failover to Vertex AI (ADC).

Backends:
  - `aistudio` (primary in `auto` mode): uses `GEMINI_API_KEY` / `GOOGLE_API_KEY` via Google GenAI SDK
    (`genai.Client(api_key=...)`) or zero-dependency Interactions API v1 REST, or falls back to the
    keychain-backed `gemini-api` CLI when no env var is set. Consumes AI Studio Prepay / Developer
    Program credits first.
  - `vertex` (automatic failover in `auto` mode, or forced via `NANO_BANANA_BACKEND=vertex` / `--backend vertex`):
    uses Application Default Credentials (ADC) via `genai.Client(vertexai=True, project=..., location=...)`
    when `google-genai` is installed, or zero-dependency Vertex AI REST (`generateContent`) with a
    `gcloud auth application-default print-access-token` bearer token.

Environment variables:
  NANO_BANANA_BACKEND     `auto` (default), `aistudio`, `vertex`, `rest`, or `cli`
  GEMINI_API_KEY          AI Studio API key (or GOOGLE_API_KEY as fallback)
  AISTUDIO_IMAGE_MODEL    AI Studio model ID/alias (default: gemini-nano-banana-2.1; NANO_BANANA_MODEL also supported)
  VERTEX_IMAGE_MODEL      Vertex AI model ID/alias (default: gemini-3.1-flash-image)
  GOOGLE_CLOUD_PROJECT    Vertex AI GCP project (default: conquestoria-image-gen)
  GOOGLE_CLOUD_LOCATION   Vertex AI region (default: us-central1)
  GEMINI_API_BASE_URL     Optional AI Studio REST base URL override (tests/proxies)
  VERTEX_API_BASE_URL     Optional Vertex AI REST base URL override (tests/proxies)
"""
from __future__ import annotations

import base64
import io
import json
import os
import shutil
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from PIL import Image

DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1'
DEFAULT_MODEL = 'gemini-nano-banana-2.1'
DEFAULT_VERTEX_MODEL = 'gemini-nano-banana-2.1'
DEFAULT_TEXT_MODEL = 'gemini-4-hydrogen'
DEFAULT_VERTEX_TEXT_MODEL = 'gemini-2.5-flash'
DEFAULT_VERTEX_PROJECT = 'gen-lang-client-0840262071'
DEFAULT_VERTEX_LOCATION = 'global'

MODEL_ALIASES: dict[str, str] = {
    'default': DEFAULT_MODEL,
    'nano-banana-2.1': 'gemini-nano-banana-2.1',
    'nano-banana-pro': 'gemini-3-pro-image',
    'nano-banana-2-lite': 'gemini-3.1-flash-lite-image',
    'nano-banana-2': 'gemini-3.1-flash-image',
}

VERTEX_MODEL_ALIASES: dict[str, str] = {
    'default': DEFAULT_VERTEX_MODEL,
    'nano-banana-2.1': 'gemini-nano-banana-2.1',
    'nano-banana-2': 'gemini-3.1-flash-image',
    'nano-banana-pro': 'gemini-3-pro-image',
    'nano-banana-2-lite': 'gemini-3.1-flash-lite-image',
    'nano-banana': 'gemini-2.5-flash-image',
}

# Models on Vertex AI that do not accept imageConfig.imageSize.
VERTEX_MODELS_WITHOUT_IMAGE_SIZE = {'gemini-2.5-flash-image'}

RETRYABLE_HTTP_STATUS = {408, 429, 500, 502, 503, 504}
QUOTA_FAILOVER_MARKERS = (
    'resource_exhausted',
    'too_many_requests',
    'rate_limit_error',
    'rate limit exceeded',
    'quota',
    'billing',
    'prepay',
    'credit',
    'payment required',
    'limit: 0',
    'free tier',
    'http 429',
    'http 402',
)


class NanoBananaError(RuntimeError):
    """Raised when the Nano Banana API request fails or returns no usable image."""


class NanoBananaAuthError(NanoBananaError):
    """Raised when no valid credentials are available (exit code 3)."""


class NanoBananaQuotaError(NanoBananaError):
    """Raised when AI Studio quota, billing, prepay credits, or rate limits are exhausted."""


def is_failover_error(exc: BaseException) -> bool:
    """True when an AI Studio failure should automatically fail over to Vertex AI in `auto` mode."""
    if isinstance(exc, (NanoBananaAuthError, NanoBananaQuotaError)):
        return True
    msg = str(exc).lower()
    return any(marker in msg for marker in QUOTA_FAILOVER_MARKERS)


@dataclass(frozen=True)
class ReferenceImage:
    """An image attached to a Nano Banana request (e.g. style exemplar or approved master)."""
    data: bytes
    mime_type: str = 'image/png'
    label: str = ''

    @classmethod
    def from_path(cls, path: Path, label: str = '') -> 'ReferenceImage':
        raw = path.read_bytes()
        mime = 'image/png'
        if raw.startswith(b'\xff\xd8\xff'):
            mime = 'image/jpeg'
        elif raw[:4] == b'RIFF' and raw[8:12] == b'WEBP':
            mime = 'image/webp'
        return cls(data=raw, mime_type=mime, label=label or path.name)


@dataclass(frozen=True)
class GenerationResult:
    """One image returned by Nano Banana, guaranteed to be valid PNG bytes."""
    png_bytes: bytes
    raw_mime_type: str
    converted_to_png: bool
    text_notes: str
    model: str
    aspect_ratio: str | None
    image_size: str | None
    status: str | None
    backend: str = 'aistudio'


def resolve_model(name: str | None = None) -> str:
    chosen = (
        name
        or os.environ.get('AISTUDIO_IMAGE_MODEL')
        or os.environ.get('NANO_BANANA_MODEL')
        or DEFAULT_MODEL
    ).strip()
    return MODEL_ALIASES.get(chosen.lower(), chosen)


def resolve_vertex_model(name: str | None = None) -> str:
    chosen = (name or os.environ.get('VERTEX_IMAGE_MODEL') or DEFAULT_VERTEX_MODEL).strip()
    return VERTEX_MODEL_ALIASES.get(chosen.lower(), chosen)


def _find_binary(name: str) -> str | None:
    found = shutil.which(name)
    if found:
        return found
    home = Path.home()
    for cand in (
        home / '.local' / 'share' / 'mise' / 'shims' / name,
        home / '.local' / 'bin' / name,
        Path('/opt/homebrew/bin') / name,
        Path('/usr/local/bin') / name,
    ):
        if cand.is_file() and os.access(cand, os.X_OK):
            return str(cand)
    return None


def find_gemini_cli() -> str | None:
    return _find_binary('gemini-api')


def find_gcloud_cli() -> str | None:
    return _find_binary('gcloud')


def resolve_api_key(explicit: str | None = None) -> str | None:
    key = (explicit or os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY') or '').strip()
    return key or None


def resolve_image_size(requested: str | None, *, cells: int, grid: list[int] | None) -> str:
    """Choose token-efficient output resolution (`1K` vs `2K`) when `requested` is `'auto'` or unset."""
    if requested and requested.strip().lower() != 'auto':
        return requested.strip()
    if cells >= 5 or (grid and len(grid) >= 2 and max(grid) >= 3):
        return '2K'
    return '1K'


def _ensure_png(raw: bytes) -> tuple[bytes, bool]:
    if raw.startswith(b'\x89PNG\r\n\x1a\n'):
        return raw, False
    with Image.open(io.BytesIO(raw)) as im:
        out = io.BytesIO()
        mode = 'RGBA' if im.mode in ('RGBA', 'LA', 'PA') else 'RGB'
        im.convert(mode).save(out, format='PNG', optimize=True)
        return out.getvalue(), True


def build_interaction_payload(
    prompt: str,
    *,
    references: Sequence[ReferenceImage] = (),
    aspect_ratio: str | None = None,
    image_size: str | None = None,
    model: str = DEFAULT_MODEL,
) -> dict:
    """Build a Gemini Interactions API v1 JSON request payload for AI Studio image generation."""
    inputs: list[dict] = []
    for ref in references:
        if ref.label:
            inputs.append({'type': 'text', 'text': ref.label})
        inputs.append({
            'type': 'image',
            'mime_type': ref.mime_type,
            'data': base64.b64encode(ref.data).decode('ascii'),
        })
    inputs.append({'type': 'text', 'text': prompt})

    # No mime_type: the API only accepts 'image/jpeg' there, and its default output is the PNG we want
    # (JPEG would smear the flat magenta key colour around every edge).
    response_format: dict = {'type': 'image'}
    if aspect_ratio:
        response_format['aspect_ratio'] = aspect_ratio
    if image_size:
        response_format['image_size'] = image_size

    return {
        'model': model,
        'input': inputs,
        'response_format': response_format,
        'store': False,
    }


def build_vertex_generate_payload(
    prompt: str,
    *,
    references: Sequence[ReferenceImage] = (),
    aspect_ratio: str | None = None,
    image_size: str | None = None,
    model: str = DEFAULT_VERTEX_MODEL,
) -> dict:
    """Build a Vertex AI `generateContent` JSON request payload for Nano Banana image generation."""
    parts: list[dict] = []
    for ref in references:
        if ref.label:
            parts.append({'text': ref.label})
        parts.append({
            'inlineData': {
                'mimeType': ref.mime_type,
                'data': base64.b64encode(ref.data).decode('ascii'),
            }
        })
    parts.append({'text': prompt})

    gen_config: dict = {'responseModalities': ['TEXT', 'IMAGE']}
    img_cfg: dict = {}
    if aspect_ratio:
        img_cfg['aspectRatio'] = aspect_ratio
    if image_size and model not in VERTEX_MODELS_WITHOUT_IMAGE_SIZE:
        img_cfg['imageSize'] = image_size
    if img_cfg:
        gen_config['imageConfig'] = img_cfg

    return {
        'contents': [{'role': 'user', 'parts': parts}],
        'generationConfig': gen_config,
    }


def _extract_interaction_outputs(body: dict) -> tuple[bytes | None, str, str, str | None]:
    status = body.get('status')
    if status in ('failed', 'cancelled'):
        err = body.get('error') or status
        raise NanoBananaError(f'Nano Banana interaction ended with status={status}: {err}')

    steps = body.get('steps') or []
    texts: list[str] = []
    img_bytes: bytes | None = None
    img_mime = 'image/png'

    for step in steps:
        if step.get('type') != 'model_output':
            continue
        for block in step.get('content') or []:
            btype = block.get('type')
            if btype == 'text' and isinstance(block.get('text'), str):
                texts.append(block['text'].strip())
            elif btype == 'image' and block.get('data'):
                img_bytes = base64.b64decode(block['data'])
                img_mime = block.get('mime_type') or 'image/png'

    return img_bytes, img_mime, '\n'.join(t for t in texts if t), status


def _extract_generate_content_outputs(body: dict) -> tuple[bytes | None, str, str, str | None]:
    candidates = body.get('candidates') or []
    if not candidates:
        block = (body.get('promptFeedback') or {}).get('blockReason')
        raise NanoBananaError(f'Vertex AI returned no candidates (blockReason={block or "none"})')
    cand = candidates[0]
    finish = cand.get('finishReason')
    parts = (cand.get('content') or {}).get('parts') or []
    texts: list[str] = []
    img_bytes: bytes | None = None
    img_mime = 'image/png'
    for part in parts:
        if isinstance(part.get('text'), str):
            texts.append(part['text'].strip())
        inline = part.get('inlineData') or part.get('inline_data')
        if inline and inline.get('data'):
            img_bytes = base64.b64decode(inline['data'])
            img_mime = inline.get('mimeType') or inline.get('mime_type') or 'image/png'
    return img_bytes, img_mime, '\n'.join(t for t in texts if t), finish


def _strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith('```'):
        lines = cleaned.splitlines()
        if lines and lines[0].startswith('```'):
            lines = lines[1:]
        if lines and lines[-1].strip() == '```':
            lines = lines[:-1]
        cleaned = '\n'.join(lines).strip()
    return cleaned


def _resolve_vertex_access_token() -> str:
    """Obtain an OAuth2 bearer token for Vertex AI via env override, `google.auth`, or `gcloud` ADC."""
    env_tok = (os.environ.get('VERTEX_ACCESS_TOKEN') or os.environ.get('GOOGLE_ACCESS_TOKEN') or '').strip()
    if env_tok:
        return env_tok

    try:
        import google.auth  # type: ignore[import-not-found]
        from google.auth.transport.requests import Request as GoogleAuthRequest  # type: ignore[import-not-found]
        creds, _ = google.auth.default(scopes=['https://www.googleapis.com/auth/cloud-platform'])
        if not creds.valid:
            creds.refresh(GoogleAuthRequest())
        if creds.token:
            return str(creds.token)
    except Exception:
        pass

    gcloud = find_gcloud_cli()
    if gcloud:
        for subcmd in (
            [gcloud, 'auth', 'application-default', 'print-access-token'],
            [gcloud, 'auth', 'print-access-token'],
        ):
            proc = subprocess.run(subcmd, capture_output=True, text=True, timeout=30)
            tok = proc.stdout.strip()
            if proc.returncode == 0 and tok:
                return tok

    raise NanoBananaAuthError(
        'Vertex AI ADC credentials are not configured. Run `gcloud auth application-default login` '
        f'and `gcloud auth application-default set-quota-project {os.environ.get("GOOGLE_CLOUD_PROJECT", DEFAULT_VERTEX_PROJECT)}`.'
    )


def _try_import_google_genai():
    try:
        from google import genai  # type: ignore[import-not-found]
        from google.genai import types as genai_types  # type: ignore[import-not-found]
        return genai, genai_types
    except Exception:
        return None, None


class NanoBananaClient:
    """Dual-backend Gemini Nano Banana client (AI Studio primary -> automatic Vertex AI ADC failover)."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        vertex_model: str | None = None,
        base_url: str | None = None,
        vertex_base_url: str | None = None,
        vertex_project: str | None = None,
        vertex_location: str | None = None,
        backend: str | None = None,
        timeout_s: float = 180.0,
        http_retries: int = 3,
        retry_delay_s: float = 2.0,
    ):
        self.model = resolve_model(model)
        self.vertex_model = resolve_vertex_model(vertex_model)
        self.base_url = (base_url or os.environ.get('GEMINI_API_BASE_URL') or DEFAULT_BASE_URL).rstrip('/')
        self._explicit_base_url = bool(base_url or os.environ.get('GEMINI_API_BASE_URL'))
        self.vertex_base_url = (vertex_base_url or os.environ.get('VERTEX_API_BASE_URL') or '').rstrip('/')
        self.vertex_project = (vertex_project or os.environ.get('GOOGLE_CLOUD_PROJECT') or DEFAULT_VERTEX_PROJECT).strip()
        self.vertex_location = (vertex_location or os.environ.get('GOOGLE_CLOUD_LOCATION') or DEFAULT_VERTEX_LOCATION).strip()
        self.timeout_s = timeout_s
        self.http_retries = max(1, http_retries)
        self.retry_delay_s = max(0.0, retry_delay_s)

        self.api_key: str | None = resolve_api_key(api_key)
        self.cli_bin: str | None = find_gemini_cli()
        raw_mode = (backend or os.environ.get('NANO_BANANA_BACKEND') or 'auto').strip().lower()
        if raw_mode not in ('auto', 'aistudio', 'vertex', 'rest', 'cli'):
            raise ValueError(f'Unknown backend "{raw_mode}": choose auto, aistudio, vertex, rest, or cli')
        self.requested_backend = raw_mode
        self.failover_reason: str | None = None
        self._switched_to_vertex = (raw_mode == 'vertex')

        # Validate forced backends eagerly so exit code 3 is immediate when misconfigured.
        if raw_mode == 'rest' and not self.api_key:
            raise NanoBananaAuthError('Missing GEMINI_API_KEY (or GOOGLE_API_KEY) for REST backend.')
        if raw_mode == 'cli' and not self.cli_bin:
            raise NanoBananaAuthError(
                'gemini-api CLI not found. Install via mise: '
                '`mise use -g github:google-gemini/gemini-api-cli@0.5.0` then run `gemini-api configure --api-key "..."`.'
            )
        if raw_mode == 'aistudio' and not self.api_key and not self.cli_bin:
            raise NanoBananaAuthError(
                'No AI Studio credentials available. Export GEMINI_API_KEY or configure `gemini-api` CLI.'
            )

        self.backend = self._current_backend_label()

    def _current_backend_label(self) -> str:
        if self._switched_to_vertex or self.requested_backend == 'vertex':
            return 'vertex'
        if self.requested_backend == 'cli' or (not self.api_key and self.cli_bin):
            return 'cli'
        if self.api_key:
            return 'aistudio'
        return 'vertex' if self.requested_backend == 'auto' else 'aistudio'

    def _post_json(self, url: str, payload: dict, headers: dict[str, str], *, is_aistudio: bool) -> dict:
        model = payload.get('model', self.model)
        encoded = json.dumps(payload).encode('utf-8')
        last_err: Exception | None = None
        # In `auto` mode, do not waste retries on AI Studio 429/402 — fail over to Vertex AI immediately.
        max_attempts = 1 if (is_aistudio and self.requested_backend == 'auto') else self.http_retries
        for attempt in range(1, max_attempts + 1):
            req = urllib.request.Request(url, data=encoded, method='POST', headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout_s) as resp:
                    return json.loads(resp.read().decode('utf-8'))
            except urllib.error.HTTPError as exc:
                detail = ''
                try:
                    detail = exc.read().decode('utf-8', errors='replace')[:400]
                except OSError:
                    pass
                text = f'HTTP {exc.code} for {model}: {detail or exc.reason}'
                if exc.code in (401, 403):
                    if any(m in detail.lower() for m in ('billing', 'quota', 'prepay', 'credit')):
                        raise NanoBananaQuotaError(f'AI Studio billing/quota error {text}') from exc
                    raise NanoBananaAuthError(f'Auth error {text}') from exc
                if exc.code in (402, 429) or any(m in detail.lower() for m in QUOTA_FAILOVER_MARKERS):
                    last_err = NanoBananaQuotaError(f'Quota/billing exhausted ({text})')
                    if attempt == max_attempts:
                        raise last_err from exc
                else:
                    last_err = NanoBananaError(f'API error {text}')
                    if exc.code not in RETRYABLE_HTTP_STATUS or attempt == max_attempts:
                        raise last_err from exc
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                last_err = NanoBananaError(f'Network error for {model}: {exc}')
                if attempt == max_attempts:
                    raise last_err from exc
            time.sleep(self.retry_delay_s * (2 ** (attempt - 1)))
        raise last_err or NanoBananaError('Nano Banana request failed unexpectedly')

    def _generate_image_aistudio_cli(
        self,
        prompt: str,
        *,
        references: Sequence[ReferenceImage],
        aspect_ratio: str | None,
        image_size: str | None,
        model: str,
    ) -> GenerationResult:
        assert self.cli_bin is not None
        with tempfile.TemporaryDirectory(prefix='nb-cli-') as tmp:
            tmp_dir = Path(tmp)
            out_file = tmp_dir / 'output.png'
            cmd = [
                self.cli_bin, 'image', '--no-interactive', '-m', model,
                '-o', 'json', '--out', str(out_file),
                '--body', json.dumps({'store': False}),
            ]
            if aspect_ratio:
                cmd.extend(['--aspect-ratio', aspect_ratio])
            if image_size:
                cmd.extend(['--image-size', image_size])
            label_lines = [r.label for r in references if r.label]
            full_prompt = ('\n'.join(label_lines) + '\n\n' + prompt) if label_lines else prompt
            for idx, ref in enumerate(references):
                ext = '.png' if ref.mime_type == 'image/png' else '.jpg'
                ref_path = tmp_dir / f'ref_{idx}{ext}'
                ref_path.write_bytes(ref.data)
                cmd.extend(['-i', str(ref_path)])
            cmd.append('--stdin')

            proc = subprocess.run(cmd, input=full_prompt, text=True, capture_output=True, timeout=self.timeout_s)
            combined = (proc.stderr or proc.stdout).strip()
            if proc.returncode == 3:
                raise NanoBananaAuthError(
                    f'gemini-api CLI is not authenticated (exit 3): {combined}. Run `gemini-api configure --api-key "..."` once.'
                )
            if proc.returncode != 0:
                if any(m in combined.lower() for m in QUOTA_FAILOVER_MARKERS):
                    raise NanoBananaQuotaError(f'gemini-api image quota/billing error (exit {proc.returncode}): {combined[:400]}')
                raise NanoBananaError(f'gemini-api image failed (exit {proc.returncode}): {combined[:400]}')

            actual_path = out_file
            mime = 'image/png'
            status = 'completed'
            stdout = proc.stdout.strip()
            if stdout:
                try:
                    meta = json.loads(stdout)
                    if meta.get('path'):
                        actual_path = Path(meta['path'])
                    mime = meta.get('mime_type') or mime
                    status = meta.get('status') or status
                except ValueError:
                    cand = Path(stdout.splitlines()[-1].strip())
                    if cand.is_file():
                        actual_path = cand
            if not actual_path.is_file():
                matches = [p for p in tmp_dir.glob('output.*') if p.is_file()]
                if not matches:
                    raise NanoBananaError(f'gemini-api image succeeded but wrote no output file at {out_file}')
                actual_path = matches[0]

            png_bytes, converted = _ensure_png(actual_path.read_bytes())
            self.backend = 'cli'
            return GenerationResult(
                png_bytes=png_bytes,
                raw_mime_type=mime,
                converted_to_png=converted,
                text_notes='',
                model=model,
                aspect_ratio=aspect_ratio,
                image_size=image_size,
                status=status,
                backend='cli',
            )

    def _generate_image_aistudio(
        self,
        prompt: str,
        *,
        references: Sequence[ReferenceImage],
        aspect_ratio: str | None,
        image_size: str | None,
        model: str,
    ) -> GenerationResult:
        if self.requested_backend == 'cli' or (not self.api_key and self.cli_bin):
            return self._generate_image_aistudio_cli(
                prompt, references=references, aspect_ratio=aspect_ratio, image_size=image_size, model=model,
            )
        if not self.api_key:
            raise NanoBananaAuthError('Missing GEMINI_API_KEY (and gemini-api CLI not installed).')

        # Use google-genai SDK when installed and no custom REST base_url override is active.
        if not self._explicit_base_url:
            genai, genai_types = _try_import_google_genai()
            if genai is not None and genai_types is not None:
                try:
                    sdk_client = genai.Client(api_key=self.api_key)
                    parts: list = []
                    for ref in references:
                        if ref.label:
                            parts.append(ref.label)
                        parts.append(genai_types.Part.from_bytes(data=ref.data, mime_type=ref.mime_type))
                    parts.append(prompt)
                    img_cfg_kwargs = {}
                    if aspect_ratio:
                        img_cfg_kwargs['aspect_ratio'] = aspect_ratio
                    if image_size:
                        img_cfg_kwargs['image_size'] = image_size
                    cfg = genai_types.GenerateContentConfig(
                        response_modalities=['TEXT', 'IMAGE'],
                        image_config=genai_types.ImageConfig(**img_cfg_kwargs) if img_cfg_kwargs else None,
                    )
                    resp = sdk_client.models.generate_content(model=model, contents=parts, config=cfg)
                    img_bytes = None
                    mime = 'image/png'
                    texts: list[str] = []
                    for part in resp.candidates[0].content.parts:
                        if getattr(part, 'text', None):
                            texts.append(part.text.strip())
                        if getattr(part, 'inline_data', None) and part.inline_data.data:
                            img_bytes = part.inline_data.data
                            mime = part.inline_data.mime_type or 'image/png'
                    if not img_bytes:
                        raise NanoBananaError(f'AI Studio SDK ({model}) returned no image part.')
                    png_bytes, converted = _ensure_png(img_bytes)
                    self.backend = 'aistudio'
                    return GenerationResult(
                        png_bytes=png_bytes, raw_mime_type=mime, converted_to_png=converted,
                        text_notes='\n'.join(texts), model=model, aspect_ratio=aspect_ratio,
                        image_size=image_size, status='completed', backend='aistudio',
                    )
                except Exception as exc:
                    if is_failover_error(exc):
                        raise NanoBananaQuotaError(str(exc)) from exc
                    raise NanoBananaError(str(exc)) from exc

        payload = build_interaction_payload(
            prompt, references=references, aspect_ratio=aspect_ratio, image_size=image_size, model=model,
        )
        body = self._post_json(
            f'{self.base_url}/interactions',
            payload,
            {'Content-Type': 'application/json', 'x-goog-api-key': self.api_key},
            is_aistudio=True,
        )
        raw_bytes, mime, notes, status = _extract_interaction_outputs(body)
        if not raw_bytes:
            snippet = f' Model text: {notes[:300]}' if notes else ''
            raise NanoBananaError(f'AI Studio ({model}) returned no image block (status={status}).{snippet}')
        png_bytes, converted = _ensure_png(raw_bytes)
        self.backend = 'aistudio'
        return GenerationResult(
            png_bytes=png_bytes, raw_mime_type=mime, converted_to_png=converted,
            text_notes=notes, model=model, aspect_ratio=aspect_ratio, image_size=image_size,
            status=status, backend='aistudio',
        )

    def _vertex_endpoint(self, model: str) -> str:
        if self.vertex_base_url:
            base = self.vertex_base_url
        elif self.vertex_location == 'global':
            base = 'https://aiplatform.googleapis.com/v1'
        else:
            base = f'https://{self.vertex_location}-aiplatform.googleapis.com/v1'
        return (
            f'{base}/projects/{self.vertex_project}/locations/{self.vertex_location}'
            f'/publishers/google/models/{model}:generateContent'
        )

    def _generate_image_vertex(
        self,
        prompt: str,
        *,
        references: Sequence[ReferenceImage],
        aspect_ratio: str | None,
        image_size: str | None,
        model: str,
    ) -> GenerationResult:
        # Path A: official google-genai SDK with vertexai=True (no api_key!) when installed and no custom base URL.
        if not self.vertex_base_url:
            genai, genai_types = _try_import_google_genai()
            if genai is not None and genai_types is not None:
                try:
                    sdk_client = genai.Client(
                        vertexai=True,
                        project=self.vertex_project,
                        location=self.vertex_location,
                    )
                    parts: list = []
                    for ref in references:
                        if ref.label:
                            parts.append(ref.label)
                        parts.append(genai_types.Part.from_bytes(data=ref.data, mime_type=ref.mime_type))
                    parts.append(prompt)
                    img_cfg_kwargs = {}
                    if aspect_ratio:
                        img_cfg_kwargs['aspect_ratio'] = aspect_ratio
                    if image_size and model not in VERTEX_MODELS_WITHOUT_IMAGE_SIZE:
                        img_cfg_kwargs['image_size'] = image_size
                    cfg = genai_types.GenerateContentConfig(
                        response_modalities=['TEXT', 'IMAGE'],
                        image_config=genai_types.ImageConfig(**img_cfg_kwargs) if img_cfg_kwargs else None,
                    )
                    resp = sdk_client.models.generate_content(model=model, contents=parts, config=cfg)
                    img_bytes = None
                    mime = 'image/png'
                    texts: list[str] = []
                    for part in resp.candidates[0].content.parts:
                        if getattr(part, 'text', None):
                            texts.append(part.text.strip())
                        if getattr(part, 'inline_data', None) and part.inline_data.data:
                            img_bytes = part.inline_data.data
                            mime = part.inline_data.mime_type or 'image/png'
                    if not img_bytes:
                        raise NanoBananaError(f'Vertex AI SDK ({model}) returned no image part.')
                    png_bytes, converted = _ensure_png(img_bytes)
                    self.backend = 'vertex'
                    return GenerationResult(
                        png_bytes=png_bytes, raw_mime_type=mime, converted_to_png=converted,
                        text_notes='\n'.join(texts), model=model, aspect_ratio=aspect_ratio,
                        image_size=None if model in VERTEX_MODELS_WITHOUT_IMAGE_SIZE else image_size,
                        status='completed', backend='vertex',
                    )
                except Exception as exc:
                    raise NanoBananaError(f'Vertex AI SDK ({model}) failed: {exc}') from exc

        # Path B: zero-dependency Vertex AI REST with ADC OAuth2 bearer token.
        token = _resolve_vertex_access_token()
        payload = build_vertex_generate_payload(
            prompt, references=references, aspect_ratio=aspect_ratio, image_size=image_size, model=model,
        )
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}',
            'x-goog-user-project': self.vertex_project,
        }
        body = self._post_json(self._vertex_endpoint(model), payload, headers, is_aistudio=False)
        raw_bytes, mime, notes, finish = _extract_generate_content_outputs(body)
        if not raw_bytes:
            snippet = f' Model text: {notes[:300]}' if notes else ''
            raise NanoBananaError(f'Vertex AI ({model}) returned no image part (finishReason={finish}).{snippet}')
        png_bytes, converted = _ensure_png(raw_bytes)
        self.backend = 'vertex'
        return GenerationResult(
            png_bytes=png_bytes, raw_mime_type=mime, converted_to_png=converted,
            text_notes=notes, model=model, aspect_ratio=aspect_ratio,
            image_size=None if model in VERTEX_MODELS_WITHOUT_IMAGE_SIZE else image_size,
            status=finish or 'completed', backend='vertex',
        )

    def generate_image(
        self,
        prompt: str,
        *,
        references: Sequence[ReferenceImage] = (),
        aspect_ratio: str | None = None,
        image_size: str | None = '2K',
        model: str | None = None,
    ) -> GenerationResult:
        aistudio_model = resolve_model(model) if model else self.model
        vertex_model = resolve_vertex_model(model) if (model and self.requested_backend == 'vertex') else self.vertex_model

        if self._switched_to_vertex or self.requested_backend == 'vertex':
            return self._generate_image_vertex(
                prompt, references=references, aspect_ratio=aspect_ratio, image_size=image_size, model=vertex_model,
            )

        try:
            return self._generate_image_aistudio(
                prompt, references=references, aspect_ratio=aspect_ratio, image_size=image_size, model=aistudio_model,
            )
        except Exception as exc:
            if self.requested_backend != 'auto' or not is_failover_error(exc):
                raise
            reason = str(exc).splitlines()[0][:240]
            self.failover_reason = reason
            self._switched_to_vertex = True
            self.backend = 'vertex'
            print(
                f'AI Studio credits/quota exhausted ({reason}); falling back to Vertex AI '
                f'(project={self.vertex_project}, location={self.vertex_location}, model={vertex_model})...'
            )
            return self._generate_image_vertex(
                prompt, references=references, aspect_ratio=aspect_ratio, image_size=image_size, model=vertex_model,
            )

    def _generate_text_vertex(self, prompt: str, *, model: str = DEFAULT_VERTEX_TEXT_MODEL) -> str:
        token = _resolve_vertex_access_token()
        payload = {'contents': [{'role': 'user', 'parts': [{'text': prompt}]}]}
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}',
            'x-goog-user-project': self.vertex_project,
        }
        body = self._post_json(self._vertex_endpoint(model), payload, headers, is_aistudio=False)
        _, _, notes, finish = _extract_generate_content_outputs(body)
        if not notes:
            raise NanoBananaError(f'Vertex AI ({model}) returned no text (finishReason={finish})')
        return _strip_code_fence(notes)

    def generate_text(self, prompt: str, *, model: str = DEFAULT_TEXT_MODEL) -> str:
        if self._switched_to_vertex or self.requested_backend == 'vertex':
            return self._generate_text_vertex(prompt)
        try:
            if self.requested_backend == 'cli' or (not self.api_key and self.cli_bin):
                assert self.cli_bin is not None
                proc = subprocess.run(
                    [self.cli_bin, 'generate', '--no-interactive', '-m', model, '--stream=false', '-o', 'json', '--stdin'],
                    input=prompt, text=True, capture_output=True, timeout=self.timeout_s,
                )
                combined = (proc.stderr or proc.stdout).strip()
                if proc.returncode == 3:
                    raise NanoBananaAuthError(f'gemini-api CLI auth error: {combined}')
                if proc.returncode != 0:
                    if any(m in combined.lower() for m in QUOTA_FAILOVER_MARKERS):
                        raise NanoBananaQuotaError(f'gemini-api generate quota error: {combined[:400]}')
                    raise NanoBananaError(f'gemini-api generate failed: {combined[:400]}')
                body = json.loads(proc.stdout)
                _, _, notes, status = _extract_interaction_outputs(body)
                if not notes:
                    raise NanoBananaError(f'Gemini CLI ({model}) returned no text (status={status})')
                return _strip_code_fence(notes)

            if not self.api_key:
                raise NanoBananaAuthError('Missing GEMINI_API_KEY (and gemini-api CLI not installed).')
            payload = {'model': model, 'input': [{'type': 'text', 'text': prompt}], 'store': False}
            body = self._post_json(
                f'{self.base_url}/interactions',
                payload,
                {'Content-Type': 'application/json', 'x-goog-api-key': self.api_key},
                is_aistudio=True,
            )
            _, _, notes, status = _extract_interaction_outputs(body)
            if not notes:
                raise NanoBananaError(f'Gemini model ({model}) returned no text (status={status})')
            return _strip_code_fence(notes)
        except Exception as exc:
            if self.requested_backend != 'auto' or not is_failover_error(exc):
                raise
            self.failover_reason = str(exc).splitlines()[0][:240]
            self._switched_to_vertex = True
            self.backend = 'vertex'
            print(f'AI Studio credits/quota exhausted ({self.failover_reason}); falling back to Vertex AI...')
            return self._generate_text_vertex(prompt)
