FROM node:24-alpine AS build
WORKDIR /app
COPY package.json ./package.json
COPY apps/api/package.json apps/api/package.json
RUN npm install --workspace @meetingflow/api
COPY apps/api apps/api
RUN npm run build -w @meetingflow/api
FROM node:24-alpine
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/main"]
