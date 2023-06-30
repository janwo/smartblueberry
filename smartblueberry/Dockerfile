ARG BUILD_FROM
FROM $BUILD_FROM
RUN apk add --no-cache \
  nodejs \
  npm \ 
  curl

ENV HTTP_PORT=8099
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD curl -sS localhost:8099/healthcheck
COPY ./dist/ /dist/
COPY ./*.json /
RUN npm ci --omit=dev && npm cache clean --force 

COPY run.sh /
RUN chmod +x run.sh
CMD [ "/run.sh" ]
