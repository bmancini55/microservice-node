

Start RabbitMQ
```
docker run -d -p 5672:5672 -p 15672:15672 --name rabbit1 rabbitmq
```

Start Redis
```
docker run -d -p 6379:6379 --name redis1 redis
```