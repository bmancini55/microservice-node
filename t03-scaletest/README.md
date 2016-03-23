# scaletest

This is a containerized version of the service infrastructure that is designed for scale testing. More info to follow...

## Running

Start a RabbitMQ container
```
docker run -d --name rabbit1 -p 5672:5672 rabbitmq
```

Start the gateway container
```
docker run -d -e "BROKER_PATH=amqp:192.168.99.100" --name ms-gateway1 -p 5050:5050 bmancini55/ms-gateway
```

Start the service container
```
docker run -d -e "BROKER_PATH=amqp:192.168.99.100" -e "SERVICE_NAME=a" -e "SERVICE_DEPS=b" --name ms-service-a1 bmancini55/ms-service
docker run -d -e "BROKER_PATH=amqp:192.168.99.100" -e "SERVICE_NAME=b" -e "SERVICE_DEPS=" --name ms-service-b1 bmancini55/ms-service
```

Issue requests to the gateway
```
http://192.168.99.100/?event=a.read
```