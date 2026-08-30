FROM nginx:alpine

RUN rm -rf /etc/nginx/conf.d/*

COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY frontend /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
