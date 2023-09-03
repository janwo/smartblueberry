ARG BUILD_FROM
FROM $BUILD_FROM as base
RUN apk add --no-cache \
  nodejs \
  npm \ 
  curl
COPY package.json package-lock.json*  ./
RUN npm i

from base as builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
COPY --from=builder ./dist/ /dist/
COPY --from=builder ./*.json /
COPY --from=builder ./run.sh /

ENV HTTP_PORT=8099
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD curl -sS localhost:8099/healthcheck

RUN chmod +x run.sh
CMD [ "/run.sh" ]
