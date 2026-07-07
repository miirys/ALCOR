FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y curl git ca-certificates unzip && \
    curl -fsSL https://mise.run | sh && \
    rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.local/bin:$PATH"

COPY mise/config.toml /root/.config/mise/config.toml
ENV MISE_PYTHON_COMPILE=0
RUN mise install && mise reshim
ENV PATH="/root/.local/share/mise/shims:$PATH"

# Activate mise in every bash session so that tools installed at runtime
# (e.g. `npm install -g @gitlab/duo-cli`) are immediately on PATH.
# BASH_ENV is sourced by non-interactive bash (used by CI runners).
RUN mise activate bash > /root/.mise_activate.sh
ENV BASH_ENV="/root/.mise_activate.sh"
