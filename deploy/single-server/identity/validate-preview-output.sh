#!/usr/bin/env bash
set -Eeuo pipefail

IFS= read -r mode_line || exit 1
IFS= read -r profile_line || exit 1
IFS= read -r binding_line || exit 1
IFS= read -r legacy_line || exit 1
if IFS= read -r unexpected_line; then
  exit 1
fi
[[ "$mode_line" == "mode=preview" ]] || exit 1
[[ "$profile_line" =~ ^profileAction=(keep|insert)$ ]] || exit 1
[[ "$binding_line" =~ ^bindingAction=(keep|insert)$ ]] || exit 1
[[ "$legacy_line" =~ ^legacyBindingAction=(none|keep-inactive|deactivate-iap-on-target)$ ]] || exit 1
printf '%s\n' "$mode_line" "$profile_line" "$binding_line" "$legacy_line"
