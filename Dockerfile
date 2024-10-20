FROM node:20-alpine3.19

WORKDIR /app

COPY . /app/

RUN npm ci

RUN apk add rclone

# RUN curl https://rclone.org/install.sh
# CMD []

ENTRYPOINT ["node", "app.js"]