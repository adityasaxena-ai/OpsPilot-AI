FROM prom/prometheus:v2.51.0

COPY apps/prometheus/prometheus.yml /etc/prometheus/prometheus.yml

EXPOSE 9090

CMD ["--config.file=/etc/prometheus/prometheus.yml", "--storage.tsdb.path=/prometheus", "--web.listen-address=0.0.0.0:9090"]
