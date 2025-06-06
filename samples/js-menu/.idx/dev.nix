## Default Nix Environment for Typescript + Gemini Examples
## Requires the sample to be started with npx run genkit:dev

# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use.
  channel = "stable-24.05"; # or "unstable"
  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_20
    pkgs.util-linux
  ];
  # Sets environment variables in the workspace
  env = {
    #TODO Get a API key from https://g.co/ai/idxGetGeminiKey 
    GOOGLE_GENAI_API_KEY = ""; 
  };
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
    ];

    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        npm-install = "npm ci --no-audit --prefer-offline --no-progress --timing";
        default.openFiles = [ "README.md" "src/index.ts" ];
      };
      # Runs when the workspace is (re)started
      onStart = {
        run-server = "npm run genkit:dev";      
        };
    };
  };
}