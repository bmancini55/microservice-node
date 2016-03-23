# Extraction test

## Getting started

Start the Rabbitmq container
```
docker run -d -p 5672:5672 rabbitmq
docker run -d -p 5672:5672 -p 15672:15672 --name rabbit1 rabbitmq
```

Start the Tika container
```
docker run -d -p 9998:9998 logicalspark/docker-tikaserver
```

This assumes that you're running docker-machine with the default IP of 192.168.99.100.

You can then start each of the services:
```
docker run -d -e "BROKER_PATH=amqp://192.168.99.100" -p 5050:5050 bmancini55/ms-gateway
docker run -d -e "BROKER_PATH=amqp://192.168.99.100" -v /Users/bmancini/Downloads/:/Users/bmancini/Downloads bmancini55/ms-file
docker run -d -e "BROKER_PATH=amqp://192.168.99.100" -e "TIKA_PATH=http://192.168.99.10" bmancini55/ms-text
docker run -d -e "BROKER_PATH=amqp://192.168.99.100" bmancini55/ms-concept
```

## Running locally

On Linux you can run the following...
```
export BROKER_PATH=amqp://192.168.99.100
export TIKA_PATH=amqp://192.168.99.100

npm run start:gateway
npm run start:file-service
npm run start:text-service
```

basis-service requires the basis process to exist and can only be executed within a container.