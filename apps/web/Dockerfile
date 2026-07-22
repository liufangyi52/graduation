FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./package.json
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace @meetingflow/web
COPY apps/web apps/web
RUN npm run build -w @meetingflow/web
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
