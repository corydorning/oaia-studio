---
name: oaia-studio
description: Use when the user asks to generate, edit, inspect, or retrieve images through OAIA Studio, or continue an existing OAIA Studio image request. Not for unrelated image requests or changing OpenAI account settings.
---

# OAIA Studio

Use OAIA Studio's local backend so agent requests share the browser's saved key, studios, history, and safeguards. Run on the Mac hosting OAIA Studio. Generation authorization covers the requested images, not unrelated generations or account changes.

## Locate and prepare

Resolve this file's symlink to the canonical `skills/oaia-studio/SKILL.md`; the project root is two directories above its containing folder. Keep the skill attached to the full OAIA Studio package. From that root:

```zsh
source scripts/runtime.zsh
oaia_node=$(studio_find_node)
"$oaia_node" skills/oaia-studio/scripts/oaia-studio.mjs --help
```

Inspect reference images and establish their roles, prompt, model, dimensions, quality, count, studio, and destination from the request. Preserve project artwork rules and approval gates. Default is the default studio and Sunburst the default model; preserve explicit choices. Consult `src/config.mjs` and the app configuration for supported settings; do not guess native dimensions or prices.

Write request JSON using actual absolute reference paths in the desired order, or an empty list:

```json
{
  "studio": "Default",
  "prompt": "The complete image instructions, including each reference's role.",
  "model": "gpt-image-2.5-sunburst",
  "size": "2160x3840",
  "quality": "high",
  "referencePaths": []
}
```

Keep records in a private task folder or ignored `.runtime/requests/`; never include credentials. Preparation is offline: it validates settings, freezes reference hashes/order, and creates a submission ID.

```zsh
"$oaia_node" skills/oaia-studio/scripts/oaia-studio.mjs prepare /absolute/request.json /absolute/new-record-directory
```

## Submit and reconcile

For authorized generation, run `submit RECORD_DIRECTORY` once. It opens the named studio through the manager, discovers the actual port, and records the attempt before posting. Never bypass OAIA Studio with a direct OpenAI call.

Track that request with `status RECORD_DIRECTORY`, which makes no paid call. Poll at sensible intervals and preserve the record across interruptions. A timeout, absent job, expired key, or `uncertain` outcome never authorizes resubmission, a new UUID, or a fallback model. Inspect history and OpenAI Usage; obtain authorization for a new paid attempt. Do not restart an active studio.

For missing/expired keys, direct the user to [OpenAI API keys](https://platform.openai.com/api-keys) and **Configure OAIA API Key.command** for hidden local entry, then **Check connection**. All studios share that Keychain entry. Do not retrieve or print the key. One-day keys need replacement after expiry.

## Verify and deliver

On completion, `status` reads the original PNG and reports actual dimensions, hash, local path, prompt/settings paths, and whether dimensions match. Visually inspect it. Smaller output remains the original at its actual size; never upscale silently or call it native 4K.

Copy original bytes to the authorized destination without replacing a different file. Preserve prompt/settings alongside them and verify the saved hash. `image.png` is the original; `selected.png` may be a separately prepared revision. Respect approval-before-saving gates. Report exact paths, dimensions, and unmet requirements. Estimates are not a live credit balance.
