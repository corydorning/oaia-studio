#!/bin/zsh
cd -- "${0:A:h}" || exit 1
source scripts/runtime.zsh
studio_node=$(studio_find_node)
studio_status=$?
if (( studio_status == 0 )); then
  "$studio_node" scripts/launch.mjs manage
  studio_status=$?
fi
studio_pause_on_error "$studio_status"
exit "$studio_status"
