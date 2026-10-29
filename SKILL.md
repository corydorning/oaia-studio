---
name: oaia-studio
description: Use when the user asks to generate, edit, inspect, or retrieve images through OAIA Studio, or continue an existing OAIA Studio image request. Not for unrelated image requests or changing OpenAI account settings.
---

# OAIA Studio

This skill includes the complete local OAIA Studio application and works with Codex or Claude Code on the Mac hosting it.

Resolve this file's symlink to find the package root, then read and follow [the OAIA Studio workflow](skills/oaia-studio/SKILL.md) before preparing, submitting, or retrieving an image. Its helper, backend, and supporting files are all inside this package. The workflow file is at `skills/oaia-studio/SKILL.md`; its own relative paths are based on that location.

For setup, read [README.md](README.md). Keep the full package together: installing only the inner `skills/oaia-studio` folder omits the application modules the helper needs. Installation itself does not authorize image generation or account changes.
