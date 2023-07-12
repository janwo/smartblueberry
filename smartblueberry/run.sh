#!/usr/bin/with-contenv bashio
set +u
bashio::log.info "Starting service..."
npm run backend:start:build