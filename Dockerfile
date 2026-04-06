FROM node:20-alpine

RUN apk add --no-cache git python3 make g++

WORKDIR /app

COPY package.json ./

RUN npm install

COPY . .

CMD ["node", "whatsapp-bot.js"]
