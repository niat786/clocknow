# Build from the repo root: fly deploy . --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
FROM rust:1-slim-bookworm AS build
WORKDIR /src
COPY Cargo.toml Cargo.lock ./
COPY crates ./crates
COPY apps/api ./apps/api
RUN cargo build --release --locked -p api

# Minimal runtime: no shell, non-root. tzdata is bundled into the binary by jiff.
FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /src/target/release/api /api
ENV PORT=8787
EXPOSE 8787
ENTRYPOINT ["/api"]
