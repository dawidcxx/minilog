{
  description = "Go + Vite dev";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:

      let
        pkgs = import nixpkgs {
          inherit system;
        };

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            go
            gopls
            bun
            entr # restart go on change

            (pkgs.writeShellScriptBin "dev" ''
              set -e
              export DATABASE_URL=postgres://logs:123@localhost/logs

              echo "starting vite"
              (cd frontend && bun run dev) &

              echo "watching go api"
              find api -name "*.go" | entr -r go run ./api
            '')

            (pkgs.writeShellScriptBin "test-api" ''
              set -euo pipefail
              export DATABASE_URL="postgres://logs:123@localhost/logs"
              go test -v -count=1 ./api
            '')

            (pkgs.writeShellScriptBin "run-checks" ''
              test-api;
              cd frontend && bun run typecheck
            '')
          ];
          shellHook = "";
        };
      }
    );
}
