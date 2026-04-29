#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/dev/Project/devatlas"
OLLAMA_MODELS="/media/dev/38588EDB588E96F2/Users/dev13/.ollama/models"
LOCAL_BIN="${HOME}/.local/bin"
SYSTEMD_USER_DIR="${HOME}/.config/systemd/user"

mkdir -p "${LOCAL_BIN}" "${SYSTEMD_USER_DIR}"

cat > "${LOCAL_BIN}/ollama-devatlas" <<EOF
#!/usr/bin/env bash
export OLLAMA_MODELS="${OLLAMA_MODELS}"
export OLLAMA_VULKAN=1
exec /home/dev/.local/bin/ollama "\$@"
EOF
chmod +x "${LOCAL_BIN}/ollama-devatlas"

cat > "${LOCAL_BIN}/ollama-devatlas-serve" <<EOF
#!/usr/bin/env bash
export OLLAMA_MODELS="${OLLAMA_MODELS}"
export OLLAMA_VULKAN=1
exec /home/dev/.local/bin/ollama serve "\$@"
EOF
chmod +x "${LOCAL_BIN}/ollama-devatlas-serve"

cat > "${SYSTEMD_USER_DIR}/devatlas-ollama.service" <<EOF
[Unit]
Description=DevAtlas Ollama Vulkan service
After=network.target

[Service]
ExecStart=%h/.local/bin/ollama-devatlas-serve
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

cat > "${SYSTEMD_USER_DIR}/devatlas-llama-chat.service" <<EOF
[Unit]
Description=DevAtlas llama.cpp local chat service
After=devatlas-ollama.service

[Service]
Type=simple
WorkingDirectory=${ROOT}
EnvironmentFile=-${ROOT}/.env.local
ExecStart=/usr/bin/env pnpm agent:local:chat
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

cat > "${SYSTEMD_USER_DIR}/devatlas-llama-embed.service" <<EOF
[Unit]
Description=DevAtlas llama.cpp local embedding service
After=devatlas-ollama.service

[Service]
Type=simple
WorkingDirectory=${ROOT}
EnvironmentFile=-${ROOT}/.env.local
ExecStart=/usr/bin/env pnpm agent:local:embed
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

cat > "${SYSTEMD_USER_DIR}/devatlas-offline-health.service" <<EOF
[Unit]
Description=DevAtlas offline AI smoke check
After=devatlas-ollama.service devatlas-llama-chat.service devatlas-llama-embed.service

[Service]
Type=oneshot
WorkingDirectory=${ROOT}
EnvironmentFile=-${ROOT}/.env.local
ExecStart=/usr/bin/env pnpm agent:local:smoke
EOF

cat > "${SYSTEMD_USER_DIR}/devatlas-offline-health.timer" <<EOF
[Unit]
Description=Run DevAtlas offline AI smoke check every 30 minutes

[Timer]
OnBootSec=3m
OnUnitActiveSec=30m
Unit=devatlas-offline-health.service

[Install]
WantedBy=timers.target
EOF

cat > "${SYSTEMD_USER_DIR}/devatlas-offline-review.service" <<EOF
[Unit]
Description=DevAtlas offline local review task
After=devatlas-ollama.service

[Service]
Type=oneshot
WorkingDirectory=${ROOT}
EnvironmentFile=-${ROOT}/.env.local
ExecStart=/usr/bin/env bash -lc 'pnpm agent:devflow review --diff head || true'
EOF

cat > "${SYSTEMD_USER_DIR}/devatlas-offline-review.timer" <<EOF
[Unit]
Description=Run DevAtlas offline review once per day

[Timer]
OnBootSec=10m
OnCalendar=daily
Unit=devatlas-offline-review.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now devatlas-ollama.service
systemctl --user enable --now devatlas-llama-chat.service
systemctl --user enable --now devatlas-llama-embed.service
systemctl --user enable --now devatlas-offline-health.timer
systemctl --user enable --now devatlas-offline-review.timer

git config core.hooksPath .githooks

echo "Installed offline AI services and timers."
systemctl --user --no-pager --full status devatlas-ollama.service devatlas-llama-chat.service || true
systemctl --user list-timers --all | grep 'devatlas-offline-' || true
