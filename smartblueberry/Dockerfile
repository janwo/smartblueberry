ARG BUILD_FROM
FROM $BUILD_FROM as base
RUN apk add --no-cache \
  nodejs \
  npm \ 
  curl

WORKDIR /home
COPY package*.json run.sh /home/

RUN chmod +x run.sh
RUN npm i --only=production
CMD [ "./run.sh" ]

from base as builder
COPY --from=base /home /home
COPY . .

RUN npm i 
RUN npm run frontend:build && npm run backend:build

FROM base AS runner
COPY --from=base /home /home
COPY --from=builder /home/dist /home/dist

ENV HTTP_PORT=8099
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD curl -sS localhost:8099/healthcheck
