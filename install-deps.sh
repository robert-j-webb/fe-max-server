#!/usr/bin/env bash

set -e

curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env 

uv venv $HOME/.venv
source $HOME/.venv/bin/activate
uv pip install modular   --index-url https://download.pytorch.org/whl/cpu   --extra-index-url https://dl.modular.com/public/nightly/python/simple/   --index-strategy unsafe-best-match

# Download and install nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
\. "$HOME/.nvm/nvm.sh"
nvm install 22
npm install pm2@latest -g

sudo ufw allow 8080/tcp
sudo ufw allow 8000/tcp

npm i
npm run build
pm2 start dist/index.js --name "fe-max-server"
