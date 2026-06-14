#!/bin/bash
# Prints the handoff template reminder when a session ends
cat << 'EOF'

--- SONGSCRAPER HANDOFF ---
SHIPPED      [what was completed]
TESTS        [passing / failing / count]
PUSHED       [commit hash or "not pushed — reason"]
NEXT SESSION [the exact next task — not "continue the work"]
DISCOVERIES  [UG markup changes, dependency updates, techniques found this session]
HEALTH       [Green / Yellow / Red — one line]
EOF
