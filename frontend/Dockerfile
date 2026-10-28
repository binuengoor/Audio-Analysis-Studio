# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
# The nginx entrypoint renders templates with envsubst at container start
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_KEY=""
ENV NGINX_ENVSUBST_FILTER="^API_KEY$"

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
