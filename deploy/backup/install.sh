#!/usr/bin/env bash
# Install the nightly backup as a systemd timer. Run once, as root, from the
# OpenChar checkout on a Linux host:   sudo bash deploy/backup/install.sh
# Idempotent: re-running refreshes the units.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cat > /etc/systemd/system/openchar-backup.service <<UNIT
[Unit]
Description=OpenChar nightly backup (Postgres + evidence files)
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
ExecStart=/bin/bash $ROOT/deploy/backup/backup.sh
UNIT
cat > /etc/systemd/system/openchar-backup.timer <<'UNIT'
[Unit]
Description=Run the OpenChar backup every night

[Timer]
# Pick an hour outside plant shifts; this is 02:00 at UTC+5:30.
OnCalendar=*-*-* 20:30:00 UTC
# A night missed while the machine was down runs at the next boot.
Persistent=true
RandomizedDelaySec=10min

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now openchar-backup.timer >/dev/null
echo "backup timer installed: $(systemctl list-timers openchar-backup.timer --no-legend | head -1)"
