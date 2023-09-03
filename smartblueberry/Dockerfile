ARG BUILD_FROM
FROM $BUILD_FROM as base
RUN apk add --no-cache \
  nodejs \
  npm \ 
  curl

WORKDIR /home
COPY package*.json /home
RUN npm i

from base as builder
COPY --from=base /home/node_modules /home/node_modules
COPY . .

RUN npm run frontend:build && npm run backend:build

FROM base AS runner
COPY --from=builder /home /home
COPY --from=builder /home/*.json /home
COPY --from=builder /home/run.sh /home

ENV HTTP_PORT=8099
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD curl -sS localhost:8099/healthcheck

RUN chmod +x run.sh
CMD [ "./run.sh" ]
