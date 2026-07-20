FROM registry.access.redhat.com/ubi9/nodejs-22:latest AS build
USER root
COPY package.json package-lock.json webpack.config.ts tsconfig.json .swcrc console-extensions.json /usr/src/app/
COPY src /usr/src/app/src
WORKDIR /usr/src/app
RUN npm ci && npm run build

FROM registry.access.redhat.com/ubi9/nginx-120:latest
COPY --from=build /usr/src/app/dist /usr/share/nginx/html
USER 1001
ENTRYPOINT ["nginx", "-g", "daemon off;"]
