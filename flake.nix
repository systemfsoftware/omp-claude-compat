{
  description = "omp-claude-compat toolchain — the formatter and runtimes the check chain shells out to";

  nixConfig = {
    extra-substituters = "https://nix.systemfsoftware.com";
    extra-trusted-public-keys = "nix-cache-1:wXA8I4DayNW9q6enUyQA/P/nT38pGSTLt374t3gsn7M=";
    fallback = true;
  };

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    comment-checker = {
      url = "github:systemfsoftware/comment-checker";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, comment-checker }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" ];
      forEachSystem = fn: nixpkgs.lib.genAttrs systems (system: fn nixpkgs.legacyPackages.${system});
    in
    {
      packages = forEachSystem (pkgs:
        let
          dprint = pkgs.callPackage ./nix/dprint.nix { };
          cc = comment-checker.packages.${pkgs.system}.comment-checker;
          comment-checker-bwrap = pkgs.callPackage ./nix/comment-checker-bwrap.nix { comment-checker = cc; };
        in { inherit dprint comment-checker-bwrap; comment-checker = cc; default = dprint; });

      # pnpm is not a nixpkgs package: `packageManager` pins pnpm@11.21.0 and
      # corepack resolves exactly that version. The shim gives the release
      # plan a `pnpm` on PATH (`nix develop --command` runs this hook), and a
      # second, unpinned pnpm is never on PATH.
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [
            self.packages.${pkgs.stdenv.hostPlatform.system}.dprint
            self.packages.${pkgs.stdenv.hostPlatform.system}.comment-checker-bwrap
            pkgs.nodejs_24
            pkgs.deno
          ];
          shellHook = ''
            mkdir -p "$HOME/.cache/corepack-shims"
            corepack enable pnpm --install-directory "$HOME/.cache/corepack-shims"
            export PATH="$HOME/.cache/corepack-shims:$PATH"
          '';
        };
      });
    };
}
