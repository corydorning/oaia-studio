# Shared by Finder launchers; use the current Mac's runtimes, never a saved user's path.
studio_find_node() {
  local candidate version major minor
  local -a candidates
  if [[ -n "${LOCAL_IMAGE_STUDIO_NODE:-}" ]]; then
    candidates=("$LOCAL_IMAGE_STUDIO_NODE")
  else
    candidates=("$(command -v node 2>/dev/null)" /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node")
  fi
  for candidate in "${candidates[@]}"; do
    [[ -n "$candidate" && -x "$candidate" ]] || continue
    version=$("$candidate" --version 2>/dev/null) || continue
    major=${${version#v}%%.*}
    minor=${${${version#v}#*.}%%.*}
    if [[ "$major" == <-> && "$minor" == <-> ]] && (( major > 22 || (major == 22 && minor >= 2) )); then
      print -r -- "$candidate"
      return 0
    fi
  done
  print -u2 -- 'Node.js 22.2 or newer is required. Install the current Node.js LTS from nodejs.org or Homebrew, then reopen the app.'
  print -u2 -- 'You may set LOCAL_IMAGE_STUDIO_NODE to its full path. No software was installed.'
  return 1
}
studio_pause_on_error() {
  if (( $1 != 0 )) && [[ -t 0 ]]; then
    read -r '?Press Return to close this window.'
  fi
}
