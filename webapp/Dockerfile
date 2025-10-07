FROM node:18-alpine AS build
WORKDIR /app

ARG VITE_API_BASE_URL=http://localhost:8000/api/v1
ARG VITE_BOT_USERNAME=your_bot_username

ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_BOT_USERNAME=${VITE_BOT_USERNAME}

COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:1.25-alpine

# Cache-buster for nginx config
ARG NGINX_CONF_VERSION=20251002-2

COPY --from=build /app/dist /usr/share/nginx/html

# Remove default configs and copy our own
RUN rm -f /etc/nginx/conf.d/*
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
