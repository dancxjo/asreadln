#!/bin/bash

if [ $# -gt 1 ]; then
  echo "Usage: $0 [markdown-file]"
  exit 1
fi

infile=${1:--}

awk '
BEGIN { in_chunk = 0 }
/^```/ {
  if (in_chunk == 0) {
    in_chunk = 1
    next
  } else {
    in_chunk = 0
    print ""
    next
  }
}
in_chunk { print }
' "$infile"
