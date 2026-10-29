#!/bin/zsh
cd -- "${0:A:h}" || exit 1
source scripts/runtime.zsh
studio_node=$(studio_find_node)
studio_status=$?
if (( studio_status == 0 )); then
  "$studio_node" scripts/key-setup.mjs
  studio_status=$?
fi
if [[ -t 0 ]]; then
  read -r '?Press Return to close this window.'
fi
exit "$studio_status"
