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

              echo "starting vite"
              (cd frontend && bun run dev) &

              echo "watching go api"
              find api -name "*.go" | entr -r go run ./api
            '')
          ];
          shellHook = "";
        };
      }
    );
}
