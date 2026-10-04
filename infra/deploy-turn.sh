#!/bin/bash
sudo cp -r /opt/vibe/infra/turn /opt/vibe-turn
sudo chown -R opc:opc /opt/vibe-turn
cd /opt/vibe-turn
SECRET=$(openssl rand -hex 32)
echo "TURN_DOMAIN=turn.vibe.fawadiqbal.dev" > .env
echo "TURN_SECRET=$SECRET" >> .env
echo "TURN_TLS_PORT=5349" >> .env
echo "TURN_EXTERNAL_IP=auto" >> .env
echo "CERT_EMAIL=fawadeqbal@gmail.com" >> .env
sudo sh install-cert.sh
docker compose up -d

# Now update the main API env
cd /opt/vibe
sed -i "s/TURN_SECRET=.*/TURN_SECRET=$SECRET/g" .env
sed -i "s/TURN_URLS=.*/TURN_URLS=turn:turn.vibe.fawadiqbal.dev:3478?transport=udp,turn:turn.vibe.fawadiqbal.dev:3478?transport=tcp,turns:turn.vibe.fawadiqbal.dev:5349?transport=tcp/g" .env
docker compose restart vibe-api
